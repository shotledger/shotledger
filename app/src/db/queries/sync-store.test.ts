import {
  familyRefusals,
  runSyncCycle,
  SYNC_TABLE_NAMES,
  type ChangeRow,
  type SyncTableName,
  type SyncTransport,
} from '@shotledger/shared';
import { fullRow } from '@shotledger/shared/src/sync/payload-fixtures';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  firearms,
  licenses,
  photoQueue,
  series,
  sessionTags,
  sessions,
  shots,
  syncControl,
  syncOutbox,
  syncRefused,
  syncState,
} from '../schema';
import * as schema from '../schema';
import { createTestDb } from '../test-db';
import type { Database as Db } from '../types';
import { createFirearm, softDeleteFirearm, updateFirearm } from './firearms';
import { createSession } from './sessions';
import { getSetting, SETTINGS_KEYS, setSetting } from './settings';
import { enqueuePhotoTask } from './photo-queue';
import {
  createSyncStore,
  readRowSync,
  resetSyncBookkeeping,
  resetSyncState,
  SYNC_TABLES,
} from './sync-store';
import { addSessionTag, getOrCreateTag, listTags, listTagsForSession, softDeleteTag } from './tags';

let db: Db;
let store: ReturnType<typeof createSyncStore>;

beforeEach(() => {
  db = createTestDb();
  store = createSyncStore(db);
});

function outboxRows() {
  return db.select().from(syncOutbox).all();
}

describe('SYNC_TABLES', () => {
  it('covers every table the protocol can name', () => {
    expect(Object.keys(SYNC_TABLES).sort()).toEqual([...SYNC_TABLE_NAMES].sort());
  });
});

describe('outbox triggers', () => {
  it('queues exactly one entry for an insert', () => {
    createFirearm(db, { make: 'Pardini', model: 'SP' });
    const rows = outboxRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tableName).toBe('firearms');
    expect(rows[0]!.clientChangeId).toBeNull();
  });

  it('coalesces repeated edits into one entry with a rising rev', () => {
    const id = createFirearm(db, { make: 'Pardini', model: 'SP' }).id;
    const first = outboxRows()[0]!.rev;
    for (let i = 0; i < 5; i += 1) updateFirearm(db, id, { model: `SP${i}` });
    const rows = outboxRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.rev).toBeGreaterThan(first);
  });

  it('captures a soft delete through the update trigger', () => {
    const id = createFirearm(db, { make: 'Pardini', model: 'SP' }).id;
    db.delete(syncOutbox).run();
    softDeleteFirearm(db, id);
    expect(outboxRows()).toHaveLength(1);
  });

  it('queues nothing while the applying flag is set', () => {
    db.update(syncControl).set({ applying: 1 }).where(eq(syncControl.id, 0)).run();
    createFirearm(db, { make: 'Ghost', model: 'X' });
    expect(outboxRows()).toHaveLength(0);
  });

  it('resets the assigned change id when the row is edited again', async () => {
    const id = createFirearm(db, { make: 'Pardini', model: 'SP' }).id;
    const entry = (await store.readOutbox(10))[0]!;
    await store.assignClientChangeId(entry, '11111111-1111-4111-8111-111111111111');
    expect((await store.readOutbox(10))[0]!.clientChangeId).not.toBeNull();

    updateFirearm(db, id, { model: 'SP1' });
    expect((await store.readOutbox(10))[0]!.clientChangeId).toBeNull();
  });
});

describe('clearOutboxEntry', () => {
  it('deletes the entry when the rev still matches', async () => {
    createFirearm(db, { make: 'Pardini', model: 'SP' });
    const entry = (await store.readOutbox(10))[0]!;
    await store.clearOutboxEntry(entry);
    expect(outboxRows()).toHaveLength(0);
  });

  it('keeps an entry that was re-queued while the push was in flight', async () => {
    const id = createFirearm(db, { make: 'Pardini', model: 'SP' }).id;
    const entry = (await store.readOutbox(10))[0]!;
    updateFirearm(db, id, { model: 'SP1' });
    await store.clearOutboxEntry(entry);
    expect(outboxRows()).toHaveLength(1);
  });
});

