// The export envelope's contents built from plain table rows, so the phone
// (SQLite) and the web app (`/sync/pull`, ARCHITECTURE.md § Web app) write the same file.
// Rows are camelCase as Drizzle returns them, SQLite booleans as 0/1.
// Callers pass live rows only. A column a source may not carry is optional
// here and exports as its default.
import { firearmDisplayName } from './plan';
import type { FirearmExport, LicenseExport, MaintenanceEventExport, SessionExport } from './types';

type Flag = number | boolean;

export interface ExportSessionRow {
  readonly id: string;
  readonly name: string;
  readonly type: SessionExport['type'];
  readonly disciplineId: string;
  readonly programId: string | null;
  readonly competitionLevel: string | null;
  readonly isChampionship: Flag;
  readonly competitionName: string | null;
  readonly weaponGroup: string | null;
  readonly shooterClass: string | null;
  readonly eventId: string | null;
  readonly firearmId: string | null;
  readonly ammoLotId: string | null;
  readonly startedAt: string;
  readonly location: string | null;
  readonly notes: string | null;
  readonly decimalScoring: Flag;
  readonly seriesLength: number | null;
  readonly extraRounds: number | null;
  readonly faltResultMode: SessionExport['faltResultMode'] | undefined;
  readonly kind?: SessionExport['kind'];
  readonly externalSource?: string | null;
  readonly externalRef?: string | null;
  readonly officialPlacement?: number | null;
  readonly officialStandardMedal?: SessionExport['officialStandardMedal'];
}

export interface ExportSeriesRow {
  readonly id: string;
  readonly sessionId: string;
  readonly position: number;
  readonly isSighter: Flag;
  readonly isFinal: Flag;
  readonly isTotalOverride: Flag;
  readonly totalOverrideTenths: number | null;
  readonly totalOverrideShotCount: number | null;
}

export interface ExportShotRow {
  readonly seriesId: string;
  readonly position: number;
  readonly valueTenths: number;
  readonly isInnerTen: Flag;
}

export interface ExportStationRow {
  readonly sessionId: string;
  readonly position: number;
  readonly hits: number;
  readonly figuresHit: number;
  readonly figureCount: number | null;
  readonly points: number | null;
  readonly pointsMax: number | null;
  readonly isScratched: Flag;
  readonly isShootOff: Flag;
  readonly note: string | null;
}

export interface ExportFirearmRow {
  readonly id: string;
  readonly make: string;
  readonly model: string;
  readonly caliber: string | null;
  readonly weaponType: FirearmExport['weaponType'];
  readonly isOwn: Flag;
  readonly serialNumber: string | null;
  readonly vapenId: string | null;
  readonly loadSystem: string | null;
  readonly notes: string | null;
  readonly roundCount: number;
  readonly maintenanceIntervalRounds: number | null;
  readonly maintenanceIntervalMonths: number | null;
  readonly archivedAt: string | null;
}

export interface ExportMaintenanceEventRow {
  readonly id: string;
  readonly firearmId: string;
  readonly performedAt: string;
  readonly kind: string;
  readonly roundCountAt: number;
  readonly isAdjustment: Flag;
  readonly notes: string | null;
}

export interface ExportAmmoLotRow {
  readonly id: string;
  readonly label: string;
}

export interface SessionExportRows {
  readonly sessions: readonly ExportSessionRow[];
  readonly series: readonly ExportSeriesRow[];
  readonly shots: readonly ExportShotRow[];
  readonly stations: readonly ExportStationRow[];
  readonly firearms: readonly ExportFirearmRow[];
  readonly ammoLots: readonly ExportAmmoLotRow[];
  /** Tag names per session id; a session missing from it has none. */
  readonly tagsBySession?: ReadonlyMap<string, readonly string[]>;
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = groups.get(key(row));
    if (bucket) bucket.push(row);
    else groups.set(key(row), [row]);
  }
  return groups;
}

const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

