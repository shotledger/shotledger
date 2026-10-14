// The series entry screen against a real (in-memory) database: what it shows
// for a session's state, and what Save leaves behind — shots, a series row
// only when there is something to keep, the sighter rule, and the firearm's
// round counter.
import { fireEvent, screen } from '@testing-library/react-native';

import { createFirearm, getFirearm } from '@/db/queries/firearms';
import { addSeries, listSeriesForSession } from '@/db/queries/series';
import { createSession } from '@/db/queries/sessions';
import { setSetting, SETTINGS_KEYS } from '@/db/queries/settings';
import { listShotsForSeries } from '@/db/queries/shots';
import { saveSeriesShots } from '@/db/queries/round-count';
import type { Database } from '@/db/types';
import { renderWithProviders } from '@/test-utils/render';
import { mockRouter, setSearchParams } from '@/test-utils/router-mock';
import { resetTestDb } from '@/test-utils/test-db-client';

import SeriesEntryScreen from '@/app/session/[id]/series/[pos]';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('expo-router', () => require('@/test-utils/router-mock').expoRouterMock);
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);
jest.mock('@/features/session/pick-photo', () => ({ pickSeriesPhoto: jest.fn() }));

const STARTED_AT = '2026-05-16T09:00:00.000Z';

let db: Database;

beforeEach(() => {
  jest.useFakeTimers({
    now: new Date('2026-05-16T10:00:00.000Z'),
    doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
  });
  jest.clearAllMocks();
  db = resetTestDb();
});

afterEach(() => {
  jest.useRealTimers();
});

function precisionSession(overrides: Partial<Parameters<typeof createSession>[1]> = {}) {
  return createSession(db, {
    name: 'Tuesday training',
    type: 'training',
    disciplineId: 'spsf-precision',
    weaponGroup: 'spsf:C',
    startedAt: STARTED_AT,
    ...overrides,
  });
}

async function openSeries(sessionId: string, pos: number, extra: Record<string, string> = {}) {
  setSearchParams({ id: sessionId, pos: String(pos), ...extra });
  await renderWithProviders(<SeriesEntryScreen />);
}

async function tap(...keys: string[]) {
  for (const key of keys) await fireEvent.press(screen.getByTestId(`key-${key}`));
}

async function save() {
  await fireEvent.press(screen.getByRole('button', { name: 'Save Series' }));
}

function storedShots(sessionId: string) {
  return listSeriesForSession(db, sessionId).map((row) =>
    listShotsForSeries(db, row.id).map((shot) => ({
      value: shot.valueTenths,
      inner: shot.isInnerTen === 1,
    })),
  );
}

