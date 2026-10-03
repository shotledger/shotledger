// Changing a session's match format after creation (#475). Allowed only while
// nothing has been scored, so the switch can rebuild the series from scratch
// without ever touching a score.
import { buildProgramSkeleton, getProgram } from '@shotledger/shared';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { sessions, shots } from '../schema';
import type { Database } from '../types';
import { nowIso } from '../util';
import { addSeries, listSeriesForSession, softDeleteSeries } from './series';

/**
 * True while no series of the session holds a result: no shot, no imported
 * total and no photo waiting to be scored. A final implies shots, so a
 * session with one is never changeable.
 */
export function canChangeMatchFormat(db: Database, sessionId: string): boolean {
  const rows = listSeriesForSession(db, sessionId);
  if (rows.some((row) => row.isTotalOverride === 1 || row.photoUri !== null)) return false;
  if (rows.length === 0) return true;
  const shot = db
    .select({ id: shots.id })
    .from(shots)
    .where(
      and(
        inArray(
          shots.seriesId,
          rows.map((row) => row.id),
        ),
        isNull(shots.deletedAt),
      ),
    )
    .get();
  return shot === undefined;
}

/**
 * Sets the session's program (null = Free Format) and replaces its empty
 * series with the new program's skeleton. Returns false, changing nothing,
 * once a result exists.
 */
export function changeMatchFormat(
  db: Database,
  sessionId: string,
  programId: string | null,
): boolean {
  if (!canChangeMatchFormat(db, sessionId)) return false;
  const program = programId ? getProgram(programId) : undefined;
  if (programId && !program) throw new RangeError(`Unknown program '${programId}'.`);

  db.transaction((tx) => {
    for (const row of listSeriesForSession(tx, sessionId)) softDeleteSeries(tx, row.id);
    tx.update(sessions)
      .set({ programId, updatedAt: nowIso() })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.deletedAt)))
      .run();
    for (const entry of program ? buildProgramSkeleton(program) : []) {
      addSeries(tx, {
        sessionId,
        position: entry.position,
        isSighter: entry.isSighter,
        isFinal: entry.isFinal,
      });
    }
  });
  return true;
}
