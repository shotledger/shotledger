// docs/specs/phone-foreign-keys-spec.md §4: foreign keys are on, so a pulled
// row whose parent this device does not hold waits in sync_pending_rows and is
// promoted once the parent is there.
import type { ChangeRow, SyncTableName } from '@shotledger/shared';
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { series, sessions, shots, syncOutbox, syncPendingRows } from '../schema';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { addSeries } from './series';
import { createSession } from './sessions';
import { addShot } from './shots';
import { createSyncStore, readRowSync, resetSyncBookkeeping, resetSyncState } from './sync-store';

// A family written on another device, read back as the wire would carry it.
function sourceFamily() {
  const source = createTestDb();
  const session = createSession(source, {
    name: 'S',
    type: 'training',
    disciplineId: 'spsf-precision',
    startedAt: '2026-10-01T10:00:00.000Z',
  });
  const seriesRow = addSeries(source, { sessionId: session.id, position: 1 });
  const shot = addShot(source, { seriesId: seriesRow.id, position: 1, valueTenths: 100 });
  const pulled = (tableName: SyncTableName, rowId: string, seq: number): ChangeRow => {
    const snapshot = readRowSync(source, tableName, rowId)!;
    return {
      tableName,
      rowId,
      seq,
      payload: snapshot.payload,
      deletedAt: null,
      updatedAt: snapshot.updatedAt,
      arrival: seq,
    } as ChangeRow;
  };
  return {
    session: pulled('sessions', session.id, 1),
    series: pulled('series', seriesRow.id, 2),
    shot: pulled('shots', shot.id, 3),
  };
}

function tombstone(of: ChangeRow, seq: number): ChangeRow {
  return { ...of, seq, payload: null, deletedAt: '2026-10-02T10:00:00.000Z', arrival: seq };
}

let db: Database;
let store: ReturnType<typeof createSyncStore>;
let family: ReturnType<typeof sourceFamily>;