describe('a new series', () => {
  it('shows the series number, five chips and the unsaved hint', async () => {
    const session = precisionSession();
    await openSeries(session.id, 1, { new: '1' });

    expect(screen.getByText('Series 1')).toBeOnTheScreen();
    expect(screen.getByTestId('shot-5')).toBeOnTheScreen();
    expect(screen.queryByTestId('shot-6')).toBeNull();
    expect(
      screen.getByText('This series is saved when you tap Save Series or Next Series.'),
    ).toBeOnTheScreen();
  });

  it('takes the series length chosen for the session', async () => {
    const session = precisionSession({ seriesLength: 10 });
    await openSeries(session.id, 1, { new: '1' });

    expect(screen.getByTestId('shot-10')).toBeOnTheScreen();
    expect(screen.queryByTestId('shot-11')).toBeNull();
  });

  it('keeps nothing when saved empty', async () => {
    const session = precisionSession();
    await openSeries(session.id, 1, { new: '1' });

    await save();

    expect(listSeriesForSession(db, session.id)).toHaveLength(0);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('saves the entered shots in order, inner tens marked', async () => {
    const session = precisionSession();
    await openSeries(session.id, 1, { new: '1' });

    await tap('X', '10', '9', '8');
    expect(screen.getByTestId('series-running-total')).toHaveTextContent('37');
    await save();

    expect(storedShots(session.id)).toEqual([
      [
        { value: 100, inner: true },
        { value: 100, inner: false },
        { value: 90, inner: false },
        { value: 80, inner: false },
      ],
    ]);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('saves no more shots than the series holds', async () => {
    const session = precisionSession();
    await openSeries(session.id, 1, { new: '1' });

    await tap('9', '9', '9', '9', '9', '10', '10');
    await save();

    expect(storedShots(session.id)[0]).toHaveLength(5);
    expect(storedShots(session.id)[0]!.every((shot) => shot.value === 90)).toBe(true);
  });

  it('saves decimal shots in tenths', async () => {
    const session = precisionSession({ decimalScoring: true });
    await openSeries(session.id, 1, { new: '1' });

    await tap('10', '6', 'X', '9');
    await save();

    expect(storedShots(session.id)).toEqual([
      [
        { value: 106, inner: false },
        { value: 109, inner: true },
      ],
    ]);
  });

  it('counts the saved shots on the session firearm', async () => {
    const firearm = createFirearm(db, { make: 'Acme', model: 'Target 22', isOwn: true });
    const session = precisionSession({ firearmId: firearm.id });
    await openSeries(session.id, 1, { new: '1' });

    await tap('8', '8', '8');
    await save();

    expect(getFirearm(db, firearm.id)?.roundCount).toBe(3);
  });

  it('can be saved as an empty sighter', async () => {
    const session = precisionSession();
    await openSeries(session.id, 1, { new: '1' });

    await fireEvent.press(screen.getByTestId('series-sighter-toggle'));
    expect(screen.getByRole('switch', { name: 'Mark as Sighter' })).toBeChecked();
    await save();

    const rows = listSeriesForSession(db, session.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.isSighter).toBe(1);
  });
});

describe('the gold-series hint', () => {
  it('shows the group C threshold for a five-shot precision series', async () => {
    const session = precisionSession();
    await openSeries(session.id, 1, { new: '1' });

    expect(screen.getByText('Gold at 46 pts')).toBeOnTheScreen();
  });

  it('applies the age reduction from the stored birth year', async () => {
    // 2026 - 1966 = 60: past 55, one point off (SHB Bilaga 1 mom 5.1.1.1).
    setSetting(db, SETTINGS_KEYS.birthYear, 1966);
    const session = precisionSession();
    await openSeries(session.id, 1, { new: '1' });

    expect(screen.getByText('Gold at 45 pts')).toBeOnTheScreen();
  });

  it('is absent when the series is not five shots', async () => {
    const session = precisionSession({ seriesLength: 10 });
    await openSeries(session.id, 1, { new: '1' });

    expect(screen.queryByTestId('guld-hint')).toBeNull();
  });

  it('is absent for a sighter', async () => {
    const session = precisionSession();
    await openSeries(session.id, 1, { new: '1' });

    await fireEvent.press(screen.getByTestId('series-sighter-toggle'));

    expect(screen.queryByTestId('guld-hint')).toBeNull();
  });
});

describe('an existing series', () => {
  function seededSeries(sessionId: string, position: number, values: number[]) {
    const row = addSeries(db, { sessionId, position });
    saveSeriesShots(
      db,
      row.id,
      values.map((valueTenths) => ({ valueTenths, isInnerTen: false })),
    );
    return row;
  }

  it('opens with its stored shots and total, without the unsaved hint', async () => {
    const session = precisionSession();
    seededSeries(session.id, 1, [100, 90, 80]);
    await openSeries(session.id, 1);

    expect(screen.getByTestId('shot-1')).toHaveTextContent('10');
    expect(screen.getByTestId('shot-3')).toHaveTextContent('8');
    expect(screen.getByTestId('series-running-total')).toHaveTextContent('27');
    expect(screen.queryByTestId('unsaved-series-hint')).toBeNull();
  });

  it('saves an edit in place and moves the firearm counter by the difference', async () => {
    const firearm = createFirearm(db, { make: 'Acme', model: 'Target 22', isOwn: true });
    const session = precisionSession({ firearmId: firearm.id });
    seededSeries(session.id, 1, [100, 90, 80]);
    expect(getFirearm(db, firearm.id)?.roundCount).toBe(3);
    await openSeries(session.id, 1);

    await tap('7', '6');
    await save();

    expect(listSeriesForSession(db, session.id)).toHaveLength(1);
    expect(storedShots(session.id)[0]!.map((shot) => shot.value)).toEqual([100, 90, 80, 70, 60]);
    expect(getFirearm(db, firearm.id)?.roundCount).toBe(5);
  });

  it('hides the sighter option once another series is the sighter', async () => {
    const session = precisionSession();
    addSeries(db, { sessionId: session.id, position: 1, isSighter: true });
    await openSeries(session.id, 2, { new: '1' });

    expect(screen.queryByTestId('series-sighter-toggle')).toBeNull();
    expect(screen.queryByText('Mark as Sighter')).toBeNull();
  });

  it('lets the sighter series itself turn the flag off', async () => {
    const session = precisionSession();
    addSeries(db, { sessionId: session.id, position: 1, isSighter: true });
    await openSeries(session.id, 1);

    await fireEvent.press(screen.getByTestId('series-sighter-toggle'));
    await save();

    expect(listSeriesForSession(db, session.id)[0]!.isSighter).toBe(0);
  });
});

describe('the range layout (#822)', () => {
  function seeded(sessionId: string, position: number, values: number[], extra = {}) {
    const row = addSeries(db, { sessionId, position, ...extra });
    saveSeriesShots(
      db,
      row.id,
      values.map((valueTenths) => ({ valueTenths, isInnerTen: valueTenths === 100 })),
    );
    return row;
  }

  it('shows the inner tens even when there are none', async () => {
    const session = precisionSession();
    await openSeries(session.id, 1, { new: '1' });

    expect(screen.getByTestId('series-inner-tens')).toHaveTextContent('0X');
    await tap('X', '9');
    expect(screen.getByTestId('series-inner-tens')).toHaveTextContent('1X');
  });

  it('keeps a live session total that counts the series on the keypad', async () => {
    const session = precisionSession();
    seeded(session.id, 1, [90, 90, 90, 90, 90]);
    await openSeries(session.id, 2, { new: '1' });

    expect(screen.getByTestId('session-running-total')).toHaveTextContent('45');
    await tap('10', '8');
    expect(screen.getByTestId('session-running-total')).toHaveTextContent('63');
  });

  it('leaves a sighter out of the session total', async () => {
    const session = precisionSession();
    seeded(session.id, 1, [90, 90]);
    await openSeries(session.id, 2, { new: '1' });

    await fireEvent.press(screen.getByTestId('series-sighter-toggle'));
    await tap('10');

    expect(screen.getByTestId('session-running-total')).toHaveTextContent('18');
  });

  it('does not move on after the last shot; Next Series saves and opens the next', async () => {
    const session = precisionSession();
    await openSeries(session.id, 1, { new: '1' });

    await tap('9', '9', '9', '9', '9');
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Next Series' }));

    expect(storedShots(session.id)).toHaveLength(1);
    expect(mockRouter.replace).toHaveBeenCalledWith(`/session/${session.id}/series/2?new=1`);
  });

  it('cannot move on from a blank new series', async () => {
    const session = precisionSession();
    await openSeries(session.id, 1, { new: '1' });

    await fireEvent.press(screen.getByRole('button', { name: 'Next Series' }));

    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(listSeriesForSession(db, session.id)).toHaveLength(0);
  });

  it('ends a fixed format at its last series with Save Series alone', async () => {
    const session = precisionSession({ disciplineId: 'spsf-milsnabb', programId: 'spsf-milsnabb' });
    for (let position = 1; position <= 3; position++) {
      addSeries(db, { sessionId: session.id, position });
    }
    await openSeries(session.id, 3);

    expect(screen.queryByRole('button', { name: 'Next Series' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save Series' })).toBeOnTheScreen();
  });

  it('shows last time for the same scored series of the previous session', async () => {
    const previous = precisionSession({ startedAt: '2026-05-09T09:00:00.000Z' });
    seeded(previous.id, 1, [80, 80], { isSighter: true });
    seeded(previous.id, 2, [100, 90, 90, 90, 90]);
    seeded(previous.id, 3, [80, 80, 80, 80, 80]);
    // Today's sighter is at position 1 too, so series 2 is the first scored one both times.
    const session = precisionSession();
    seeded(session.id, 1, [90, 90], { isSighter: true });
    await openSeries(session.id, 2, { new: '1' });

    expect(screen.getByTestId('last-time')).toHaveTextContent('461XLast Time');
  });

  it('shows no last time for the first session of a discipline', async () => {
    const session = precisionSession();
    await openSeries(session.id, 1, { new: '1' });

    expect(screen.queryByTestId('last-time')).toBeNull();
  });
});
