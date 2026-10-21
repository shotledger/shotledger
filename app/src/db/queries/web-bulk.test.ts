// A web bulk edit must leave the phone exactly where the phone's own
// single-session edit would (docs/specs/web-bulk-edit-spec.md B1, P1–P5).
// Two twin databases: on one the phone edits session by session, on the
// other the web's changes arrive through the phone's real apply path.
import {
  APPLY_ORDER,
  buildBulkEdit,
  type BulkAction,
  type BulkContext,
  type ChangeRow,
} from '@shotledger/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';

import { syncOutbox } from '../schema';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { createFirearm, listFirearms } from './firearms';
import { getRoundsSinceMaintenance } from './maintenance-counter';
import { logMaintenanceEvent } from './maintenance-events';
import { deleteSessionAndSeries, saveSeriesShots, setSessionExtraRounds } from './round-count';
import { addSeries } from './series';
import { createSession, getSession, updateSession } from './sessions';
import { applyChangesSync, readRowSync, SYNC_TABLES } from './sync-store';
import { serverRefusals } from '../sync-conformance';
import {
  addSessionTag,
  createTag,
  getOrCreateTag,
  getTagByName,
  listTags,
  listTagsForSession,
  removeSessionTag,
  softDeleteTag,
} from './tags';

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
        payload: snapshot.payload,
        deletedAt: null,
        updatedAt: snapshot.updatedAt,
      });
    }
  }
  return rows;
}

const asApplied = (rows: readonly ChangeRow[]): ChangeRow[] =>
  rows.map((row) => ({ ...row, payload: row.payload === null ? null : asBound(row.payload) }));

/** What the web pulls: the phone's rows, soft-deleted ones gone as server tombstones. */
function pulled(db: Database): BulkContext {
  const table = (name: (typeof APPLY_ORDER)[number]) =>
    new Map(
      dump(db)
        .filter((row) => row.tableName === name && (row.payload as Row).deleted_at === null)
        .map((row) => [row.rowId, row.payload as Row]),
    );
  return {
    sessions: table('sessions'),
    tags: table('tags'),
    sessionTags: table('session_tags'),
    firearms: table('firearms'),
    series: table('series'),
    shots: table('shots'),
    faltStations: table('falt_stations'),
  };
}

const shots = (n: number) => Array.from({ length: n }, () => ({ valueTenths: 90 }));

interface Ids {
  sessions: string[];
  f1: string;
  f2: string;
  f3: string;
}

/**
 * s1 f1 (5 + a 3-shot sighter + 4 extra rounds, KM), s2 f1 (5, a link to the
 * deleted tag Gone), s3 f2 (2, Club), s4 no firearm (the second KM copy),
 * s5 f1 deleted.
 */
function seed(db: Database): Ids {
  const f1 = createFirearm(db, { make: 'Pardini', model: 'SP', roundCount: 100 }).id;
  const f2 = createFirearm(db, { make: 'Walther', model: 'GSP', roundCount: 10 }).id;
  const f3 = createFirearm(db, { make: 'Hämmerli', model: 'X', roundCount: 0 }).id;
  // Each cleaned at its starting count, so rounds since maintenance starts at 0.
  for (const firearmId of [f1, f2, f3]) {
    logMaintenanceEvent(db, {
      firearmId: firearmId,
      performedAt: '2026-01-01T00:00:00.000Z',
      kind: 'cleaning',
    });
  }
  const make = (name: string, firearmId: string | null, location: string | null, n: number[]) => {
    const id = createSession(db, {
      name,
      type: 'training',
      disciplineId: 'spsf-precision',
      firearmId,
      location,
      startedAt: '2026-05-01T10:00:00.000Z',
    }).id;
    n.forEach((count, index) => {
      const series = addSeries(db, { sessionId: id, position: index + 1, isSighter: index === 1 });
      saveSeriesShots(db, series.id, shots(count));
    });
    return id;
  };
  const s1 = make('S1', f1, 'Range A', [5, 3]);
  setSessionExtraRounds(db, s1, 4);
  const s2 = make('S2', f1, 'Range A', [5]);
  const s3 = make('S3', f2, 'Range B', [2]);
  const s4 = make('S4', null, null, []);
  const s5 = make('S5', f1, 'Range A', [5]);
  deleteSessionAndSeries(db, s5);

  const km = createTag(db, 'KM');
  addSessionTag(db, s1, km.id);
  addSessionTag(db, s3, createTag(db, 'Club').id);
  const gone = createTag(db, 'Gone');
  addSessionTag(db, s2, gone.id);
  softDeleteTag(db, gone.id);
  // A second KM, as two devices create one offline (ARCHITECTURE.md § Web app).
  addSessionTag(db, s4, createTag(db, 'KM').id);
  return { sessions: [s1, s2, s3, s4, s5], f1, f2, f3 };
}

/** What a reader of the phone sees, without timestamps. */
function snapshot(db: Database, ids: Ids) {
  return {
    sessions: ids.sessions.map((id) => {
      const row = getSession(db, id);
      return row
        ? {
            id,
            firearmId: row.firearmId,
            location: row.location,
            name: row.name,
            tags: listTagsForSession(db, id).map((t) => t.name),
          }
        : { id, deleted: true };
    }),
    firearms: listFirearms(db).map((f) => [f.id, f.roundCount, getRoundsSinceMaintenance(db, f)]),
    tags: listTags(db).map((t) => t.name),
  };
}