describe('cursors', () => {
  it('reads 0 for every table before the first sync', async () => {
    const cursors = await store.readCursors();
    expect(Object.values(cursors).every((c) => c === 0)).toBe(true);
  });

  it('round-trips a written cursor', async () => {
    await store.setCursor('sessions', 12);
    await store.setCursor('sessions', 30);
    expect((await store.readCursors()).sessions).toBe(30);
  });
});

describe('readRow', () => {
  it('returns the row as a column-named payload', async () => {
    const id = createFirearm(db, { make: 'Pardini', model: 'SP', caliber: '.22 LR' }).id;
    const snapshot = await store.readRow('firearms', id);
    const payload = snapshot!.payload as Record<string, unknown>;
    expect(payload.id).toBe(id);
    expect(payload.make).toBe('Pardini');
    expect(payload.round_count).toBe(0);
    expect(snapshot!.deletedAt).toBeNull();
  });

  it('reports the tombstone on a soft-deleted row', () => {
    const id = createFirearm(db, { make: 'Pardini', model: 'SP' }).id;
    softDeleteFirearm(db, id);
    expect(readRowSync(db, 'firearms', id)!.deletedAt).not.toBeNull();
  });

  it('returns undefined for a row that is gone', async () => {
    expect(await store.readRow('firearms', 'nope')).toBeUndefined();
  });
});

function change(over: Partial<ChangeRow> & Pick<ChangeRow, 'tableName' | 'rowId'>): ChangeRow {
  return {
    seq: 1,
    payload: null,
    deletedAt: null,
    updatedAt: '2026-09-02T10:00:00.000Z',
    ...over,
  } as ChangeRow;
}

