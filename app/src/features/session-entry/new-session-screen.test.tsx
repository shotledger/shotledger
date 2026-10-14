// New Session (#822, finding "Long forms"): the discipline and firearm come
// from the last session, the optional fields sit under Details, and nothing
// the form could record before is lost.
import { fireEvent, screen } from '@testing-library/react-native';

import { archiveFirearm, createFirearm } from '@/db/queries/firearms';
import { createSession, getSession, listSessions } from '@/db/queries/sessions';
import type { Database } from '@/db/types';
import { renderWithProviders } from '@/test-utils/render';
import { mockRouter } from '@/test-utils/router-mock';
import { resetTestDb } from '@/test-utils/test-db-client';

import NewSessionScreen from '@/app/session/new';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('expo-router', () => require('@/test-utils/router-mock').expoRouterMock);
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);

let db: Database;

beforeEach(() => {
  jest.clearAllMocks();
  db = resetTestDb();
});

async function create() {
  await fireEvent.press(screen.getByRole('button', { name: 'Create Session' }));
  const id = (mockRouter.replace.mock.calls[0]![0] as string).split('/').pop()!;
  return getSession(db, id)!;
}

describe('New Session', () => {
  it('starts on the first-run defaults when there is no session yet', async () => {
    await renderWithProviders(<NewSessionScreen />);

    expect(screen.queryByTestId('from-last-session')).toBeNull();
    const session = await create();
    expect(session.disciplineId).toBe('spsf-precision');
    expect(session.firearmId).toBeNull();
  });

  it('preselects the discipline and firearm of the last session', async () => {
    const firearm = createFirearm(db, { make: 'Acme', model: 'Target 22', isOwn: true });
    createSession(db, {
      name: 'Older',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: '2026-05-01T09:00:00.000Z',
    });
    createSession(db, {
      name: 'Latest',
      type: 'training',
      disciplineId: 'spsf-milsnabb',
      firearmId: firearm.id,
      startedAt: '2026-05-10T09:00:00.000Z',
    });
    await renderWithProviders(<NewSessionScreen />);

    expect(screen.getByTestId('from-last-session')).toBeOnTheScreen();
    expect(screen.getByTestId('discipline-spsf-milsnabb')).toBeSelected();
    expect(screen.getByTestId(`firearm-${firearm.id}`)).toBeSelected();
    const session = await create();
    expect(session.disciplineId).toBe('spsf-milsnabb');
    expect(session.firearmId).toBe(firearm.id);
  });

  it('does not preselect an archived firearm', async () => {
    const firearm = createFirearm(db, { make: 'Acme', model: 'Old', isOwn: true });
    createSession(db, {
      name: 'Latest',
      type: 'training',
      disciplineId: 'spsf-precision',
      firearmId: firearm.id,
      startedAt: '2026-05-10T09:00:00.000Z',
    });
    archiveFirearm(db, firearm.id);
    await renderWithProviders(<NewSessionScreen />);

    const session = await create();
    expect(listSessions(db)).toHaveLength(2);
    expect(session.firearmId).toBeNull();
  });

  it('folds the optional fields under Details and still records them', async () => {
    await renderWithProviders(<NewSessionScreen />);

    const details = screen.getByRole('button', { name: /^Details/ });
    expect(details).toHaveProp('accessibilityState', { expanded: false });
    await fireEvent.press(details);
    expect(details).toHaveProp('accessibilityState', { expanded: true });

    await fireEvent.changeText(screen.getByTestId('session-name'), 'Evening practice');
    await fireEvent.press(screen.getByTestId('kind-rounds'));
    await fireEvent.changeText(screen.getByTestId('rounds-fired'), '40');
    const session = await create();
    expect(session.name).toBe('Evening practice');
    expect(session.kind).toBe('rounds');
    expect(session.extraRounds).toBe(40);
  });
});
