// The Home tab against a real (in-memory) database: the header counts, the
// latest-sessions list and what each row says, the shape filter, and the
// empty state.
import { fireEvent, screen, within } from '@testing-library/react-native';

import HomeScreen from '@/app/(tabs)/index';
import { createFirearm } from '@/db/queries/firearms';
import { saveSeriesShots, setSessionExtraRounds } from '@/db/queries/round-count';
import { addSeries } from '@/db/queries/series';
import { createSession, type CreateSessionInput } from '@/db/queries/sessions';
import type { Database } from '@/db/types';
import { renderWithProviders } from '@/test-utils/render';
import { mockRouter } from '@/test-utils/router-mock';
import { resetTestDb } from '@/test-utils/test-db-client';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('expo-router', () => require('@/test-utils/router-mock').expoRouterMock);
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);

let db: Database;

beforeEach(() => {
  jest.useFakeTimers({
    now: new Date('2026-06-20T10:00:00.000Z'),
    doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
  });
  jest.clearAllMocks();
  db = resetTestDb();
});

afterEach(() => {
  jest.useRealTimers();
});

function session(name: string, startedAt: string, overrides: Partial<CreateSessionInput> = {}) {
  return createSession(db, {
    name,
    type: 'training',
    disciplineId: 'spsf-precision',
    weaponGroup: 'spsf:C',
    startedAt,
    ...overrides,
  });
}

/** A scored series; `inner` marks that many leading tens as inner tens. */
function series(sessionId: string, position: number, values: number[], inner = 0) {
  const row = addSeries(db, { sessionId, position });
  saveSeriesShots(
    db,
    row.id,
    values.map((value, index) => ({ valueTenths: value * 10, isInnerTen: index < inner })),
  );
}

function stat(testID: string) {
  return screen.getByTestId(testID);
}

describe('Home', () => {
  it('invites the first session when there are none', async () => {
    await renderWithProviders(<HomeScreen />);

    expect(screen.getByText('No Sessions Yet')).toBeOnTheScreen();
    expect(stat('home-stat-shots-logged')).toHaveTextContent(/0/);
    expect(stat('home-stat-sessions')).toHaveTextContent(/0/);
    expect(screen.queryByText('Latest Sessions')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Log Your First Session' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/session/new');
  });

  it('counts shots, sessions and competitions', async () => {
    const training = session('Tuesday training', '2026-06-02T16:00:00.000Z');
    series(training.id, 1, [10, 9, 9, 8, 8]);
    const match = session('Club match', '2026-06-06T08:00:00.000Z', { type: 'competition' });
    series(match.id, 1, [10, 10, 9, 9, 9]);
    const rounds = session('Plinking', '2026-06-07T08:00:00.000Z', { kind: 'rounds' });
    setSessionExtraRounds(db, rounds.id, 50);

    await renderWithProviders(<HomeScreen />);

    expect(stat('home-stat-shots-logged')).toHaveTextContent('60Shots Logged');
    expect(stat('home-stat-sessions')).toHaveTextContent('3Sessions');
    expect(stat('home-stat-competitions')).toHaveTextContent('1Competitions');
  });

  it('lists sessions newest first with total, series average and inner tens', async () => {
    const older = session('Tuesday training', '2026-06-02T16:00:00.000Z');
    series(older.id, 1, [10, 10, 9, 9, 8], 1);
    series(older.id, 2, [10, 9, 9, 8, 8]);
    const newer = session('Club match', '2026-06-06T08:00:00.000Z', { type: 'competition' });
    series(newer.id, 1, [10, 10, 10, 9, 9], 2);

    await renderWithProviders(<HomeScreen />);

    const first = screen.getByTestId('home-session-0');
    expect(first).toHaveTextContent(/Club match/);
    expect(first).toHaveTextContent(/48p · ⌀ 48\.0 · 2X/);
    expect(within(first).getByText('Competition')).toBeOnTheScreen();

    const second = screen.getByTestId('home-session-1');
    expect(second).toHaveTextContent(/Tuesday training/);
    expect(second).toHaveTextContent(/90p · ⌀ 45\.0 · 1X/);
    expect(within(second).getByText('Training')).toBeOnTheScreen();
  });

  it('omits average and inner tens for a session with nothing scored', async () => {
    session('Empty evening', '2026-06-02T16:00:00.000Z');

    await renderWithProviders(<HomeScreen />);

    const row = screen.getByTestId('home-session-0');
    expect(row).toHaveTextContent(/0p/);
    expect(row).not.toHaveTextContent(/⌀/);
    expect(row).not.toHaveTextContent(/0X/);
  });

  it('shows the ten latest and links to all of them', async () => {
    for (let day = 1; day <= 12; day++) {
      session(`Session ${day}`, `2026-06-${String(day).padStart(2, '0')}T16:00:00.000Z`);
    }

    await renderWithProviders(<HomeScreen />);

    expect(screen.getByTestId('home-session-0')).toHaveTextContent(/Session 12/);
    expect(screen.getByTestId('home-session-9')).toHaveTextContent(/Session 3/);
    expect(screen.queryByTestId('home-session-10')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'See all 12' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/sessions');
  });

  it('opens a session when its row is tapped', async () => {
    const only = session('Tuesday training', '2026-06-02T16:00:00.000Z');

    await renderWithProviders(<HomeScreen />);
    await fireEvent.press(screen.getByTestId('home-session-0'));

    expect(mockRouter.push).toHaveBeenCalledWith(`/session/${only.id}`);
  });

  it('filters the list by how the session was logged', async () => {
    const scored = session('Scored evening', '2026-06-02T16:00:00.000Z');
    series(scored.id, 1, [9, 9, 9, 9, 9]);
    const firearm = createFirearm(db, { make: 'Acme', model: 'Target 22', isOwn: true });
    const rounds = session('Plinking', '2026-06-03T16:00:00.000Z', {
      kind: 'rounds',
      firearmId: firearm.id,
    });
    setSessionExtraRounds(db, rounds.id, 100);

    await renderWithProviders(<HomeScreen />);
    expect(screen.getByTestId('home-session-1')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('radio', { name: 'Rounds' }));
    expect(screen.getByTestId('home-session-0')).toHaveTextContent(/Plinking/);
    expect(screen.queryByTestId('home-session-1')).toBeNull();

    await fireEvent.press(screen.getByRole('radio', { name: 'Series' }));
    expect(screen.getByTestId('home-session-0')).toHaveTextContent(/Scored evening/);
    expect(screen.queryByTestId('home-session-1')).toBeNull();
  });

  it('says so when no session matches the filter', async () => {
    const scored = session('Scored evening', '2026-06-02T16:00:00.000Z');
    series(scored.id, 1, [9, 9, 9, 9, 9]);

    await renderWithProviders(<HomeScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Rounds' }));

    expect(screen.getByText('No sessions match this filter')).toBeOnTheScreen();
    expect(screen.queryByTestId('home-session-0')).toBeNull();
  });
});
