// Pulled rows to the session list and detail — the web counterpart of the
// phone's use-sessions-list and use-session-detail, on the same shared
// builders: the export's row join, and the scoring the detail screen calls.
import {
  disciplineSeriesLength,
  getDiscipline,
  getProgram,
  programStages,
  seriesStage,
} from '@shotledger/shared/src/disciplines';
import {
  sessionExportsFromRows,
  type ExportAmmoLotRow,
  type ExportFirearmRow,
  type ExportSeriesRow,
  type ExportSessionRow,
  type ExportShotRow,
  type ExportStationRow,
  type SessionExport,
  type StationExport,
} from '@shotledger/shared/src/json-export';
import type { EntryShot } from '@shotledger/shared/src/scoring/entry';
import { stageSubtotals, type StageSubtotal } from '@shotledger/shared/src/scoring/stages';
import {
  seriesAverageTenths,
  seriesInnerTenAverage,
  sessionInnerTenCount,
  sessionResults,
  type SessionResults,
} from '@shotledger/shared/src/scoring/totals';
import { totalOnlyShotCount } from '@shotledger/shared/src/scoring/volume';
import { isLocalPhotoUri, parseSyncPhotoUri } from '@shotledger/shared/src/sync-client/photo-uri';
import { tagNamesBySession } from '@shotledger/shared/src/tags/canonical';

import { faltSessionResultOf } from '../../../app/src/features/session/falt-session-result';
import {
  faltSummaryOf,
  type FaltResultSummary,
} from '../../../app/src/features/session/format-falt-result';
import type { PulledTables } from '../pull';
import { liveRows, tagRecords } from '../stats-inputs';

/** An uploaded photo by id, one still only on the phone, or none. */
export type PhotoRef = { kind: 'uploaded'; photoId: string } | { kind: 'local' } | null;

export function photoRefOf(uri: string | null | undefined): PhotoRef {
  const photoId = parseSyncPhotoUri(uri);
  if (photoId !== null) return { kind: 'uploaded', photoId };
  return isLocalPhotoUri(uri) ? { kind: 'local' } : null;
}

export interface BrowseStation extends StationExport {
  photo: PhotoRef;
}

export interface BrowseSeries {
  position: number;
  photo: PhotoRef;
  isSighter: boolean;
  isFinal: boolean;
  shots: EntryShot[];
  /** The shots' sum, or the stored total of an imported series with no shots. */
  totalTenths: number;
  /** The program stage (helmatch delmoment) the series belongs to, else null. */
  stage: string | null;
}

export interface BrowseSession extends Omit<SessionExport, 'series'> {
  series: BrowseSeries[];
  stations: BrowseStation[];
  results: SessionResults;
  stageSubtotals: StageSubtotal[];
  seriesAverageTenths: number | null;
  innerTenCount: number;
  innerTenAverage: number | null;
  /** A hits discipline's result over its scoring stations; null for ring sessions. */
  falt: FaltResultSummary | null;
}

/** Photo uris by `<sessionId>#<position>`; the export leaves them out. */
type PhotoUris = Map<string, string | null>;

function photoUris(rows: { sessionId: string; position: number; photoUri?: string | null }[]) {
  return new Map(rows.map((row) => [`${row.sessionId}#${row.position}`, row.photoUri ?? null]));
}

