// docs/specs/phone-foreign-keys-spec.md FK1, FK3, FK7.
import type { ChangeRow } from '@shotledger/shared';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  checkForeignKeysOn,
  enableForeignKeys,
  finishOpeningDatabase,
  type PragmaConnection,
} from './foreign-keys';
import { createSession } from './queries/sessions';
import { createSyncStore, readRowSync } from './queries/sync-store';
import { series, shotMarks, shots, syncOutbox, syncPendingRows } from './schema';
import { createTestDb } from './test-db';

const OFF_ERROR =
  'SQLite foreign keys are off; the app needs them on (docs/specs/phone-foreign-keys-spec.md)';

const foreignKeys = (db: ReturnType<typeof createTestDb>) =>
  db.$client.pragma('foreign_keys', { simple: true });

describe('FK1 checkForeignKeysOn', () => {
  it('passes foreign_keys = 1', () => {
    expect(() => checkForeignKeysOn({ foreign_keys: 1 })).not.toThrow();
  });

  it.each([
    [{ foreign_keys: 0 }],
    [undefined],
    [null],
    [{}],
    [{ foreign_keys: '1' }],
    [{ foreign_keys: true }],
    [1],
  ])('throws on %j', (row) => {
    expect(() => checkForeignKeysOn(row)).toThrow(new Error(OFF_ERROR));
  });
});

describe('FK3 enableForeignKeys', () => {
  it('turns foreign keys on and reads them back', () => {
    const db = createTestDb({ foreignKeys: false });
    expect(foreignKeys(db)).toBe(0);
    enableForeignKeys(db);
    expect(foreignKeys(db)).toBe(1);
  });

  it('throws when the read-back still says off', () => {
    const db = createTestDb({ foreignKeys: false });
    const ignoring: PragmaConnection = { run: () => undefined, get: (q) => db.get(q) };
    expect(() => enableForeignKeys(ignoring)).toThrow(new Error(OFF_ERROR));
  });
});

// The foreign-keys-off era: a database that already holds dangling rows.
function legacyDatabase() {
  const db = createTestDb({ foreignKeys: false });
  const now = '2026-10-01T10:00:00.000Z';
  const insertSeries = (id: string, deletedAt: string | null = null) =>
    db
      .insert(series)
      .values({ id, createdAt: now, updatedAt: now, deletedAt, sessionId: 'gone', position: 1 })
      .run();
  return { db, now, insertSeries };
}

const pendingKeys = (db: ReturnType<typeof createTestDb>) =>
  db
    .select()
    .from(syncPendingRows)
    .all()
    .map((r) => `${r.tableName}/${r.rowId}`)
    .sort();