describe('applyChanges', () => {
  it('inserts a pulled row without re-queueing it', async () => {
    await store.applyChanges([
      change({
        tableName: 'firearms',
        rowId: 'remote-1',
        payload: {
          id: 'remote-1',
          created_at: '2026-09-01T00:00:00.000Z',
          updated_at: '2026-09-01T00:00:00.000Z',
          deleted_at: null,
          make: 'Walther',
          model: 'GSP',
          round_count: 0,
          rounds_since_maintenance: 0,
        },
      }),
    ]);

    expect(db.select().from(firearms).all()).toHaveLength(1);
    expect(outboxRows()).toHaveLength(0);
  });

  it('updates an existing row on a second apply', async () => {
    const payload = {
      id: 'remote-1',
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
      deleted_at: null,
      make: 'Walther',
      model: 'GSP',
      round_count: 0,
      rounds_since_maintenance: 0,
    };
    await store.applyChanges([change({ tableName: 'firearms', rowId: 'remote-1', payload })]);
    await store.applyChanges([
      change({ tableName: 'firearms', rowId: 'remote-1', payload: { ...payload, model: 'GSP-2' } }),
    ]);

    const rows = db.select().from(firearms).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.model).toBe('GSP-2');
  });

  it('tombstones a local row', async () => {
    const id = createFirearm(db, { make: 'Pardini', model: 'SP' }).id;
    db.delete(syncOutbox).run();
    await store.applyChanges([
      change({
        tableName: 'firearms',
        rowId: id,
        payload: null,
        deletedAt: '2026-09-02T11:00:00Z',
      }),
    ]);

    expect(db.select().from(firearms).where(eq(firearms.id, id)).get()!.deletedAt).toBe(
      '2026-09-02T11:00:00Z',
    );
    expect(outboxRows()).toHaveLength(0);
  });

  it('ignores a tombstone for a row it has never seen', async () => {
    await expect(
      store.applyChanges([
        change({ tableName: 'sessions', rowId: 'unknown', deletedAt: '2026-09-02T11:00:00Z' }),
      ]),
    ).resolves.toBeUndefined();
    expect(db.select().from(sessions).all()).toHaveLength(0);
  });

  it('drops columns this build does not know and payloads with no id', async () => {
    await store.applyChanges([
      change({
        tableName: 'firearms',
        rowId: 'remote-2',
        payload: {
          id: 'remote-2',
          created_at: 'c',
          updated_at: 'u',
          deleted_at: null,
          make: 'A',
          model: 'B',
          round_count: 0,
          rounds_since_maintenance: 0,
          invented_by_a_newer_server: 'ignored',
        },
      }),
      change({ tableName: 'firearms', rowId: 'remote-3', payload: { make: 'no id' } }),
    ]);

    const rows = db.select().from(firearms).all();
    expect(rows.map((r) => r.id)).toEqual(['remote-2']);
  });

  it('C3 applies rows from a build that still has the columns #727 dropped', async () => {
    const at = '2026-09-01T00:00:00.000Z';
    const common = { created_at: at, updated_at: at, deleted_at: null };
    await store.applyChanges([
      change({
        tableName: 'sessions',
        rowId: 'old-s',
        payload: {
          id: 'old-s',
          ...common,
          name: 'Imported',
          type: 'competition',
          discipline_id: 'precision',
          started_at: at,
          external_source: 'webshooter',
          external_ref: '1:2',
          external_synced_at: at,
          webshooter_competition_id: '1',
        },
      }),
      change({
        tableName: 'series',
        rowId: 'old-r',
        payload: { id: 'old-r', ...common, session_id: 'old-s', position: 1, note: 'särskjutning' },
      }),
      change({
        tableName: 'shots',
        rowId: 'old-h',
        payload: {
          id: 'old-h',
          ...common,
          series_id: 'old-r',
          position: 1,
          value_tenths: 100,
          is_inner_ten: 1,
          is_inner_ten_decimal: 0,
        },
      }),
    ]);

    expect(db.select().from(sessions).where(eq(sessions.id, 'old-s')).get()?.externalRef).toBe(
      '1:2',
    );
    expect(db.select().from(series).where(eq(series.id, 'old-r')).get()?.isShootOff).toBe(0);
    expect(db.select().from(shots).where(eq(shots.id, 'old-h')).get()?.isInnerTen).toBe(1);
  });

  it('applies a license row from a device that still has vault_document_id', async () => {
    // Issue #276 dropped `licenses.vault_document_id`. A device on an older
    // build still puts it in the payload; the row must land anyway, with the
    // column silently dropped.
    const firearmId = createFirearm(db, { make: 'Pardini', model: 'SP' }).id;
    await store.applyChanges([
      change({
        tableName: 'licenses',
        rowId: 'lic-1',
        payload: {
          id: 'lic-1',
          created_at: '2026-09-01T00:00:00.000Z',
          updated_at: '2026-09-01T00:00:00.000Z',
          deleted_at: null,
          firearm_id: firearmId,
          license_number: 'A000.000/2026-01',
          vault_document_id: 'doc-from-an-older-build',
        },
      }),
    ]);

    const row = db.select().from(licenses).where(eq(licenses.id, 'lic-1')).get();
    expect(row?.licenseNumber).toBe('A000.000/2026-01');
    expect('vaultDocumentId' in (row ?? {})).toBe(false);
  });

  it('does nothing for an empty change list', async () => {
    await store.applyChanges([]);
    expect(db.select().from(firearms).all()).toHaveLength(0);
  });

  it('leaves the applying flag off afterwards, even after a failure', async () => {
    await expect(
      store.applyChanges([change({ tableName: 'shots', rowId: 'x', payload: { id: 'x' } })]),
    ).rejects.toThrow();
    expect(db.select().from(syncControl).get()!.applying).toBe(0);
    createFirearm(db, { make: 'After', model: 'Failure' });
    expect(outboxRows()).toHaveLength(1);
  });
});

describe('pendingCount and resetSyncState', () => {
  it('counts queued entries and clears everything on sign-out', async () => {
    createFirearm(db, { make: 'Pardini', model: 'SP' });
    await store.setCursor('sessions', 5);
    expect(await store.pendingCount()).toBe(1);

    resetSyncState(db);

    expect(await store.pendingCount()).toBe(0);
    expect((await store.readCursors()).sessions).toBe(0);
  });
});

