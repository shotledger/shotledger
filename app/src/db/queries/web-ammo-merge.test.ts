// A web ammo-lot merge must leave the phone exactly where the phone's own
// merge would (docs/specs/ammo-lot-merge-spec.md P1–P2). Two twin databases:
// on one the phone merges, on the other the web's changes arrive through the
// phone's real apply path.
import {
  APPLY_ORDER,
  buildAmmoLotMerge,
  type ChangeRow,
  type AmmoLotMergeContext,
} from '@shotledger/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';

import { ammoLots, sessions, syncOutbox } from '../schema';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { createAmmoLot, listAmmoLots, mergeAmmoLots } from './ammo-lots';
import { createSession, softDeleteSession } from './sessions';
import { applyChangesSync, readRowSync, SYNC_TABLES } from './sync-store';

type Row = Record<string, unknown>;

/** expo-sqlite binds a boolean as 1/0; better-sqlite3 refuses one. */
const asBound = (payload: unknown): Row =>
  Object.fromEntries(
    Object.entries(payload as Row).map(([key, value]) => [
      key,
      typeof value === 'boolean' ? Number(value) : value,
    ]),
  );

/** Every synced row of `db`, payloads as the phone pushes them. */
function dump(db: Database): ChangeRow[] {
  const rows: ChangeRow[] = [];
  for (const tableName of APPLY_ORDER) {
    for (const { id } of db.select().from(SYNC_TABLES[tableName]).all() as { id: string }[]) {
      const snapshot = readRowSync(db, tableName, id)!;
      rows.push({
        tableName,
        rowId: id,
        seq: rows.length + 1,
        payload: asBound(snapshot.payload),
        deletedAt: null,
        updatedAt: snapshot.updatedAt,
      });
    }
  }
  return rows;
}

/** What the web pulls: the phone's rows, soft-deleted ones gone as server tombstones. */
function pulled(db: Database): AmmoLotMergeContext {
  const table = (name: (typeof APPLY_ORDER)[number]) =>
    new Map(
      dump(db)
        .filter((row) => row.tableName === name && (row.payload as Row).deleted_at === null)
        .map((row) => [row.rowId, row.payload as Row]),
    );
  return { sessions: table('sessions'), ammoLots: table('ammo_lots') };
}

/** What a reader of the phone sees, without timestamps. */
function snapshot(db: Database) {
  return {
    lots: listAmmoLots(db).map((l) => [l.id, l.label, l.quantity, l.notes]),
    deletedLots: db
      .select({ id: ammoLots.id, deletedAt: ammoLots.deletedAt })
      .from(ammoLots)
      .all()
      .filter((l) => l.deletedAt !== null)
      .map((l) => l.id)
      .sort(),
    sessions: db
      .select({ id: sessions.id, lot: sessions.ammoLotId, deleted: sessions.deletedAt })
      .from(sessions)
      .all()
      .map((s) => [s.id, s.lot, s.deleted !== null])
      .sort(),
  };
}

describe('a web ammo-lot merge applied on the phone equals the phone merging', () => {
  let phone: Database;
  let web: Database;
  let lots: Record<'a' | 'b' | 'c', string>;

  beforeEach(() => {
    phone = createTestDb();
    const make = (label: string, quantity: number) =>
      createAmmoLot(phone, { label, quantity, notes: `${label} notes` }).id;
    lots = { a: make('A', 100), b: make('B', 200), c: make('C', 300) };
    const session = (lot: string | null) =>
      createSession(phone, {
        name: 'S',
        type: 'training',
        disciplineId: 'spsf-precision',
        ammoLotId: lot,
        startedAt: '2026-05-01T10:00:00.000Z',
      }).id;
    session(lots.a);
    session(lots.a);
    session(lots.b);
    session(lots.c);
    session(null);
    softDeleteSession(phone, session(lots.a));
    web = createTestDb();
    applyChangesSync(web, dump(phone));
    phone.delete(syncOutbox).run();
    expect(snapshot(web)).toEqual(snapshot(phone));
  });

  function webMerge(duplicateId: string, keptId: string) {
    const result = buildAmmoLotMerge(duplicateId, keptId, pulled(web), {
      newId: uuidv7,
      newChangeId: () => crypto.randomUUID(),
      now: () => new Date().toISOString(),
    });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    applyChangesSync(
      web,
      result.changes.map((change, index) => ({
        tableName: change.tableName,
        rowId: change.rowId,
        seq: 1000 + index,
        payload: change.payload === null ? null : asBound(change.payload),
        deletedAt: change.deletedAt,
        updatedAt: change.updatedAt,
      })),
    );
    return result.moved;
  }

  it('P1 the same sessions and lots as mergeAmmoLots', () => {
    for (const [dup, kept] of [
      [lots.a, lots.b],
      [lots.c, lots.b],
    ] as const) {
      const moved = webMerge(dup, kept);
      expect(mergeAmmoLots(phone, dup, kept)).toEqual({ ok: true, moved });
      expect(snapshot(web)).toEqual(snapshot(phone));
    }
    expect(snapshot(web).lots).toEqual([[lots.b, 'B', 200, 'B notes']]);
  });

  it('P2 nothing applied is re-queued (the outbox stays empty after apply)', () => {
    webMerge(lots.a, lots.b);
    expect(web.select().from(syncOutbox).all()).toHaveLength(0);
  });
});