describe('FK7 the sweep at open', () => {
  it('moves an orphan to sync_pending_rows, then turns foreign keys on', () => {
    const { db, insertSeries } = legacyDatabase();
    insertSeries('r1');
    db.delete(syncOutbox).run();
    const before = readRowSync(db, 'series', 'r1')!;
    expect(finishOpeningDatabase(db)).toBe(1);
    expect(db.select().from(series).all()).toEqual([]);
    expect(pendingKeys(db)).toEqual(['series/r1']);
    const held = JSON.parse(db.select().from(syncPendingRows).get()!.payload) as ChangeRow;
    expect(held).toMatchObject({
      tableName: 'series',
      rowId: 'r1',
      payload: before.payload,
      deletedAt: null,
      updatedAt: before.updatedAt,
    });
    expect(foreignKeys(db)).toBe(1);
    expect(db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  });

  it('moves an orphan’s children too, until nothing movable is left', () => {
    const { db, now, insertSeries } = legacyDatabase();
    insertSeries('r1');
    db.insert(shots)
      .values({
        id: 'x1',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        seriesId: 'r1',
        position: 1,
        valueTenths: 100,
        isInnerTen: 0,
      })
      .run();
    db.delete(syncOutbox).run();
    expect(finishOpeningDatabase(db)).toBe(2);
    expect(pendingKeys(db)).toEqual(['series/r1', 'shots/x1']);
    expect(db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  });

  it('KEEP leaves an orphan with a queued edit in its table', () => {
    const { db, insertSeries } = legacyDatabase();
    insertSeries('r1'); // the insert trigger queues it
    expect(finishOpeningDatabase(db)).toBe(0);
    expect(
      db
        .select()
        .from(series)
        .all()
        .map((r) => r.id),
    ).toEqual(['r1']);
    expect(pendingKeys(db)).toEqual([]);
    expect(foreignKeys(db)).toBe(1);
  });

  it('KEEP once the push is acknowledged, the next open moves it', () => {
    const { db, insertSeries } = legacyDatabase();
    insertSeries('r1');
    finishOpeningDatabase(db);
    db.delete(syncOutbox).run(); // the ack
    db.$client.pragma('foreign_keys = OFF'); // the next open
    expect(finishOpeningDatabase(db)).toBe(1);
    expect(pendingKeys(db)).toEqual(['series/r1']);
  });

  it('keeps a newer pulled pending version over the older local row, and still moves the row', async () => {
    const { db, insertSeries } = legacyDatabase();
    insertSeries('r1');
    db.delete(syncOutbox).run();
    const newer = { ...readRowSync(db, 'series', 'r1')! };
    await createSyncStore(db).applyChanges([
      {
        tableName: 'series',
        rowId: 'r1',
        seq: 9,
        arrival: 9,
        deletedAt: null,
        updatedAt: '2026-10-09T10:00:00.000Z',
        payload: {
          ...(newer.payload as object),
          position: 7,
          updated_at: '2026-10-09T10:00:00.000Z',
        },
      } as ChangeRow,
    ]);
    expect(finishOpeningDatabase(db)).toBe(1);
    expect(db.select().from(series).all()).toEqual([]);
    const held = JSON.parse(db.select().from(syncPendingRows).get()!.payload) as ChangeRow;
    expect(held.seq).toBe(9);
    expect((held.payload as { position: number }).position).toBe(7);
  });

  it('leaves a row of a table that does not sync in place', () => {
    const { db, now } = legacyDatabase();
    db.insert(shotMarks)
      .values({
        id: 'm1',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        shotId: 'gone',
        xMm: 0,
        yMm: 0,
        caliberMm: 4.5,
      })
      .run();
    expect(finishOpeningDatabase(db)).toBe(0);
    expect(
      db
        .select()
        .from(shotMarks)
        .all()
        .map((r) => r.id),
    ).toEqual(['m1']);
  });

  it('a swept orphan is promoted when its parent arrives, deleted_at intact', async () => {
    const { db, insertSeries } = legacyDatabase();
    insertSeries('r1', '2026-10-05T10:00:00.000Z');
    db.delete(syncOutbox).run();
    finishOpeningDatabase(db);
    const source = createTestDb();
    const session = createSession(source, {
      name: 'S',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: '2026-10-01T10:00:00.000Z',
    });
    const snapshot = readRowSync(source, 'sessions', session.id)!;
    // The orphan named 'gone'; the parent arrives under that id.
    await createSyncStore(db).applyChanges([
      {
        tableName: 'sessions',
        rowId: 'gone',
        seq: 1,
        arrival: 1,
        deletedAt: null,
        updatedAt: snapshot.updatedAt,
        payload: { ...(snapshot.payload as object), id: 'gone' },
      } as ChangeRow,
    ]);
    expect(db.select().from(series).get()).toMatchObject({
      id: 'r1',
      deletedAt: '2026-10-05T10:00:00.000Z',
    });
    expect(pendingKeys(db)).toEqual([]);
  });

  it('a clean database moves nothing', () => {
    const db = createTestDb({ foreignKeys: false });
    expect(finishOpeningDatabase(db)).toBe(0);
    expect(foreignKeys(db)).toBe(1);
  });
});