function browseSession(
  session: SessionExport,
  seriesPhotos: PhotoUris,
  stationPhotos: PhotoUris,
): BrowseSession {
  const photoAt = (uris: PhotoUris, position: number) =>
    photoRefOf(uris.get(`${session.id}#${position}`));
  const series: BrowseSeries[] = session.series.map((row) => ({
    position: row.position,
    photo: photoAt(seriesPhotos, row.position),
    isSighter: row.isSighter,
    isFinal: row.isFinal,
    shots: row.shots.map(({ valueTenths, isInnerTen }) => ({ valueTenths, isInnerTen })),
    totalTenths: row.totalOverride
      ? row.totalOverride.tenths
      : row.shots.reduce((sum, shot) => sum + shot.valueTenths, 0),
    stage: seriesStage(session.programId, row.position),
  }));

  const seriesLength = disciplineSeriesLength(session.disciplineId);
  const forResults = session.series.map((row) => ({
    isSighter: row.isSighter,
    isFinal: row.isFinal,
    shots: row.shots,
    totalOverride: row.totalOverride
      ? {
          tenths: row.totalOverride.tenths,
          shotCount: totalOnlyShotCount(row.totalOverride.shotCount, seriesLength),
        }
      : null,
  }));
  const program = session.programId ? getProgram(session.programId) : undefined;
  const scoresHits = getDiscipline(session.disciplineId)?.scoring === 'hits';

  return {
    ...session,
    series,
    stations: session.stations.map((row) => ({
      ...row,
      photo: photoAt(stationPhotos, row.position),
    })),
    results: sessionResults(forResults),
    stageSubtotals: program ? stageSubtotals(programStages(program), series) : [],
    seriesAverageTenths: seriesAverageTenths(forResults),
    innerTenCount: sessionInnerTenCount(forResults),
    innerTenAverage: seriesInnerTenAverage(forResults),
    falt: scoresHits
      ? faltSummaryOf(session.faltResultMode, faltSessionResultOf(session.stations))
      : null,
  };
}

export interface SeriesSection {
  /** Titled only when a final splits the session in two. */
  title: 'main' | 'final' | null;
  series: BrowseSeries[];
}

/** The detail's series groups; an empty group is left out. */
export function seriesSections(series: readonly BrowseSeries[]): SeriesSection[] {
  const main = series.filter((row) => !row.isFinal);
  const final = series.filter((row) => row.isFinal);
  if (final.length === 0) return main.length === 0 ? [] : [{ title: null, series: main }];
  const sections: SeriesSection[] = [
    { title: 'main', series: main },
    { title: 'final', series: final },
  ];
  return sections.filter((section) => section.series.length > 0);
}

/** Every live session, newest first. */
export function browseSessions(tables: PulledTables): BrowseSession[] {
  const sessionRows = liveRows<ExportSessionRow>(tables.sessions);
  const { tags, links } = tagRecords(tables);
  type WithPhoto = { photoUri?: string | null };
  const seriesRows = liveRows<ExportSeriesRow & WithPhoto>(tables.series);
  const stationRows = liveRows<ExportStationRow & WithPhoto>(tables.falt_stations);
  const seriesPhotos = photoUris(seriesRows);
  const stationPhotos = photoUris(stationRows);
  return sessionExportsFromRows({
    sessions: sessionRows,
    series: seriesRows,
    shots: liveRows<ExportShotRow>(tables.shots),
    stations: stationRows,
    firearms: liveRows<ExportFirearmRow>(tables.firearms),
    ammoLots: liveRows<ExportAmmoLotRow>(tables.ammo_lots),
    tagsBySession: tagNamesBySession(tags, links),
  })
    .sort(
      (a, b) => b.startedAt.localeCompare(a.startedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .map((session) => browseSession(session, seriesPhotos, stationPhotos));
}

/** An uploaded photo with the series or station it belongs to. */
export type PhotoOwner =
  | { photoId: string; session: BrowseSession; series: BrowseSeries }
  | { photoId: string; session: BrowseSession; station: BrowseStation };

/** Every uploaded photo by id, for resolving a pick. */
export function photoOwners(sessions: readonly BrowseSession[]): Map<string, PhotoOwner> {
  const owners = new Map<string, PhotoOwner>();
  for (const session of sessions) {
    for (const series of session.series) {
      if (series.photo?.kind === 'uploaded') {
        owners.set(series.photo.photoId, { photoId: series.photo.photoId, session, series });
      }
    }
    for (const station of session.stations) {
      if (station.photo?.kind === 'uploaded') {
        owners.set(station.photo.photoId, { photoId: station.photo.photoId, session, station });
      }
    }
  }
  return owners;
}

/** The session's uploaded photo ids, in the order the detail lists them. */
export function sessionPhotoIds(session: BrowseSession): string[] {
  return [...session.series, ...session.stations].flatMap((row) =>
    row.photo?.kind === 'uploaded' ? [row.photo.photoId] : [],
  );
}
