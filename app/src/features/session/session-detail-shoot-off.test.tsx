// A shoot-off (särskjutning) series in session detail, against a real
// (in-memory) database: spec docs/specs/shoot-off-and-ten-counts-727-spec.md
// S1, S2 and S4. It is summed apart from the result, kept out of every
// session figure, and listed in its own section after the main round and the
// final.
import { screen, within } from '@testing-library/react-native';

import { addSeries } from '@/db/queries/series';
import { createSession } from '@/db/queries/sessions';
import { saveSeriesShots } from '@/db/queries/round-count';
import type { Database } from '@/db/types';
import { renderWithProviders } from '@/test-utils/render';
import { setSearchParams } from '@/test-utils/router-mock';
import { resetTestDb } from '@/test-utils/test-db-client';

import SessionDetailScreen from '@/app/session/[id]';
import { loadSessionDetail } from './use-session-detail';

jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('expo-router', () => require('@/test-utils/router-mock').expoRouterMock);
jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);

let db: Database;

beforeEach(() => {
  db = resetTestDb();
});

const tens = (count: number, innerTens = 0) =>
  Array.from({ length: count }, (_unused, index) => ({
    valueTenths: 100,
    isInnerTen: index < innerTens,
  }));

/** A precision competition: one 45 main series, a 49 final, a 50 shoot-off with five (X). */
function seed({ final = true }: { final?: boolean } = {}) {
  const session = createSession(db, {
    name: 'Club championship',
    type: 'competition',
    disciplineId: 'spsf-precision',
    weaponGroup: 'spsf:C',
    startedAt: '2026-05-16T09:00:00.000Z',
  });
  const main = addSeries(db, { sessionId: session.id, position: 1 });
  saveSeriesShots(db, main.id, [...tens(4, 1), { valueTenths: 50, isInnerTen: false }]);
  if (final) {
    const finalSeries = addSeries(db, { sessionId: session.id, position: 2, isFinal: true });
    saveSeriesShots(db, finalSeries.id, [...tens(4), { valueTenths: 90, isInnerTen: false }]);
  }
  const shootOff = addSeries(db, { sessionId: session.id, position: 3, isShootOff: true });
  saveSeriesShots(db, shootOff.id, tens(5, 5));
  return session.id;
}

describe('loadSessionDetail with a shoot-off', () => {
  it('S1: sums the shoot-off apart and keeps it out of the total', () => {
    const detail = loadSessionDetail(seed());
    expect(detail.results).toEqual({
      beforeFinalTenths: 450,
      finalTenths: 490,
      totalTenths: 940,
      hasFinal: true,
      shootOffTenths: 500,
      hasShootOff: true,
    });
  });

  it('S2: keeps it out of the average, the inner tens and the guldserie mark', () => {
    const detail = loadSessionDetail(seed());
    expect(detail.seriesAverageTenths).toBe(470);
    expect(detail.innerTenCount).toBe(1);
    expect(detail.innerTenAverage).toBe(0.5);
    const shootOff = detail.seriesRows.find((row) => row.isShootOff)!;
    expect(shootOff.totalTenths).toBe(500);
    expect(shootOff.isGoldSeries).toBe(false);
  });

  it('a shoot-off read through a WS1 total keeps its stored total apart too', () => {
    const session = createSession(db, {
      name: 'Imported',
      type: 'competition',
      disciplineId: 'spsf-precision',
      weaponGroup: 'spsf:C',
      startedAt: '2026-05-16T09:00:00.000Z',
    });
    addSeries(db, {
      sessionId: session.id,
      position: 1,
      isTotalOverride: true,
      totalOverrideTenths: 470,
      totalOverrideShotCount: 5,
    });
    addSeries(db, {
      sessionId: session.id,
      position: 2,
      isShootOff: true,
      isTotalOverride: true,
      totalOverrideTenths: 480,
      totalOverrideShotCount: 5,
    });
    const detail = loadSessionDetail(session.id);
    expect(detail.results).toMatchObject({ totalTenths: 470, shootOffTenths: 480 });
    expect(detail.seriesAverageTenths).toBe(470);
  });
});

describe('session detail screen with a shoot-off (S4)', () => {
  async function open(sessionId: string) {
    setSearchParams({ id: sessionId });
    await renderWithProviders(<SessionDetailScreen />);
  }

  it('shows the shoot-off as its own result part, outside the total', async () => {
    await open(seed());
    expect(screen.getByTestId('session-total')).toHaveTextContent('94');
    expect(screen.getByTestId('result-shoot-off')).toHaveTextContent('50');
    expect(within(screen.getByTestId('session-result')).getByText('Shoot-off')).toBeTruthy();
    expect(screen.getByTestId('result-before-final')).toHaveTextContent('45');
    expect(screen.getByTestId('result-final')).toHaveTextContent('49');
  });

  it('lists the main round, the final and the shoot-off under their own headings', async () => {
    await open(seed());
    expect(screen.getByTestId('series-section-main')).toHaveTextContent('Qualification');
    expect(screen.getByTestId('series-section-final')).toHaveTextContent('Final');
    expect(screen.getByTestId('series-section-shootOff')).toHaveTextContent('Shoot-off');
  });

  it('heads the main round once a shoot-off follows it, with no final', async () => {
    await open(seed({ final: false }));
    expect(screen.getByTestId('series-section-main')).toBeTruthy();
    expect(screen.queryByTestId('series-section-final')).toBeNull();
    expect(screen.queryByTestId('result-before-final')).toBeNull();
    expect(screen.getByTestId('result-shoot-off')).toBeTruthy();
  });

  it('shows neither when the session has no shoot-off', async () => {
    const session = createSession(db, {
      name: 'Training',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: '2026-05-16T09:00:00.000Z',
    });
    const main = addSeries(db, { sessionId: session.id, position: 1 });
    saveSeriesShots(db, main.id, tens(5));
    await open(session.id);
    expect(screen.queryByTestId('result-shoot-off')).toBeNull();
    expect(screen.queryByTestId('series-section-main')).toBeNull();
    expect(screen.queryByTestId('series-section-shootOff')).toBeNull();
  });
});
