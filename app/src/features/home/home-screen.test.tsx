// The Home tab against a real (in-memory) database (#822, direction A): the
// Start action from the last session, the last session's result, the recent
// list and what each row says, and the empty state.
import { fireEvent, screen, within } from '@testing-library/react-native';

import HomeScreen from '@/app/(tabs)/index';
import { createFirearm } from '@/db/queries/firearms';
import { saveSeriesShots, setSessionExtraRounds } from '@/db/queries/round-count';
import { addSeries } from '@/db/queries/series';
import { createSession, type CreateSessionInput } from '@/db/queries/sessions';
import { addSessionTag, getOrCreateTag } from '@/db/queries/tags';
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

function tag(sessionId: string, name: string) {
  addSessionTag(db, sessionId, getOrCreateTag(db, name).id);
}

describe('Home', () => {
  it('invites the first session when there are none', async () => {
    await renderWithProviders(<HomeScreen />);

    expect(screen.getByText('No Sessions Yet')).toBeOnTheScreen();
    expect(screen.queryByTestId('home-start')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Log Your First Session' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/session/new');
  });

  it('leads with Start on the last discipline and firearm', async () => {
    const firearm = createFirearm(db, { make: 'Acme', model: 'Target 22', isOwn: true });
    session('Older', '2026-06-01T16:00:00.000Z', { disciplineId: 'spsf-milsnabb' });
    session('Latest', '2026-06-02T16:00:00.000Z', { firearmId: firearm.id });

    await renderWithProviders(<HomeScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Start Precision' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/session/new');
    expect(screen.getByTestId('home-start-firearm')).toHaveTextContent('Acme Target 22');

    await fireEvent.press(screen.getByRole('button', { name: 'Change' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/session/new');
  });

  it('shows no lifetime totals and no floating New Session button', async () => {
    session('Tuesday training', '2026-06-02T16:00:00.000Z');

    await renderWithProviders(<HomeScreen />);

    expect(screen.queryByText('Shots Logged')).toBeNull();
    expect(screen.queryByText('Competitions')).toBeNull();
    expect(screen.queryByText('New Session')).toBeNull();
  });

  it("shows the last session's result, inner tens included", async () => {
    const older = session('Tuesday training', '2026-06-02T16:00:00.000Z');
    series(older.id, 1, [10, 10, 9, 9, 8], 1);
    const newer = session('Club match', '2026-06-06T08:00:00.000Z', { type: 'competition' });
    series(newer.id, 1, [10, 10, 10, 9, 9], 2);

    await renderWithProviders(<HomeScreen />);

    const last = screen.getByTestId('home-last-session');
    expect(last).toHaveTextContent(/Last Session · .* · Competition/);
    expect(last).toHaveTextContent(/Club match/);
    expect(screen.getByTestId('home-last-session-total')).toHaveTextContent('48');
    expect(screen.getByTestId('home-last-session-result')).toHaveTextContent(
      '⌀ 48.0 per series · 2X',
    );

    await fireEvent.press(last);
    expect(mockRouter.push).toHaveBeenCalledWith(`/session/${newer.id}`);
  });

  it('lists the rest under Recent with total, average and inner tens, 0X included', async () => {
    const older = session('Tuesday training', '2026-06-02T16:00:00.000Z');
    series(older.id, 1, [10, 9, 9, 8, 8]);
    series(older.id, 2, [10, 10, 9, 9, 8]);
    session('Club match', '2026-06-06T08:00:00.000Z');

    await renderWithProviders(<HomeScreen />);

    const row = screen.getByTestId('home-session-0');
    expect(row).toHaveTextContent(/Tuesday training/);
    expect(row).toHaveTextContent(/⌀ 45\.0 per series · 0X/);
    expect(screen.getByTestId('home-session-0-total')).toHaveTextContent('90');
    expect(row).not.toHaveTextContent(/90p/);
  });

  it('prints no result for a session with nothing scored', async () => {
    session('Empty evening', '2026-06-02T16:00:00.000Z');
    session('Latest', '2026-06-03T16:00:00.000Z');

    await renderWithProviders(<HomeScreen />);

    const row = screen.getByTestId('home-session-0');
    expect(row).toHaveTextContent(/Empty evening/);
    expect(row).not.toHaveTextContent(/⌀/);
    expect(screen.queryByTestId('home-session-0-total')).toBeNull();
  });

  it("reports a rounds session's count", async () => {
    const rounds = session('Plinking', '2026-06-02T16:00:00.000Z', { kind: 'rounds' });
    setSessionExtraRounds(db, rounds.id, 50);
    session('Latest', '2026-06-03T16:00:00.000Z');

    await renderWithProviders(<HomeScreen />);

    expect(screen.getByTestId('home-session-0')).toHaveTextContent(/50 rounds/);
  });

  it('drops the type when a tag already says it', async () => {
    const tagged = session('Evening', '2026-06-02T16:00:00.000Z');
    tag(tagged.id, 'Träning');
    session('Untagged', '2026-06-01T16:00:00.000Z');
    session('Latest', '2026-06-03T16:00:00.000Z');

    await renderWithProviders(<HomeScreen />);

    const taggedRow = screen.getByTestId('home-session-0');
    expect(taggedRow).toHaveTextContent(/Träning/);
    expect(taggedRow).not.toHaveTextContent(/Training/);
    expect(screen.getByTestId('home-session-1')).toHaveTextContent(/Training/);
  });

  it('drops the date a generated name ends with', async () => {
    session('Training — Jun 2, 2026', '2026-06-02T16:00:00.000Z');
    session('Latest', '2026-06-03T16:00:00.000Z');

    await renderWithProviders(<HomeScreen />);

    const row = screen.getByTestId('home-session-0');
    expect(within(row).getByText('Training')).toBeOnTheScreen();
    expect(within(row).queryByText('Training — Jun 2, 2026')).toBeNull();
  });

  it('shows the ten latest and links to all of them', async () => {
    for (let day = 1; day <= 12; day++) {
      session(`Session ${day}`, `2026-06-${String(day).padStart(2, '0')}T16:00:00.000Z`);
    }

    await renderWithProviders(<HomeScreen />);

    expect(screen.getByTestId('home-last-session')).toHaveTextContent(/Session 12/);
    expect(screen.getByTestId('home-session-0')).toHaveTextContent(/Session 11/);
    expect(screen.getByTestId('home-session-8')).toHaveTextContent(/Session 3/);
    expect(screen.queryByTestId('home-session-9')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'All Sessions' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/sessions');
  });

  it('opens a recent session when its row is tapped', async () => {
    const older = session('Tuesday training', '2026-06-02T16:00:00.000Z');
    session('Latest', '2026-06-03T16:00:00.000Z');

    await renderWithProviders(<HomeScreen />);
    await fireEvent.press(screen.getByTestId('home-session-0'));

    expect(mockRouter.push).toHaveBeenCalledWith(`/session/${older.id}`);
  });
});