beforeEach(() => {
  db = createTestDb();
  store = createSyncStore(db);
  family = sourceFamily();
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
const pending = () =>
  db
    .select()
    .from(syncPendingRows)
    .all()
    .map((r) => `${r.tableName}/${r.rowId}`)
    .sort();
const violations = () => db.all(sql`PRAGMA foreign_key_check`);

describe('AP1–AP2 a pulled row and its parent', () => {
  it('AP1 a row whose parent is held is written to its table', async () => {
    await store.applyChanges([family.session, family.series]);
    expect(ids(db.select().from(series).all())).toEqual([family.series.rowId]);
    expect(pending()).toEqual([]);
  });

  it('H7′ ROOT DISCARD AP2 a row whose parent is missing waits, and the pull commits', async () => {
    await store.applyChanges([family.series]);
    expect(db.select().from(series).all()).toEqual([]);
    expect(pending()).toEqual([`series/${family.series.rowId}`]);
    expect(violations()).toEqual([]);
  });

  it('AP2 the pending entry holds the whole change', async () => {
    await store.applyChanges([family.series]);
    const row = db.select().from(syncPendingRows).get()!;
    expect(JSON.parse(row.payload)).toEqual(family.series);
  });

  it('AP2 a null foreign key needs no parent', async () => {
    // A session with no firearm: firearm_id is null.
    await store.applyChanges([family.session]);
    expect(ids(db.select().from(sessions).all())).toEqual([family.session.rowId]);
    expect(pending()).toEqual([]);
  });

  it('AP2 an update that moves a held row under a missing parent keeps the local version', async () => {
    await store.applyChanges([family.session, family.series]);
    const moved = {
      ...family.series,
      seq: 9,
      payload: { ...(family.series.payload as object), session_id: 'never-pulled' },
    } as ChangeRow;
    await store.applyChanges([moved]);
    expect(db.select().from(series).get()!.sessionId).toBe(family.session.rowId);
    expect(pending()).toEqual([`series/${family.series.rowId}`]);
  });
});

describe('AP3–AP4 later versions of a pending row', () => {
  it('STALE AP3 a tombstone drops the pending entry and touches no table', async () => {
    await store.applyChanges([family.series]);
    await store.applyChanges([tombstone(family.series, 7)]);
    expect(pending()).toEqual([]);
    expect(db.select().from(series).all()).toEqual([]);
  });

  it('NEWER AP4 a newer version whose parent is held replaces the entry', async () => {
    await store.applyChanges([family.series]);
    await store.applyChanges([family.session]);
    // promoted already by AP5; a second, newer version then overwrites it
    const newer = {
      ...family.series,
      seq: 8,
      payload: { ...(family.series.payload as object), position: 2 },
    } as ChangeRow;
    await store.applyChanges([newer]);
    expect(db.select().from(series).get()!.position).toBe(2);
    expect(pending()).toEqual([]);
  });

  it('NEWER AP4 a newer pending version replaces the older entry', async () => {
    await store.applyChanges([family.series]);
    const newer = {
      ...family.series,
      seq: 8,
      payload: { ...(family.series.payload as object), position: 2 },
    } as ChangeRow;
    await store.applyChanges([newer]);
    expect(pending()).toEqual([`series/${family.series.rowId}`]);
    await store.applyChanges([family.session]);
    expect(db.select().from(series).get()!.position).toBe(2);
  });

  it('AP4 writing a row to its table drops a stale pending entry for it', async () => {
    db.insert(syncPendingRows)
      .values({
        tableName: 'sessions',
        rowId: family.session.rowId,
        payload: JSON.stringify(family.session),
      })
      .run();
    await store.applyChanges([family.session]);
    expect(pending()).toEqual([]);
  });
});

describe('AP5–AP6 promotion', () => {
  it('LATE AP5 the parent in a later pull promotes the waiting child', async () => {
    await store.applyChanges([family.series]);
    await store.applyChanges([family.session]);
    expect(ids(db.select().from(series).all())).toEqual([family.series.rowId]);
    expect(pending()).toEqual([]);
  });

  it('CHAIN AP5 a family pulled in reverse order promotes in one batch', async () => {
    await store.applyChanges([family.shot]);
    await store.applyChanges([family.series]);
    expect(pending()).toEqual(
      [`series/${family.series.rowId}`, `shots/${family.shot.rowId}`].sort(),
    );
    await store.applyChanges([family.session]);
    expect(ids(db.select().from(shots).all())).toEqual([family.shot.rowId]);
    expect(ids(db.select().from(series).all())).toEqual([family.series.rowId]);
    expect(pending()).toEqual([]);
    expect(violations()).toEqual([]);
  });

  it('AP5 promotion does not queue the promoted rows for upload', async () => {
    await store.applyChanges([family.series]);
    await store.applyChanges([family.session]);
    expect(db.select().from(syncOutbox).all()).toEqual([]);
  });

  it('AP5 an entry whose parent is still missing stays', async () => {
    await store.applyChanges([family.shot]);
    await store.applyChanges([family.session]);
    expect(pending()).toEqual([`shots/${family.shot.rowId}`]);
  });

  it('LOCAL AP6 a held row with a queued local edit drops its pending version', async () => {
    await store.applyChanges([family.session, family.series]);
    const moved = {
      ...family.series,
      seq: 9,
      payload: { ...(family.series.payload as object), session_id: 'later', position: 5 },
    } as ChangeRow;
    await store.applyChanges([moved]);
    db.update(series).set({ position: 3 }).run(); // queues an outbox entry
    const later = {
      ...family.session,
      rowId: 'later',
      payload: { ...(family.session.payload as object), id: 'later' },
    } as ChangeRow;
    await store.applyChanges([later]);
    expect(db.select().from(series).get()!.position).toBe(3);
    expect(pending()).toEqual([]);
  });

  it('AP6 an acknowledged push drops the pending version, so promotion does not revert the edit', async () => {
    await store.applyChanges([family.session, family.series]);
    const moved = {
      ...family.series,
      seq: 9,
      payload: { ...(family.series.payload as object), session_id: 'later', position: 5 },
    } as ChangeRow;
    await store.applyChanges([moved]);
    db.update(series).set({ position: 3 }).run(); // queues an outbox entry
    const [entry] = await store.readOutbox(10);
    await store.clearOutboxEntry(entry!); // the server accepted position 3
    expect(pending()).toEqual([]);
    const later = {
      ...family.session,
      rowId: 'later',
      payload: { ...(family.session.payload as object), id: 'later' },
    } as ChangeRow;
    await store.applyChanges([later]);
    expect(db.select().from(series).get()!.position).toBe(3);
  });

  it('AP6 a held row without a queued edit takes its pending version', async () => {
    await store.applyChanges([family.session, family.series]);
    const moved = {
      ...family.series,
      seq: 9,
      payload: { ...(family.series.payload as object), session_id: 'later', position: 5 },
    } as ChangeRow;
    await store.applyChanges([moved]);
    const later = {
      ...family.session,
      rowId: 'later',
      payload: { ...(family.session.payload as object), id: 'later' },
    } as ChangeRow;
    await store.applyChanges([later]);
    expect(db.select().from(series).get()!).toMatchObject({ position: 5, sessionId: 'later' });
    expect(pending()).toEqual([]);
  });
});

describe('the pending table is sync bookkeeping', () => {
  it('sign-out and a backup reset empty it', async () => {
    await store.applyChanges([family.series]);
    resetSyncState(db);
    expect(pending()).toEqual([]);
    await store.applyChanges([family.series]);
    resetSyncBookkeeping(db);
    expect(pending()).toEqual([]);
  });
});