// docs/specs/backup-sync-bookkeeping-spec.md §3 (#757).
describe('resetSyncBookkeeping', () => {
  async function withBookkeeping() {
    const firearm = createFirearm(db, { make: 'Pardini', model: 'SP' });
    createSession(db, {
      name: 'S',
      type: 'training',
      disciplineId: 'spsf-precision',
      firearmId: firearm.id,
      startedAt: '2026-10-01T10:00:00.000Z',
    });
    await store.setCursor('sessions', 41);
    await store.setCursor('firearms', 9);
    enqueuePhotoTask(db, 'upload', 'photo-1', 'file:///other-device/photo-1.jpg');
    db.update(syncControl).set({ applying: 1, lastRev: 7 }).where(eq(syncControl.id, 0)).run();
  }

  const userRows = () =>
    Object.fromEntries(
      Object.entries(SYNC_TABLES).map(([name, table]) => [name, db.select().from(table).all()]),
    );

  it('B1 empties the outbox, the cursors and the photo queue', async () => {
    await withBookkeeping();
    expect(outboxRows().length).toBeGreaterThan(0);

    resetSyncBookkeeping(db);

    expect(outboxRows()).toEqual([]);
    expect(db.select().from(syncState).all()).toEqual([]);
    expect(db.select().from(photoQueue).all()).toEqual([]);
  });

  it('B2 returns sync_control to a fresh install', async () => {
    await withBookkeeping();
    resetSyncBookkeeping(db);
    expect(db.select().from(syncControl).all()).toEqual([{ id: 0, applying: 0, lastRev: 0 }]);
  });

  it('B3 leaves every synced table exactly as it was', async () => {
    await withBookkeeping();
    const before = userRows();
    expect(before.sessions).toHaveLength(1);
    resetSyncBookkeeping(db);
    expect(userRows()).toEqual(before);
  });

  it('B4 queues the next local edit again, from rev 1', async () => {
    await withBookkeeping();
    resetSyncBookkeeping(db);

    const firearm = createFirearm(db, { make: 'Walther', model: 'GSP' });

    expect(outboxRows()).toEqual([
      { tableName: 'firearms', rowId: firearm.id, rev: 1, clientChangeId: null, held: 0 },
    ]);
  });

  it('B5 recreates a missing sync_control row, so edits are still queued', () => {
    db.delete(syncControl).run();
    createFirearm(db, { make: 'Lost', model: 'Row' });
    expect(outboxRows()).toEqual([]);

    resetSyncBookkeeping(db);
    createFirearm(db, { make: 'Found', model: 'Row' });

    expect(db.select().from(syncControl).all()).toEqual([{ id: 0, applying: 0, lastRev: 1 }]);
    expect(outboxRows()).toHaveLength(1);
  });

  it('B6 makes the next sync pull every table from the start', async () => {
    await withBookkeeping();
    resetSyncBookkeeping(db);
    const cursors = await store.readCursors();
    expect(Object.values(cursors).every((cursor) => cursor === 0)).toBe(true);
    expect(Object.keys(cursors).sort()).toEqual([...SYNC_TABLE_NAMES].sort());
  });
});