describe('a web bulk edit applied on the phone equals the phone editing session by session', () => {
  let phone: Database;
  let web: Database;
  let ids: Ids;

  beforeEach(() => {
    phone = createTestDb();
    ids = seed(phone);
    web = createTestDb();
    applyChangesSync(web, asApplied(dump(phone)));
    phone.delete(syncOutbox).run();
    expect(snapshot(web, ids)).toEqual(snapshot(phone, ids));
  });

  /** The web's changes for `action`, pulled from and applied to the web twin. */
  function webEdit(action: BulkAction, sessionIds: readonly string[]) {
    const result = buildBulkEdit(action, sessionIds, pulled(web), {
      newId: uuidv7,
      newChangeId: () => crypto.randomUUID(),
      now: () => new Date().toISOString(),
    });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(serverRefusals(result.changes)).toEqual([]);
    applyChangesSync(
      web,
      asApplied(
        result.changes.map((change, index) => ({
          tableName: change.tableName,
          rowId: change.rowId,
          seq: 1000 + index,
          payload: change.payload,
          deletedAt: change.deletedAt,
          updatedAt: change.updatedAt,
        })),
      ),
    );
  }

  const liveIds = (db: Database) => ids.sessions.filter((id) => getSession(db, id));

  it('P1 add tag: the same tags as getOrCreateTag + addSessionTag', () => {
    for (const name of ['KM', 'Club', 'Season 2026']) {
      webEdit({ kind: 'addTag', name }, ids.sessions);
      for (const id of liveIds(phone)) addSessionTag(phone, id, getOrCreateTag(phone, name).id);
      expect(snapshot(web, ids)).toEqual(snapshot(phone, ids));
    }
    expect(listTagsForSession(web, ids.sessions[3]!).map((t) => t.name)).toEqual([
      'Club',
      'KM',
      'Season 2026',
    ]);
  });

  it('P1 add tag: a name whose only tag was deleted — both add it and show it (B7)', () => {
    const s2 = ids.sessions[1]!;
    webEdit({ kind: 'addTag', name: 'Gone' }, [s2]);
    addSessionTag(phone, s2, getOrCreateTag(phone, 'Gone').id);
    expect(listTagsForSession(web, s2).map((t) => t.name)).toEqual(['Gone']);
    expect(listTagsForSession(phone, s2).map((t) => t.name)).toEqual(['Gone']);
    expect(snapshot(web, ids)).toEqual(snapshot(phone, ids));
  });

  it('P2 remove tag: the same tags as removeSessionTag', () => {
    for (const name of ['KM', 'Club']) {
      webEdit({ kind: 'removeTag', name }, ids.sessions.slice(0, 4));
      const tagId = getTagByName(phone, name)!.id;
      for (const id of ids.sessions.slice(0, 4)) removeSessionTag(phone, id, tagId);
      expect(snapshot(web, ids)).toEqual(snapshot(phone, ids));
    }
    expect(snapshot(web, ids).sessions.map((s) => ('tags' in s ? s.tags : null))).toEqual([
      [],
      [],
      [],
      [],
      null,
    ]);
  });

  it('P3 change firearm: the same sessions and counters as updateSession', () => {
    const cases: [string | null, string[]][] = [
      [ids.f3, ids.sessions],
      [null, [ids.sessions[0]!, ids.sessions[2]!]],
      [ids.f1, [ids.sessions[2]!, ids.sessions[3]!]],
      [ids.f2, ids.sessions],
    ];
    for (const [firearmId, sessionIds] of cases) {
      webEdit({ kind: 'setFirearm', firearmId }, sessionIds);
      for (const id of sessionIds) updateSession(phone, id, { firearmId });
      expect(snapshot(web, ids)).toEqual(snapshot(phone, ids));
    }
    // 12 + 5 + 2 rounds, all on f2 now.
    expect(snapshot(web, ids).firearms).toContainEqual([ids.f2, 10 + 2 + 17, 2 + 17]);
  });

  it('P4 change location: the same as updateSession with the trimmed text or null', () => {
    for (const location of ['  Range C ', '', 'Range A']) {
      webEdit({ kind: 'setLocation', location }, ids.sessions.slice(0, 4));
      for (const id of ids.sessions.slice(0, 4)) {
        updateSession(phone, id, { location: location.trim() || null });
      }
      expect(snapshot(web, ids)).toEqual(snapshot(phone, ids));
    }
  });

  it('P5 nothing applied is re-queued (the outbox stays empty after apply)', () => {
    webEdit({ kind: 'addTag', name: 'New' }, ids.sessions);
    webEdit({ kind: 'removeTag', name: 'KM' }, ids.sessions);
    webEdit({ kind: 'setFirearm', firearmId: ids.f3 }, ids.sessions);
    webEdit({ kind: 'setLocation', location: 'Elsewhere' }, ids.sessions);
    expect(web.select().from(syncOutbox).all()).toHaveLength(0);
  });
});
