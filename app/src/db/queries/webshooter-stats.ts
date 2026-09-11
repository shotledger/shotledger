// PB / year-to-year read path (integration spec §B) — computed entirely
// locally over sessions/series (§B.4, never a live proxy call). Builds the
// shared/src/integrations/webshooter/stats input shape
// (CompetitionResultForStats) from local competition sessions, imported and
// manually-logged alike.
import { and, eq, isNull } from 'drizzle-orm';
import type { CompetitionResultForStats } from '@shotledger/shared/src/integrations/webshooter/stats/pb';
import {
  sessionInnerTenCount,
  sessionResults,
  sumValueTenths,
  type SeriesForResults,
} from '@shotledger/shared';

import { series, sessions, shots } from '../schema';
import type { Database } from '../types';

const OFFICIAL_COMPETITION_TYPES = new Set(['spsf-precision', 'spsf-milsnabb']);

/**
 * One row per competition session (§B.1's grouping unit), computed via
 * shared/scoring/totals.ts (WS1-aware — an override series contributes its
 * stored total). `figureHits` is not a column ShotLedger stores for
 * manually-logged sessions (only Webshooter's own payload has it, and this
 * spec never persisted it separately, docs/specs/webshooter-app-spec.md) —
 * left at 0 for every row, which the tiebreak in stats/pb.ts then falls
 * through to `innerTens` for, same as the module's own documented
 * secondary criterion; a real figureHits value is a known gap, not a bug.
 */
export function listCompetitionResultsForStats(db: Database): CompetitionResultForStats[] {
  const sessionRows = db
    .select()
    .from(sessions)
    .where(and(isNull(sessions.deletedAt), eq(sessions.type, 'competition')))
    .all();

  const results: CompetitionResultForStats[] = [];
  for (const session of sessionRows) {
    if (!OFFICIAL_COMPETITION_TYPES.has(session.disciplineId)) continue;
    if (!session.weaponGroup || !session.shooterClass) continue;

    const seriesRows = db
      .select()
      .from(series)
      .where(and(eq(series.sessionId, session.id), isNull(series.deletedAt)))
      .all();

    const forResults: SeriesForResults[] = seriesRows.map((row) => {
      const isOverride =
        row.isTotalOverride === 1 &&
        row.totalOverrideTenths !== null &&
        row.totalOverrideShotCount !== null;
      const seriesShots = isOverride
        ? []
        : db
            .select()
            .from(shots)
            .where(and(eq(shots.seriesId, row.id), isNull(shots.deletedAt)))
            .all()
            .map((s) => ({ valueTenths: s.valueTenths }));
      return {
        isSighter: row.isSighter === 1,
        isFinal: row.isFinal === 1,
        shots: seriesShots,
        totalOverride: isOverride
          ? { tenths: row.totalOverrideTenths!, shotCount: row.totalOverrideShotCount! }
          : null,
      };
    });

    const scored = sessionResults(forResults);
    const beforeFinalSeriesCount = seriesRows.filter((r) => !r.isFinal && r.isSighter === 0).length;
    const totalSeriesCount = seriesRows.filter((r) => r.isSighter === 0).length;
    const innerTens = sessionInnerTenCount(
      seriesRows.map((row) => ({
        isSighter: row.isSighter === 1,
        isFinal: row.isFinal === 1,
        shots: [],
      })),
    );

    results.push({
      sessionId: session.id,
      competitionType: session.disciplineId,
      weaponGroup: session.weaponGroup,
      shooterClass: session.shooterClass,
      date: session.startedAt,
      beforeFinalTenths: scored.beforeFinalTenths,
      beforeFinalSeriesCount,
      totalTenths: scored.totalTenths,
      totalSeriesCount,
      figureHits: 0,
      innerTens,
    });
  }
  return results;
}

export interface FreeformSessionRow {
  sessionId: string;
  disciplineId: string;
  weaponGroup: string;
  shooterClass: string;
  date: string;
  seriesTenths: number[];
}

/**
 * Freeform local PB input (§B.5): every non-sighter, non-final series total
 * from EVERY session (training or competition, any series count) —
 * deliberately broader than `listCompetitionResultsForStats`, since §B.5
 * exists precisely to not hide training data from PB tracking.
 */
export function listFreeformSessionsForPb(db: Database): FreeformSessionRow[] {
  const sessionRows = db.select().from(sessions).where(isNull(sessions.deletedAt)).all();

  const results: FreeformSessionRow[] = [];
  for (const session of sessionRows) {
    if (!session.weaponGroup || !session.shooterClass) continue;
    const seriesRows = db
      .select()
      .from(series)
      .where(
        and(
          eq(series.sessionId, session.id),
          isNull(series.deletedAt),
          eq(series.isSighter, 0),
          eq(series.isFinal, 0),
        ),
      )
      .all();
    if (seriesRows.length === 0) continue;

    const seriesTenths = seriesRows.map((row) => {
      if (row.isTotalOverride === 1 && row.totalOverrideTenths !== null)
        return row.totalOverrideTenths;
      const seriesShots = db
        .select()
        .from(shots)
        .where(and(eq(shots.seriesId, row.id), isNull(shots.deletedAt)))
        .all();
      return sumValueTenths(seriesShots.map((s) => ({ valueTenths: s.valueTenths })));
    });
    results.push({
      sessionId: session.id,
      disciplineId: session.disciplineId,
      weaponGroup: session.weaponGroup,
      shooterClass: session.shooterClass,
      date: session.startedAt,
      seriesTenths,
    });
  }
  return results;
}
