// Every target photo in the logbook, with enough of its session to find it
// again. Photos were only ever reachable one series at a time; this is the
// query behind the gallery.
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';

import { firearms, series, sessions } from '../schema';
import type { Database } from '../types';

export interface PhotoRow {
  seriesId: string;
  sessionId: string;
  position: number;
  photoUri: string;
  sessionName: string;
  startedAt: string;
  location: string | null;
  disciplineId: string | null;
  firearmId: string | null;
  /** Denormalised for the filter chips, as make + model. */
  firearmMake: string | null;
  firearmModel: string | null;
  weaponGroup: string | null;
}

/** Newest session first, and within a session the series in order. */
export function listSeriesPhotos(db: Database): PhotoRow[] {
  return (
    db
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
      .flatMap((row) => (row.photoUri === null ? [] : [{ ...row, photoUri: row.photoUri }]))
  );
}
