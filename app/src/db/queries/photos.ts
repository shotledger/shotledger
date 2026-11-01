// Every target photo in the logbook, with enough of its session to find it
// again. Photos were only ever reachable one series at a time; this is the
// query behind the gallery.
import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { seriesSlots } from '@shotledger/shared';

import { firearms, series, sessions } from '../schema';
import type { Database } from '../types';

export interface PhotoRow {
  seriesId: string;
  sessionId: string;
  position: number;
  /** "Series n" by order in its session; null for a sighter (#922). */
  number: number | null;
  photoUri: string;
  sessionName: string;
  startedAt: string;
  location: string | null;
  disciplineId: string | null;
  firearmId: string | null;
  /** Denormalized for the filter chips, as make + model. */
  firearmMake: string | null;
  firearmModel: string | null;
  weaponGroup: string | null;
}

/** Newest session first, and within a session the series in order. */
export function listSeriesPhotos(db: Database): PhotoRow[] {
  const photos = db
    .select({
      seriesId: series.id,
      sessionId: sessions.id,
      position: series.position,
      photoUri: series.photoUri,
      sessionName: sessions.name,
      startedAt: sessions.startedAt,
      location: sessions.location,
      disciplineId: sessions.disciplineId,
      firearmId: sessions.firearmId,
      firearmMake: firearms.make,
      firearmModel: firearms.model,
      weaponGroup: sessions.weaponGroup,
    })
    .from(series)
    .innerJoin(sessions, eq(series.sessionId, sessions.id))
    // Left: a session without a firearm still has photos worth listing.
    .leftJoin(firearms, eq(sessions.firearmId, firearms.id))
    .where(and(isNotNull(series.photoUri), isNull(series.deletedAt), isNull(sessions.deletedAt)))
    .orderBy(desc(sessions.startedAt), series.position)
    .all()
    // `isNotNull` already excludes them; the guard is for the type, since
    // drizzle types the column as nullable regardless of the predicate.
    .flatMap((row) => (row.photoUri === null ? [] : [{ ...row, photoUri: row.photoUri }]));
  const numbers = seriesNumbers(db, [...new Set(photos.map((photo) => photo.sessionId))]);
  return photos.map((photo) => ({ ...photo, number: numbers.get(photo.seriesId) ?? null }));
}

/** Each live series' number within its session, for the given sessions. */
function seriesNumbers(db: Database, sessionIds: readonly string[]): Map<string, number | null> {
  if (sessionIds.length === 0) return new Map();
  const rows = db
    .select({
      id: series.id,
      sessionId: series.sessionId,
      position: series.position,
      isSighter: series.isSighter,
      isFinal: series.isFinal,
    })
    .from(series)
    .where(and(inArray(series.sessionId, [...sessionIds]), isNull(series.deletedAt)))
    .all();
  const bySession = new Map<string, typeof rows>();
  for (const row of rows)
    bySession.set(row.sessionId, [...(bySession.get(row.sessionId) ?? []), row]);
  const numbers = new Map<string, number | null>();
  for (const sessionRows of bySession.values()) {
    // The number does not depend on the program, only on order and sighters.
    const slots = seriesSlots(
      null,
      sessionRows.map((row) => ({
        position: row.position,
        isSighter: row.isSighter === 1,
        isFinal: row.isFinal === 1,
      })),
    );
    sessionRows.forEach((row, index) => numbers.set(row.id, slots[index]!.number));
  }
  return numbers;
}
