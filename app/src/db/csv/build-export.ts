// Glue layer (routine app work, not old-coder scope — see
// docs/specs/m7-csv-spec.md "Scope"): reads the DB into the plain
// SessionExport[] shape shared/csv expects, and calls the pure exporter.
import { isNull } from 'drizzle-orm';
import { exportSessionsToCsv, type SessionExport } from '@shotledger/shared';

import { ammoLots, firearms, series, sessions, shots } from '../schema';
import type { Database } from '../types';
import { listTagsForSession } from '../queries/tags';

function firearmDisplayName(f: { make: string; model: string }): string {
  return `${f.make} ${f.model}`;
}

/** Assembles every non-deleted session (with its series/shots/tags) into
 * the shape `exportSessionsToCsv` expects. */
export function buildSessionExports(db: Database): SessionExport[] {
  const sessionRows = db.select().from(sessions).where(isNull(sessions.deletedAt)).all();
  const seriesRows = db.select().from(series).where(isNull(series.deletedAt)).all();
  const shotRows = db.select().from(shots).where(isNull(shots.deletedAt)).all();
  const firearmRows = db.select().from(firearms).where(isNull(firearms.deletedAt)).all();
  const ammoLotRows = db.select().from(ammoLots).where(isNull(ammoLots.deletedAt)).all();

  const firearmById = new Map(firearmRows.map((f) => [f.id, f]));
  const ammoLotById = new Map(ammoLotRows.map((a) => [a.id, a]));

  const seriesBySession = new Map<string, typeof seriesRows>();
  for (const s of seriesRows) {
    const bucket = seriesBySession.get(s.sessionId) ?? [];
    bucket.push(s);
    seriesBySession.set(s.sessionId, bucket);
  }
  const shotsBySeries = new Map<string, typeof shotRows>();
  for (const shot of shotRows) {
    const bucket = shotsBySeries.get(shot.seriesId) ?? [];
    bucket.push(shot);
    shotsBySeries.set(shot.seriesId, bucket);
  }

  return sessionRows
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((session) => {
      const firearm = session.firearmId ? firearmById.get(session.firearmId) : undefined;
      const ammoLot = session.ammoLotId ? ammoLotById.get(session.ammoLotId) : undefined;
      const sessionSeries = (seriesBySession.get(session.id) ?? [])
        .slice()
        .sort((a, b) => a.position - b.position);

      return {
        id: session.id,
        name: session.name,
        type: session.type,
        disciplineId: session.disciplineId,
        programId: session.programId,
        competitionLevel: session.competitionLevel,
        isChampionship: session.isChampionship === 1,
        competitionName: session.competitionName,
        weaponGroup: session.weaponGroup,
        shooterClass: session.shooterClass,
        firearm: firearm ? firearmDisplayName(firearm) : null,
        ammoLot: ammoLot ? ammoLot.label : null,
        startedAt: session.startedAt,
        location: session.location,
        notes: session.notes,
        decimalScoring: session.decimalScoring === 1,
        extraRounds: session.extraRounds,
        tags: listTagsForSession(db, session.id).map((t) => t.name),
        series: sessionSeries.map((s) => ({
          position: s.position,
          isSighter: s.isSighter === 1,
          isFinal: s.isFinal === 1,
          shots: (shotsBySeries.get(s.id) ?? [])
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((shot) => ({
              position: shot.position,
              valueTenths: shot.valueTenths,
              isInnerTen: shot.isInnerTen === 1,
            })),
        })),
      };
    });
}

/** Builds the full CSV text for every non-deleted session in the DB. */
export function buildExportCsv(db: Database): string {
  return exportSessionsToCsv(buildSessionExports(db));
}
