// M5: the single query that feeds shared/src/scoring/stats.ts. Loads every
// non-deleted session/series/shot once and joins in JS (three flat scans
// instead of an N+1 per-series query), matching StatsSeries exactly.
import { isNull } from 'drizzle-orm';
import type { StatsSeries, StatsShot } from '@shotledger/shared';

import { series, sessions, shots } from '../schema';
import type { Database } from '../types';

export function listAllStatsSeries(db: Database): StatsSeries[] {
  const sessionRows = db.select().from(sessions).where(isNull(sessions.deletedAt)).all();
  const seriesRows = db.select().from(series).where(isNull(series.deletedAt)).all();
  const shotRows = db.select().from(shots).where(isNull(shots.deletedAt)).all();

  const sessionById = new Map(sessionRows.map((row) => [row.id, row]));
  const shotsBySeries = new Map<string, StatsShot[]>();
  for (const shot of shotRows) {
    const bucket = shotsBySeries.get(shot.seriesId) ?? [];
    bucket.push({ valueTenths: shot.valueTenths, isInnerTen: shot.isInnerTen === 1 });
    shotsBySeries.set(shot.seriesId, bucket);
  }

  const result: StatsSeries[] = [];
  for (const row of seriesRows) {
    const session = sessionById.get(row.sessionId);
    if (!session) continue; // orphaned series (soft-deleted session) — never surfaced
    result.push({
      id: row.id,
      sessionId: row.sessionId,
      startedAt: session.startedAt,
      disciplineId: session.disciplineId,
      weaponGroup: session.weaponGroup,
      shooterClass: session.shooterClass,
      firearmId: session.firearmId,
      ammoLotId: session.ammoLotId,
      isSighter: row.isSighter === 1,
      isFinal: row.isFinal === 1,
      shots: shotsBySeries.get(row.id) ?? [],
      // WS1 (docs/specs/webshooter-app-spec.md): an imported WebShooter
      // series has no shot rows, only a stored total/shot-count.
      totalOverride:
        row.isTotalOverride === 1 && row.totalOverrideTenths !== null && row.totalOverrideShotCount !== null
          ? { tenths: row.totalOverrideTenths, shotCount: row.totalOverrideShotCount }
          : null,
    });
  }
  return result;
}
