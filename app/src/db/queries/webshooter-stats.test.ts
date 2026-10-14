import { beforeEach, describe, expect, it } from 'vitest';
import { personalBests } from '@shotledger/shared/src/integrations/webshooter/stats/pb';

import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { addSeries } from './series';
import { addShot } from './shots';
import { createSession } from './sessions';
import { listCompetitionResultsForStats, listFreeformSessionsForPb } from './webshooter-stats';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

function sevenSeriesSession(overrides: Partial<Parameters<typeof createSession>[1]> = {}) {
  const session = createSession(db, {
    name: 'KM',
    type: 'competition',
    disciplineId: 'spsf-precision',
    weaponGroup: 'spsf:C',
    shooterClass: '2',
    startedAt: '2026-05-10T09:00:00.000Z',
    ...overrides,
  });
  for (let i = 1; i <= 7; i += 1) {
    const s = addSeries(db, { sessionId: session.id, position: i });
    for (let shotIdx = 0; shotIdx < 5; shotIdx += 1) {
      addShot(db, { seriesId: s.id, position: shotIdx + 1, valueTenths: 90 });
    }
  }
  return session;
}

describe('listCompetitionResultsForStats', () => {
  it('computes beforeFinalTenths/seriesCount from local shots (manually-logged, WS1-agnostic)', () => {
    sevenSeriesSession();
    const results = listCompetitionResultsForStats(db);
    expect(results).toHaveLength(1);
    expect(results[0]!.beforeFinalTenths).toBe(3150); // 7 * 5 * 90
    expect(results[0]!.beforeFinalSeriesCount).toBe(7);
  });

  it('computes the same totals from an override series with no shots (WS1)', () => {
    const session = createSession(db, {
      name: 'KM (imported)',
      type: 'competition',
      disciplineId: 'spsf-precision',
      weaponGroup: 'spsf:C',
      shooterClass: '2',
      startedAt: '2026-05-10T09:00:00.000Z',
    });
    for (let i = 1; i <= 7; i += 1) {
      addSeries(db, {
        sessionId: session.id,
        position: i,
        isTotalOverride: true,
        totalOverrideTenths: 450,
        totalOverrideShotCount: 5,
      });
    }
    const results = listCompetitionResultsForStats(db);
    expect(results[0]!.beforeFinalTenths).toBe(3150);
    expect(results[0]!.beforeFinalSeriesCount).toBe(7);
  });

  it('excludes training sessions and non-precision/milsnabb disciplines', () => {
    createSession(db, {
      name: 'Training',
      type: 'training',
      disciplineId: 'spsf-precision',
      weaponGroup: 'spsf:C',
      shooterClass: '2',
      startedAt: '2026-05-10T09:00:00.000Z',
    });
    expect(listCompetitionResultsForStats(db)).toHaveLength(0);
  });

  it('feeds a real official PB (7-series eligible, §B.1) through the shared stats module', () => {
    sevenSeriesSession();
    const pbMap = personalBests(listCompetitionResultsForStats(db));
    const group = pbMap.get('spsf-precision:spsf:C');
    expect(group?.allTime?.beforeFinalTenths).toBe(3150);
  });
});

describe('listFreeformSessionsForPb', () => {
  it('sums real shot totals per series (not zero) for a manually-logged session', () => {
    const session = createSession(db, {
      name: 'Training',
      type: 'training',
      disciplineId: 'spsf-precision',
      weaponGroup: 'spsf:C',
      shooterClass: '2',
      startedAt: '2026-05-10T09:00:00.000Z',
    });
    const s1 = addSeries(db, { sessionId: session.id, position: 1 });
    addShot(db, { seriesId: s1.id, position: 1, valueTenths: 100 });
    addShot(db, { seriesId: s1.id, position: 2, valueTenths: 90 });

    const rows = listFreeformSessionsForPb(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.seriesTenths).toEqual([190]);
  });

  it('includes any series count (not just 7), unlike the official PB path', () => {
    const session = createSession(db, {
      name: 'Training',
      type: 'training',
      disciplineId: 'spsf-precision',
      weaponGroup: 'spsf:C',
      shooterClass: '2',
      startedAt: '2026-05-10T09:00:00.000Z',
    });
    addSeries(db, { sessionId: session.id, position: 1 });
    addSeries(db, { sessionId: session.id, position: 2 });
    const rows = listFreeformSessionsForPb(db);
    expect(rows[0]!.seriesTenths).toHaveLength(2);
  });
});

describe('helmatch tie-break keys (SHB I.6.11.2.1)', () => {
  it('carries the C then B subtotals of a helmatch Full Match, sighters left out', () => {
    const session = createSession(db, {
      name: 'Helmatch',
      type: 'competition',
      disciplineId: 'spsf-helmatch',
      programId: 'spsf-helmatch',
      weaponGroup: 'spsf:C',
      startedAt: '2026-05-10T09:00:00.000Z',
    });
    // Position 6 is B's sighter, 7 a B series, 11 the first C series.
    const scored = (position: number, valueTenths: number, isSighter = false) => {
      const s = addSeries(db, { sessionId: session.id, position, isSighter });
      addShot(db, { seriesId: s.id, position: 1, valueTenths });
    };
    scored(2, 100);
    scored(6, 90, true);
    scored(7, 80);
    scored(11, 70);
    const rows = listFreeformSessionsForPb(db);
    expect(rows[0]!.seriesTenths).toEqual([100, 80, 70]);
    expect(rows[0]!.tieBreakTenths).toEqual([70, 80]);
  });

  it('carries no keys for any other discipline', () => {
    sevenSeriesSession();
    expect(listFreeformSessionsForPb(db)[0]!.tieBreakTenths).toEqual([]);
  });
});

describe('a shoot-off is no part of a result or a personal best (#727 PR C, S2)', () => {
  function withShootOff() {
    const session = sevenSeriesSession();
    addSeries(db, {
      sessionId: session.id,
      position: 8,
      isShootOff: true,
      isTotalOverride: true,
      totalOverrideTenths: 500,
      totalOverrideShotCount: 5,
    });
    return session;
  }

  it('leaves it out of the totals and the series counts', () => {
    withShootOff();
    const [result] = listCompetitionResultsForStats(db);
    expect(result).toMatchObject({
      beforeFinalTenths: 3150,
      beforeFinalSeriesCount: 7,
      totalTenths: 3150,
      totalSeriesCount: 7,
      innerTens: 0,
    });
  });

  it('leaves it out of the freeform personal-best series', () => {
    withShootOff();
    const [row] = listFreeformSessionsForPb(db);
    expect(row!.seriesTenths).toEqual(Array(7).fill(450));
  });
});