// docs/specs/sync-tags-settings-spec.md §2.3–§2.5.
describe('session_tags and settings', () => {
  const T = '2026-10-06T00:00:00.000Z';
  const settingRow = (id: string, value: string) =>
    change({
      tableName: 'settings',
      rowId: id,
      payload: { id, value, created_at: T, updated_at: T, deleted_at: null },
    });

  it('A4 applies a pulled tag link and a pulled setting without re-queueing them', async () => {
    const sessionId = createSession(db, {
      name: 'S',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: T,
    }).id;
    const tagId = getOrCreateTag(db, 'KM').id;
    db.delete(syncOutbox).run();

    await store.applyChanges([
      change({
        tableName: 'session_tags',
        rowId: 'link-1',
        payload: {
          id: 'link-1',
          created_at: T,
          updated_at: T,
          deleted_at: null,
          session_id: sessionId,
          tag_id: tagId,
        },
      }),
      settingRow('birthYear', '1980'),
    ]);

    expect(listTagsForSession(db, sessionId).map((t) => t.name)).toEqual(['KM']);
    expect(getSetting(db, SETTINGS_KEYS.birthYear, null)).toBe(1980);
    expect(outboxRows()).toHaveLength(0);
  });

  it('a pulled link tombstone unlinks the session', async () => {
    const sessionId = createSession(db, {
      name: 'S',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: T,
    }).id;
    addSessionTag(db, sessionId, getOrCreateTag(db, 'KM').id);
    const linkId = db.select().from(sessionTags).get()!.id;
    await store.applyChanges([
      change({ tableName: 'session_tags', rowId: linkId, payload: null, deletedAt: T }),
    ]);
    expect(listTagsForSession(db, sessionId)).toEqual([]);
  });

  it('S4 a pulled non-allowlisted setting is dropped, an allowlisted one applied', async () => {
    setSetting(db, 'backupFolder', 'mine');
    await store.applyChanges([
      settingRow('backupFolder', '"theirs"'),
      settingRow('skillClass', '2'),
    ]);
    expect(getSetting(db, 'backupFolder', null)).toBe('mine');
    expect(getSetting(db, SETTINGS_KEYS.skillClass, null)).toBe(2);
  });

  it('S4b a pulled setting whose payload id differs from its row id is dropped', async () => {
    setSetting(db, 'backupFolder', 'mine');
    await store.applyChanges([
      change({
        tableName: 'settings',
        rowId: 'birthYear',
        payload: { id: 'backupFolder', value: '"theirs"', created_at: T, updated_at: T },
      }),
    ]);
    expect(getSetting(db, 'backupFolder', null)).toBe('mine');
    expect(getSetting(db, SETTINGS_KEYS.birthYear, null)).toBeNull();
  });

  const pulledTag = (id: string, name: string) =>
    change({
      tableName: 'tags',
      rowId: id,
      payload: { id, name, created_at: T, updated_at: T, deleted_at: null },
    });

  it('E7 applying a pulled tag whose name already exists here succeeds, and lists once', async () => {
    const local = getOrCreateTag(db, 'KM');
    await expect(
      store.applyChanges([pulledTag('00000000-0000-7000-8000-000000000001', 'KM')]),
    ).resolves.toBeUndefined();
    expect(listTags(db).map((t) => t.name)).toEqual(['KM']);
    expect(listTags(db)[0]!.id).not.toBe(local.id);
  });

  it('E8 applying a pulled re-created tag over a deleted one of that name succeeds', async () => {
    const old = getOrCreateTag(db, 'KM');
    softDeleteTag(db, old.id);
    await store.applyChanges([pulledTag('ffffffff-ffff-7fff-bfff-ffffffffffff', 'KM')]);
    expect(listTags(db).map((t) => t.id)).toEqual(['ffffffff-ffff-7fff-bfff-ffffffffffff']);
  });

  it('reads a synced setting back as its wire payload', () => {
    setSetting(db, SETTINGS_KEYS.complianceProfile, 'se');
    const row = readRowSync(db, 'settings', 'complianceProfile');
    expect(row?.payload).toEqual(
      expect.objectContaining({ id: 'complianceProfile', value: '"se"', deleted_at: null }),
    );
    expect(row?.deletedAt).toBeNull();
  });
});

