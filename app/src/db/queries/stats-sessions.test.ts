// Spec: docs/specs/analytics-session-set-spec.md, criteria E2E-1 and E2E-2 —
// the reported symptom asserted one layer above the pure functions, against a
// real SQLite database.
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { analyticsReportSet, ANY_ANALYTICS_FILTER, type AnalyticsFilter } from '@shotledger/shared';

import { createTestDb } from '../test-db';
import { addSeries } from './series';
import { createSession } from './sessions';
import { addShot } from './shots';
import { addSessionTag, getOrCreateTag } from './tags';
import { listAllAnalyticsSeries, listAnalyticsSessions } from './stats';
import { sessions } from '../schema';
import type { Database } from '../types';

/**
 * Exactly what `loadReport` calls — the same `analyticsReportSet`, over rows
 * from a real database. `use-stats-data.ts` itself cannot be imported here
 * (it pulls in `@/db/client`, and expo-sqlite does not load under node), so
 * the composition lives in shared precisely so this test runs the real thing
 * instead of a copy of it.
 */
function report(db: Database, filter: AnalyticsFilter = ANY_ANALYTICS_FILTER) {
  return analyticsReportSet(listAllAnalyticsSeries(db), listAnalyticsSessions(db), filter);
}

/** An ordinary session: one series of `shotCount` shots. */
function ordinarySession(db: Database, shotCount: number) {
  const session = createSession(db, {
    name: 'Träning',
    type: 'training',
    disciplineId: 'precision',
    startedAt: '2026-08-01T18:00:00.000Z',
    decimalScoring: false,
  });
  const row = addSeries(db, { sessionId: session.id, position: 1 });
  for (let i = 1; i <= shotCount; i += 1) {
    addShot(db, { seriesId: row.id, position: i, valueTenths: 90 });
  }
  return session;
}

/** A `kind: 'rounds'` session: extra rounds, never any series. */
function roundsOnlySession(db: Database, extraRounds: number) {
  const session = createSession(db, {
    name: 'Provskjutning',
    type: 'training',
    disciplineId: 'precision',
    startedAt: '2026-08-15T09:00:00.000Z',
  });
  db.update(sessions).set({ extraRounds }).where(eq(sessions.id, session.id)).run();
  return session;
}

describe('the analytics report counts sessions with no series (#349)', () => {
  it('E2E-1: a rounds-only session is counted, and its extra rounds are in the volume', () => {
    const db = createTestDb();
    ordinarySession(db, 5);
    roundsOnlySession(db, 12);

    const { totals } = report(db);

    expect(totals.sessionCount).toBe(2);
    expect(totals.volumeShotCount).toBe(17);
  });

  it('E2E-2: a filter matching only a rounds-only session still reports a match', () => {
    const db = createTestDb();
    ordinarySession(db, 5);
    const roundsOnly = roundsOnlySession(db, 12);
    const tag = getOrCreateTag(db, 'Provskjutning');
    addSessionTag(db, roundsOnly.id, tag.id);

    const { totals, hasMatches } = report(db, { ...ANY_ANALYTICS_FILTER, tagIds: [tag.id] });

    expect(hasMatches).toBe(true);
    expect(totals.sessionCount).toBe(1);
    expect(totals.volumeShotCount).toBe(12);
  });

  it('E2E-3: a soft-deleted session is not counted', () => {
    const db = createTestDb();
    ordinarySession(db, 5);
    const roundsOnly = roundsOnlySession(db, 12);
    db.update(sessions)
      .set({ deletedAt: '2026-09-01T00:00:00.000Z' })
      .where(eq(sessions.id, roundsOnly.id))
      .run();

    expect(report(db).totals.sessionCount).toBe(1);
  });

  it('E2E-4: the session-level filter still excludes a rounds-only session', () => {
    const db = createTestDb();
    ordinarySession(db, 5);
    roundsOnlySession(db, 12);

    const { totals } = report(db, {
      ...ANY_ANALYTICS_FILTER,
      fromIso: '2026-08-10T00:00:00.000Z',
    });

    // Only the rounds-only session (Aug 15) is in range; the ordinary one
    // (Aug 1) is not — so the count is the series-free session alone.
    expect(totals.sessionCount).toBe(1);
    expect(totals.volumeShotCount).toBe(12);
  });
});
