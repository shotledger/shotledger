// The Statistics tab against a real (in-memory) database (#822, direction
// A): it opens on results, the headline compares with the previous period,
// X is counted even at zero, and the Filter Bar changes the results live.
import { fireEvent, screen, within } from '@testing-library/react-native';

import StatsScreen from '@/app/(tabs)/stats';
import { saveSeriesShots } from '@/db/queries/round-count';
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

function series(sessionId: string, position: number, values: number[], inner = 0) {
  const row = addSeries(db, { sessionId, position });
  saveSeriesShots(
    db,
    row.id,
    values.map((value, index) => ({ valueTenths: value * 10, isInnerTen: index < inner })),
  );
}

describe('Statistics', () => {
  it('says there is nothing yet without sessions', async () => {
    await renderWithProviders(<StatsScreen />);
    expect(screen.getByText('No Statistics Yet')).toBeOnTheScreen();
  });

  it('opens on the results: headline, trend, detail and counts', async () => {
    // Now: 40 per series, two sessions, one a competition.
    const now = session('Tuesday', '2026-06-02T16:00:00.000Z');
    series(now.id, 1, [9, 8, 8, 8, 7]);
    const match = session('Club match', '2026-05-10T08:00:00.000Z', { type: 'competition' });
    series(match.id, 1, [9, 8, 8, 8, 7]);
    // The six months before: 35 per series.
    const before = session('Winter', '2025-11-10T16:00:00.000Z');
    series(before.id, 1, [7, 7, 7, 7, 7]);

    await renderWithProviders(<StatsScreen />);

    expect(screen.getByText('Last 6 months · 2 sessions')).toBeOnTheScreen();
    expect(screen.getByTestId('stat-mean-series')).toHaveTextContent(/40\.0/);
    expect(screen.getByTestId('stats-trend')).toHaveTextContent('+5.0 on the previous 6 months');
    // No inner ten was shot, and the count still says so.
    expect(screen.getByTestId('stat-inner-tens')).toHaveTextContent(/^0/);
    expect(screen.getByTestId('stat-x-percent')).toHaveTextContent(/0%/);
    expect(screen.getByText('10 scored shots · 0 X')).toBeOnTheScreen();
    expect(screen.getByTestId('stat-sessions')).toHaveTextContent(/^2/);
    expect(screen.getByTestId('stat-competitions')).toHaveTextContent(/^1/);
    expect(screen.queryByText('Generate Report')).toBeNull();
  });

  it('filters live through the Filter Bar, and a chip removes its filter', async () => {
    const training = session('Tuesday', '2026-06-02T16:00:00.000Z');
    series(training.id, 1, [10, 10, 10, 10, 10], 2);
    const match = session('Club match', '2026-05-10T08:00:00.000Z', { type: 'competition' });
    series(match.id, 1, [8, 8, 8, 8, 8]);

    await renderWithProviders(<StatsScreen />);
    expect(screen.getByTestId('stat-mean-series')).toHaveTextContent(/45\.0/);

    await fireEvent.press(screen.getByRole('button', { name: 'Filters' }));
    const sheet = screen.getByTestId('stats-filter-sheet');
    await fireEvent.press(within(sheet).getByRole('radio', { name: 'Competition' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByTestId('stat-mean-series')).toHaveTextContent(/40\.0/);
    expect(screen.getByText('Last 6 months · 1 session')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Remove filter Competition' }));
    expect(screen.getByTestId('stat-mean-series')).toHaveTextContent(/45\.0/);
  });

  it('keeps Records one tap away', async () => {
    const training = session('Tuesday', '2026-06-02T16:00:00.000Z');
    series(training.id, 1, [9, 9, 9, 9, 9]);
    await renderWithProviders(<StatsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Records' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/stats/records');
  });
});