/** Every session with its series, shots, stations and tags, oldest first. */
export function sessionExportsFromRows(rows: SessionExportRows): SessionExport[] {
  const firearmById = new Map(rows.firearms.map((f) => [f.id, f]));
  const ammoLotById = new Map(rows.ammoLots.map((a) => [a.id, a]));
  const seriesBySession = groupBy(rows.series, (s) => s.sessionId);
  const stationsBySession = groupBy(rows.stations, (s) => s.sessionId);
  const shotsBySeries = groupBy(rows.shots, (s) => s.seriesId);

  return [...rows.sessions]
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((session) => {
      const firearm = session.firearmId ? firearmById.get(session.firearmId) : undefined;
      const ammoLot = session.ammoLotId ? ammoLotById.get(session.ammoLotId) : undefined;
      return {
        id: session.id,
        name: session.name,
        type: session.type,
        kind: session.kind ?? 'series',
        disciplineId: session.disciplineId,
        programId: session.programId,
        competitionLevel: session.competitionLevel,
        isChampionship: Boolean(session.isChampionship),
        competitionName: session.competitionName,
        weaponGroup: session.weaponGroup,
        shooterClass: session.shooterClass,
        eventId: session.eventId,
        firearmId: firearm ? firearm.id : null,
        firearm: firearm ? firearmDisplayName(firearm) : null,
        ammoLot: ammoLot ? ammoLot.label : null,
        startedAt: session.startedAt,
        location: session.location,
        notes: session.notes,
        decimalScoring: Boolean(session.decimalScoring),
        seriesLength: session.seriesLength,
        extraRounds: session.extraRounds,
        tags: [...(rows.tagsBySession?.get(session.id) ?? [])],
        series: (seriesBySession.get(session.id) ?? []).sort(byPosition).map((s) => ({
          position: s.position,
          isSighter: Boolean(s.isSighter),
          isFinal: Boolean(s.isFinal),
          shots: (shotsBySeries.get(s.id) ?? []).sort(byPosition).map((shot) => ({
            position: shot.position,
            valueTenths: shot.valueTenths,
            isInnerTen: Boolean(shot.isInnerTen),
          })),
          totalOverride:
            s.isTotalOverride && s.totalOverrideTenths !== null
              ? { tenths: s.totalOverrideTenths, shotCount: s.totalOverrideShotCount }
              : null,
        })),
        faltResultMode: session.faltResultMode ?? null,
        stations: (stationsBySession.get(session.id) ?? []).sort(byPosition).map((station) => ({
          position: station.position,
          hits: station.hits,
          figuresHit: station.figuresHit,
          figureCount: station.figureCount,
          points: station.points,
          pointsMax: station.pointsMax,
          isScratched: Boolean(station.isScratched),
          isShootOff: Boolean(station.isShootOff),
          note: station.note,
        })),
        externalSource: session.externalSource ?? null,
        externalRef: session.externalRef ?? null,
        officialPlacement: session.officialPlacement ?? null,
        officialStandardMedal: session.officialStandardMedal ?? null,
      };
    });
}

export function firearmExportsFromRows(rows: readonly ExportFirearmRow[]): FirearmExport[] {
  return rows.map((f) => ({
    id: f.id,
    make: f.make,
    model: f.model,
    caliber: f.caliber,
    weaponType: f.weaponType,
    isOwn: Boolean(f.isOwn),
    serialNumber: f.serialNumber,
    vapenId: f.vapenId,
    loadSystem: f.loadSystem,
    notes: f.notes,
    roundCount: f.roundCount,
    maintenanceIntervalRounds: f.maintenanceIntervalRounds,
    maintenanceIntervalMonths: f.maintenanceIntervalMonths,
    archivedAt: f.archivedAt ?? null,
  }));
}

export function licenseExportsFromRows(rows: readonly LicenseExport[]): LicenseExport[] {
  return rows.map((l) => ({
    id: l.id,
    firearmId: l.firearmId,
    licenseNumber: l.licenseNumber,
    purpose: l.purpose,
    decidedOn: l.decidedOn,
    validUntil: l.validUntil,
    conditions: l.conditions,
    authority: l.authority,
  }));
}

export function maintenanceEventExportsFromRows(
  rows: readonly ExportMaintenanceEventRow[],
): MaintenanceEventExport[] {
  return rows.map((e) => ({
    id: e.id,
    firearmId: e.firearmId,
    performedAt: e.performedAt,
    kind: e.kind,
    roundCountAt: e.roundCountAt,
    isAdjustment: Boolean(e.isAdjustment),
    notes: e.notes,
  }));
}