// docs/specs/sync-family-refusal-spec.md §2.3, C5: held entries and the
// refused set live in the outbox and in sync_refused.
describe('held entries and the refused set', () => {
  async function heldSession() {
    const session = createSession(db, {
      name: 'S',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: '2026-10-14T10:00:00.000Z',
    });
    const entry = (await store.readOutbox(10))[0]!;
    await store.assignClientChangeId(entry, '11111111-1111-4111-8111-111111111111');
    return { session, entry: (await store.readOutbox(10))[0]! };
  }

  it('readOutbox skips a held entry; heldCount and pendingCount still see it', async () => {
    const { entry } = await heldSession();
    createFirearm(db, { make: 'Pardini', model: 'SP' });

    await store.holdOutboxEntry(entry, false);

    expect((await store.readOutbox(10)).map((e) => e.tableName)).toEqual(['firearms']);
    expect(await store.heldCount()).toBe(1);
    expect(await store.pendingCount()).toBe(2);
    expect(outboxRows().find((r) => r.tableName === 'sessions')).toMatchObject({
      held: 1,
      clientChangeId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('a family_refused hold also resets the change id', async () => {
    const { entry } = await heldSession();
    await store.holdOutboxEntry(entry, true);
    expect(outboxRows()[0]).toMatchObject({ held: 1, clientChangeId: null });
  });

  it('holds only while the rev still matches', async () => {
    const { session, entry } = await heldSession();
    db.update(sessions).set({ name: 'S2' }).where(eq(sessions.id, session.id)).run();
    await store.holdOutboxEntry(entry, true);
    expect(outboxRows()[0]).toMatchObject({ held: 0, clientChangeId: null });
  });

  it('an edit of a held row keeps it held, with a new rev and no id (§2.3)', async () => {
    const { session, entry } = await heldSession();
    await store.holdOutboxEntry(entry, false);
    db.update(sessions).set({ name: 'S2' }).where(eq(sessions.id, session.id)).run();
    const [row] = outboxRows();
    expect(row).toMatchObject({ held: 1, clientChangeId: null });
    expect(row!.rev).toBeGreaterThan(entry.rev);
  });

  it('readHeld returns the held entries only (Revision 2 item 8)', async () => {
    const { entry } = await heldSession();
    createFirearm(db, { make: 'Pardini', model: 'SP' });
    expect(await store.readHeld()).toEqual([]);

    await store.holdOutboxEntry(entry, true);

    expect(await store.readHeld()).toEqual([{ ...entry, clientChangeId: null }]);
  });

  it('releaseHeld un-holds the named entries only, whatever their rev', async () => {
    const { session, entry } = await heldSession();
    createFirearm(db, { make: 'Pardini', model: 'SP' });
    const firearm = (await store.readOutbox(10)).find((e) => e.tableName === 'firearms')!;
    await store.holdOutboxEntry(entry, false);
    await store.holdOutboxEntry(firearm, false);
    // An edit since the entry was read: a new rev, still held.
    db.update(sessions).set({ name: 'S2' }).where(eq(sessions.id, session.id)).run();

    await store.releaseHeld([{ tableName: 'sessions', rowId: session.id }]);

    expect(await store.heldCount()).toBe(1);
    expect((await store.readOutbox(10)).map((e) => e.tableName)).toEqual(['sessions']);
    expect((await store.readHeld()).map((e) => e.tableName)).toEqual(['firearms']);
  });

  it('adds, reads and removes refused rows; adding twice keeps one', async () => {
    await store.addRefused({ tableName: 'sessions', rowId: 's1' });
    await store.addRefused({ tableName: 'sessions', rowId: 's1' });
    await store.addRefused({ tableName: 'shots', rowId: 't1' });
    await store.addRefused({ tableName: 'licenses', rowId: 's1' });
    expect(await store.readRefused()).toHaveLength(3);

    await store.removeRefused([
      { tableName: 'sessions', rowId: 's1' },
      { tableName: 'shots', rowId: 'gone' },
    ]);
    expect((await store.readRefused()).map((r) => `${r.tableName}:${r.rowId}`).sort()).toEqual([
      'licenses:s1',
      'shots:t1',
    ]);
  });

  it('H11 the held count survives a restart', async () => {
    // Its own database, typed as better-sqlite3's, so it can be copied to a file.
    const live = createTestDb();
    const liveStore = createSyncStore(live);
    for (let i = 0; i < 3; i += 1) {
      createFirearm(live, { make: 'Pardini', model: `SP${i}` });
    }
    for (const entry of await liveStore.readOutbox(10)) {
      await liveStore.holdOutboxEntry(entry, false);
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-856-'));
    try {
      const file = path.join(dir, 'restart.sqlite3');
      live.$client.prepare('VACUUM INTO ?').run(file);
      const reopened = new Database(file);
      try {
        const after = createSyncStore(drizzle(reopened, { schema }) as unknown as Db);
        expect(await after.heldCount()).toBe(3);
      } finally {
        reopened.close();
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sign-out and a backup reset both empty the refused set', async () => {
    await store.addRefused({ tableName: 'sessions', rowId: 's1' });
    resetSyncState(db);
    expect(db.select().from(syncRefused).all()).toEqual([]);

    await store.addRefused({ tableName: 'sessions', rowId: 's1' });
    resetSyncBookkeeping(db);
    expect(db.select().from(syncRefused).all()).toEqual([]);
  });
});

// Verifier round 1, finding B1 (sync-family-refusal-spec.md Revision 2 item
// 6): C3 wins over §2.3's "an edit keeps it held". A soft delete of a held
// row releases it, so the deletion goes out on the next push.
describe('a deletion of a held row is never held (C3)', () => {
  /** The better-sqlite3 handle under the test database, for raw statements. */
  const sqlite = () => (db as ReturnType<typeof createTestDb>).$client;
  function insertRow(tableName: SyncTableName): string {
    const id = tableName === 'settings' ? 'birthYear' : `${tableName}-1`;
    const row = fullRow(tableName, id, tableName === 'settings' ? { value: '1980' } : {});
    const columns = Object.keys(row);
    sqlite()
      .prepare(
        `INSERT INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns
          .map(() => '?')
          .join(', ')})`,
      )
      .run(...columns.map((c) => (typeof row[c] === 'boolean' ? Number(row[c]) : row[c])));
    return id;
  }
  const entryOf = (tableName: string, rowId: string) =>
    outboxRows().find((r) => r.tableName === tableName && r.rowId === rowId);

  it.each(SYNC_TABLE_NAMES.map((t) => [t]))(
    '%s: an edit keeps the entry held, a soft delete releases it',
    async (tableName) => {
      sqlite().pragma('foreign_keys = OFF');
      const id = insertRow(tableName);
      const queued = (await store.readOutbox(10)).find((e) => e.rowId === id)!;
      await store.holdOutboxEntry(queued, false);

      sqlite()
        .prepare(`UPDATE "${tableName}" SET "updated_at" = ? WHERE "id" = ?`)
        .run('2026-10-16T10:00:00.000Z', id);
      expect(entryOf(tableName, id)).toMatchObject({ held: 1 });

      sqlite()
        .prepare(`UPDATE "${tableName}" SET "deleted_at" = ?, "updated_at" = ? WHERE "id" = ?`)
        .run('2026-10-16T11:00:00.000Z', '2026-10-16T11:00:00.000Z', id);
      expect(entryOf(tableName, id)).toMatchObject({ held: 0, clientChangeId: null });
      expect((await store.readOutbox(10)).map((e) => e.rowId)).toContain(id);
    },
  );

  it('V1 a held shot deleted after its session was refused is pushed (real store and engine)', async () => {
    const T0 = '2026-10-14T10:00:00.000Z';
    const T1 = '2026-10-14T11:00:00.000Z';
    const session = createSession(db, {
      name: 'S',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: T0,
    });
    db.insert(series)
      .values({ id: 'r1', sessionId: session.id, position: 1, createdAt: T0, updatedAt: T0 })
      .run();
    db.insert(shots)
      .values({
        id: 't1',
        seriesId: 'r1',
        position: 1,
        valueTenths: 90,
        createdAt: T0,
        updatedAt: T0,
      })
      .run();

    // A server that refuses the rows named in `invalid`, and their family.
    const invalid = new Set<string>();
    const pushes: string[][] = [];
    let seq = 0;
    const transport: SyncTransport = {
      pull: async (request) => ({
        protocolVersion: request.protocolVersion,
        changes: [],
        nextCursors: request.tables.map((t) => ({ ...t, hasMore: false })),
      }),
      push: async (request) => {
        pushes.push(
          request.changes.map((c) => `${c.tableName}:${c.rowId}:${c.deletedAt ? 'del' : 'live'}`),
        );
        const bad = new Set<number>();
        request.changes.forEach((c, i) => {
          if (c.deletedAt === null && invalid.has(`${c.tableName}:${c.rowId}`)) bad.add(i);
        });
        const family = familyRefusals(request.changes, bad);
        return {
          protocolVersion: request.protocolVersion,
          acks: request.changes.map((c, i) =>
            bad.has(i)
              ? {
                  clientChangeId: c.clientChangeId,
                  status: 'rejected' as const,
                  reason: 'invalid_payload',
                }
              : family.has(i)
                ? {
                    clientChangeId: c.clientChangeId,
                    status: 'rejected' as const,
                    reason: 'family_refused',
                  }
                : { clientChangeId: c.clientChangeId, status: 'applied' as const, seq: (seq += 1) },
          ),
        };
      },
    };
    let n = 0;
    const deps = {
      store,
      transport,
      newId: () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`,
    };
    await runSyncCycle(deps);
    expect(await store.pendingCount()).toBe(0);

    invalid.add(`sessions:${session.id}`);
    db.update(sessions)
      .set({ notes: 'bad', updatedAt: T1 })
      .where(eq(sessions.id, session.id))
      .run();
    await expect(runSyncCycle(deps)).resolves.toMatchObject({ invalid: 1 });

    db.update(shots).set({ valueTenths: 80, updatedAt: T1 }).where(eq(shots.id, 't1')).run();
    await expect(runSyncCycle(deps)).resolves.toMatchObject({ held: 1 });

    pushes.length = 0;
    db.update(shots).set({ deletedAt: T1, updatedAt: T1 }).where(eq(shots.id, 't1')).run();
    const result = await runSyncCycle(deps);

    expect(pushes).toEqual([['shots:t1:del']]);
    expect(result).toMatchObject({ pushed: 1, held: 0 });
    expect(outboxRows()).toEqual([]);
  });
});
