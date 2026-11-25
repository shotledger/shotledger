// Account & Sync's list of refused changes, with Discard
// (docs/specs/sync-discard-refused-spec.md §2.3, §2.6; scenarios LIST, CTX,
// GONE, CANCEL).
import { fireEvent, screen } from '@testing-library/react-native';
import type { BadRow } from '@shotledger/shared';
import { Alert } from 'react-native';

import { renderWithProviders } from '@/test-utils/render';

import { RefusedChanges } from './refused-changes';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);

const shot: BadRow = {
  tableName: 'shots',
  rowId: 'T2',
  waiting: 2,
  held: true,
  root: { tableName: 'sessions', rowId: 'S1' },
  context: { kind: 'session', name: 'Kväll', startedAt: '2026-11-20T18:00:00.000Z' },
  role: 'member',
};
const lost: BadRow = {
  tableName: 'licenses',
  rowId: 'L1',
  waiting: 0,
  held: false,
  root: null,
  context: null,
  role: 'other',
};
const session: BadRow = {
  ...shot,
  tableName: 'sessions',
  rowId: 'S1',
  waiting: 1,
  context: { kind: 'session', name: null, startedAt: '2026-11-20T18:00:00.000Z' },
  role: 'root',
};

let alert: jest.SpyInstance;
beforeEach(() => {
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => alert.mockRestore());

type AlertButton = { text: string; style?: string; onPress?: () => void };
const lastButtons = () => alert.mock.calls.at(-1)![2] as AlertButton[];

describe('RefusedChanges', () => {
  it('lists nothing when nothing is refused', async () => {
    await renderWithProviders(<RefusedChanges rows={[]} onDiscard={jest.fn()} />);
    expect(screen.queryByTestId('refused-row-shots-T2')).toBeNull();
  });

  it('LIST/CTX names each bad row by kind and session, with its waiting count', async () => {
    await renderWithProviders(<RefusedChanges rows={[shot, lost]} onDiscard={jest.fn()} />);
    const row = screen.getByTestId('refused-row-shots-T2');
    expect(row).toHaveTextContent(/Shot · Kväll, /);
    expect(row).toHaveTextContent(/2 changes wait on it/);
    expect(screen.getByTestId('refused-row-licenses-L1')).toHaveTextContent(/License/);
  });

  it('CTX-NONAME a session with no name shows its date alone', async () => {
    await renderWithProviders(<RefusedChanges rows={[session]} onDiscard={jest.fn()} />);
    expect(screen.getByTestId('refused-row-sessions-S1')).toHaveTextContent(
      /Session · \d|Session · [A-Za-z]{3}/,
    );
    expect(screen.getByTestId('refused-row-sessions-S1')).toHaveTextContent(/1 change waits on it/);
  });

  it('GONE a row not on this device says so, and still offers Discard', async () => {
    await renderWithProviders(<RefusedChanges rows={[lost]} onDiscard={jest.fn()} />);
    expect(screen.getByTestId('refused-row-licenses-L1')).toHaveTextContent(/Not on this device/);
    expect(screen.getByTestId('refused-discard-licenses-L1')).toBeTruthy();
  });

  it('confirms before discarding a session member, naming what happens to the rest', async () => {
    const onDiscard = jest.fn();
    await renderWithProviders(<RefusedChanges rows={[shot]} onDiscard={onDiscard} />);
    await fireEvent.press(screen.getByTestId('refused-discard-shots-T2'));
    expect(onDiscard).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      'Discard Refused Change?',
      'This deletes the refused change on all your devices, and any older version the server stores.\n\nThe rest of the session will sync without it.',
      expect.any(Array),
    );
    lastButtons().find((b) => b.style === 'destructive')!.onPress!();
    expect(onDiscard).toHaveBeenCalledWith(shot);
  });

  it('a root says everything that belongs to it goes too', async () => {
    await renderWithProviders(<RefusedChanges rows={[session]} onDiscard={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('refused-discard-sessions-S1'));
    expect(alert.mock.calls.at(-1)![1]).toMatch(
      /\n\nEverything that belongs to it is deleted with it\.$/,
    );
  });

  it('a row of no session and no root adds nothing to the confirm', async () => {
    await renderWithProviders(<RefusedChanges rows={[lost]} onDiscard={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('refused-discard-licenses-L1'));
    expect(alert.mock.calls.at(-1)![1]).toBe(
      'This deletes the refused change on all your devices, and any older version the server stores.',
    );
  });

  it('CANCEL cancelling sends nothing', async () => {
    const onDiscard = jest.fn();
    await renderWithProviders(<RefusedChanges rows={[shot]} onDiscard={onDiscard} />);
    await fireEvent.press(screen.getByTestId('refused-discard-shots-T2'));
    lastButtons()
      .find((b) => b.style === 'cancel')
      ?.onPress?.();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it('shows a failed discard under its row, and disables Discard while one runs', async () => {
    await renderWithProviders(
      <RefusedChanges
        rows={[shot, lost]}
        onDiscard={jest.fn()}
        failed={['shots:T2']}
        busy="licenses:L1"
      />,
    );
    expect(screen.getByTestId('refused-row-shots-T2')).toHaveTextContent(
      /Couldn't discard the change\. Try again\./,
    );
    expect(screen.getByTestId('refused-discard-licenses-L1')).toBeDisabled();
    expect(screen.getByTestId('refused-discard-shots-T2')).toBeDisabled();
  });
});
