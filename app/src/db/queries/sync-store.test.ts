import { SYNC_TABLE_NAMES, type ChangeRow } from '@shotledger/shared';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { firearms, licenses, sessionTags, sessions, syncControl, syncOutbox } from '../schema';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { createFirearm, softDeleteFirearm, updateFirearm } from './firearms';
import { createSession } from './sessions';
import { getSetting, SETTINGS_KEYS, setSetting } from './settings';
import { createSyncStore, readRowSync, resetSyncState, SYNC_TABLES } from './sync-store';
import { addSessionTag, getOrCreateTag, listTags, listTagsForSession, softDeleteTag } from './tags';

let db: Database;
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
