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
