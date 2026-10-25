// A photo on a web-built series reaches the phone like any synced photo
// (docs/specs/web-entry-photo-spec.md A4–A5): applied through the phone's
// real apply path, its marker queues a download, never an upload.
import {
  buildSessionEntry,
  newSeriesRow,
  parseSyncPhotoUri,
  type ChangeRow,
} from '@shotledger/shared';
import { getTableColumns } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';

import { series, syncOutbox } from '../schema';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { listPhotoQueue, reconcilePhotoQueue } from './photo-queue';
import { listSeriesPhotos } from './photos';
import { listSeriesForSession } from './series';
import { listShotsForSeries } from './shots';
import { applyChangesSync } from './sync-store';
import { serverRefusals } from '../sync-conformance';

const NOW = '2026-10-07T10:00:00.000Z';

describe('a web-built series with a photo on the phone schema', () => {
  let db: Database;
  let sessionId: string;
  let photos: { row: number; photoId: string }[];

  beforeEach(() => {
    db = createTestDb();
    let n = 0;
    const result = buildSessionEntry(
      {
        type: 'training',
        disciplineId: 'spsf-precision',
        programId: null,
        startedAt: '2026-10-06T16:00:00.000Z',
        name: '',
        defaultName: 'Training — 6 Oct 2026',
        location: '',
        competitionLevel: null,
        isChampionship: false,
        competitionName: '',
        weaponGroup: null,
        shooterClass: null,
        eventId: null,
        firearmId: null,
        ammoLotId: null,
        decimalScoring: false,
        seriesLength: null,
        series: [
          { text: '10 9 X 10 9', isSighter: false, hasPhoto: true },
          { text: '', isSighter: false, hasPhoto: true },
          { text: '8 7 6 5 4', isSighter: false },
        ],
      },
      { firearms: new Map(), firearmGroups: [], ammoLots: new Map() },
      {
        newId: uuidv7,
        newChangeId: () => `00000000-0000-4000-8000-${(n += 1).toString(16).padStart(12, '0')}`,
        now: () => NOW,
      },
    );
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    sessionId = result.sessionId;
    photos = result.photos;
    expect(serverRefusals(result.changes)).toEqual([]);
    const pulled: ChangeRow[] = result.changes.map((change, index) => ({
      tableName: change.tableName,
      rowId: change.rowId,
      seq: index + 1,
      arrival: 1,
      payload: change.payload,
      deletedAt: change.deletedAt,
      updatedAt: change.updatedAt,
    }));
    applyChangesSync(db, pulled);
  });

  it('A4 the series reads back with the marker and reconcilePhotoQueue queues one download per photo, no upload', () => {
    const rows = listSeriesForSession(db, sessionId);
    expect(rows.map((r) => [r.position, parseSyncPhotoUri(r.photoUri)])).toEqual([
      [1, rows[0]!.id],
      [2, rows[1]!.id],
      [3, null],
    ]);
    expect(photos).toEqual([
      { row: 1, photoId: rows[0]!.id },
      { row: 2, photoId: rows[1]!.id },
    ]);
    // The photo-only row arrived as a series with no shots, as the phone keeps one.
    expect(listShotsForSeries(db, rows[1]!.id)).toHaveLength(0);
    expect(listSeriesPhotos(db).map((p) => p.seriesId)).toEqual([rows[0]!.id, rows[1]!.id]);

    reconcilePhotoQueue(db, () => false);
    const queue = listPhotoQueue(db);
    expect(queue.map((e) => [e.kind, e.photoId, e.localUri]).sort()).toEqual(
      [
        ['download', rows[0]!.id, null],
        ['download', rows[1]!.id, null],
      ].sort(),
    );
    // Nothing applied is re-queued for push.
    expect(db.select().from(syncOutbox).all()).toHaveLength(0);
  });

  it('A4 a phone that already has the files queues nothing', () => {
    reconcilePhotoQueue(db, () => true);
    expect(listPhotoQueue(db)).toEqual([]);
  });

  it('A5 a series row with a photo still has exactly the table columns', () => {
    const row = newSeriesRow('r', NOW, {
      sessionId: 's',
      position: 1,
      isSighter: false,
      photoUri: 'shotledger-photo:r',
    });
    expect(Object.keys(row).sort()).toEqual(
      Object.values(getTableColumns(series))
        .map((column) => column.name)
        .sort(),
    );
    expect(row.photo_uri).toBe('shotledger-photo:r');
  });
});
