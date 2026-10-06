// "Download everything": the published sessions JSON plus every uploaded
// target photo, as one zip.
import {
  exportSessionsToJson,
  firearmExportsFromRows,
  licenseExportsFromRows,
  sessionExportsFromRows,
  type ExportAmmoLotRow,
  type ExportFirearmRow,
  type ExportSeriesRow,
  type ExportSessionRow,
  type ExportShotRow,
  type ExportStationRow,
  type LicenseExport,
} from '@shotledger/shared/src/json-export';
import { parseSyncPhotoUri } from '@shotledger/shared/src/sync-client/photo-uri';
import { tagNamesBySession } from '@shotledger/shared/src/tags/canonical';

import { liveRows, tagRecords } from '../stats-inputs';
import type { PulledTables } from '../pull';
import { createZip, type ZipEntry } from './zip';

export function sessionsJson(tables: PulledTables, appVersion: string, generatedAt?: string) {
  const { tags, links } = tagRecords(tables);
  return exportSessionsToJson(
    sessionExportsFromRows({
      sessions: liveRows<ExportSessionRow>(tables.sessions),
      series: liveRows<ExportSeriesRow>(tables.series),
      shots: liveRows<ExportShotRow>(tables.shots),
      stations: liveRows<ExportStationRow>(tables.falt_stations),
      firearms: liveRows<ExportFirearmRow>(tables.firearms),
      ammoLots: liveRows<ExportAmmoLotRow>(tables.ammo_lots),
      tagsBySession: tagNamesBySession(tags, links),
    }),
    {
      appVersion,
      generatedAt,
      firearms: firearmExportsFromRows(liveRows<ExportFirearmRow>(tables.firearms)),
      licenses: licenseExportsFromRows(liveRows<LicenseExport>(tables.licenses)),
    },
  );
}

export interface ArchivePhoto {
  photoId: string;
  /** Path inside the zip: `photos/<day> <session name>/…`. */
  path: string;
}

const unsafe = /[\\/:*?"<>|]/g;

/** Every uploaded photo a live series or fält station points at. */
export function archivePhotos(tables: PulledTables): ArchivePhoto[] {
  const sessions = new Map(
    liveRows<{ id: string; name: string; startedAt: string }>(tables.sessions).map((s) => [
      s.id,
      s,
    ]),
  );
  const owners = [
    ...liveRows<{ sessionId: string; position: number; photoUri: string | null }>(
      tables.series,
    ).map((row) => ({ ...row, kind: 'series' })),
    ...liveRows<{ sessionId: string; position: number; photoUri: string | null }>(
      tables.falt_stations,
    ).map((row) => ({ ...row, kind: 'station' })),
  ];

  const photos: ArchivePhoto[] = [];
  const seen = new Set<string>();
  for (const owner of owners) {
    const photoId = parseSyncPhotoUri(owner.photoUri);
    const session = sessions.get(owner.sessionId);
    if (photoId === null || session === undefined || seen.has(photoId)) continue;
    seen.add(photoId);
    const folder = `${session.startedAt.slice(0, 10)} ${session.name}`.replace(unsafe, '_').trim();
    photos.push({
      photoId,
      path: `photos/${folder}/${owner.kind}-${owner.position}-${photoId}.jpg`,
    });
  }
  return photos.sort((a, b) => a.path.localeCompare(b.path));
}

export interface ArchiveProgress {
  done: number;
  total: number;
}

/**
 * Fetches each photo in turn and zips them with the sessions JSON. A photo
 * that fails to download is listed in `missing.txt` instead of failing the
 * whole archive.
 */
export async function buildArchive(
  tables: PulledTables,
  appVersion: string,
  downloadPhoto: (photoId: string) => Promise<ArrayBuffer>,
  onProgress?: (progress: ArchiveProgress) => void,
): Promise<{ zip: Blob; missing: number }> {
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [
    { name: 'sessions.json', data: encoder.encode(sessionsJson(tables, appVersion)) },
  ];
  const photos = archivePhotos(tables);
  const missing: string[] = [];
  onProgress?.({ done: 0, total: photos.length });
  for (const [index, photo] of photos.entries()) {
    try {
      entries.push({ name: photo.path, data: new Uint8Array(await downloadPhoto(photo.photoId)) });
    } catch {
      missing.push(photo.path);
    }
    onProgress?.({ done: index + 1, total: photos.length });
  }
  if (missing.length > 0) {
    entries.push({ name: 'missing.txt', data: encoder.encode(`${missing.join('\n')}\n`) });
  }
  return { zip: createZip(entries), missing: missing.length };
}
