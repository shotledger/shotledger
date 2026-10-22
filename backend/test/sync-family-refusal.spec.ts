// Family refusal on /sync/push, through the real route and the real D1 batch
// (docs/specs/sync-family-refusal-spec.md F1–F11, and Revision 3's server
// scenarios in §11.10). The scenarios that drive the real client engine live
// in sync-client.spec.ts.
import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { Hono } from 'hono';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createHttpSyncTransport,
  OWNERSHIP_EDGES,
  PROTOCOL_VERSION,
  pushChanges,
  REFERENCE_EDGES,
  type ClientChange,
  type PushAck,
  type SyncTableName,
} from '@shotledger/shared';
import { SYNC_TABLES } from '@shotledger/shared/src/sync/tables';

import { ALL_MIGRATIONS } from '../src/db/migrations';
import { applyPush, createDb, PushAccountGoneError } from '../src/db/queries';
import { createSyncRoutes } from '../src/routes/sync';
import { devBearerWithAccount, ensureAccount } from './dev-account';
import { gateD1 } from './gated-d1';
import { row } from './rows';

const USER = 'user-family';
const T0 = '2026-10-14T10:00:00.000Z';
const T1 = '2026-10-14T11:00:00.000Z';

const app = new Hono<{ Bindings: Env }>();
app.route(
  '/sync',
  createSyncRoutes(() => devBearerWithAccount),
);

async function fetchApp(input: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(new Request(input, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

const transport = createHttpSyncTransport({
  fetchImpl: fetchApp,
  baseUrl: 'https://localhost',
  getToken: () => USER,
});

let counter = 0;
function cid(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
}

function live(tableName: SyncTableName, rowId: string, fields: Record<string, unknown> = {}) {
  return {
    clientChangeId: cid(),
    tableName,
    rowId,
    payload: row(tableName, rowId, T0, fields),
    deletedAt: null,
    updatedAt: T0,
  } satisfies ClientChange;
}

function tombstone(tableName: SyncTableName, rowId: string): ClientChange {
  return { clientChangeId: cid(), tableName, rowId, payload: null, deletedAt: T1, updatedAt: T1 };
}

// The spec's cast (§4): S for s1, R1 and R2 its series, T1/T2 in R1, T3/T4
// in R2. A `bad` variant is the invalid payload: name null for a session,
// value_tenths null for a shot (the spec's "value: -1" is not invalid: the
// payload schema checks NOT NULL and type, not range).
const S = (bad = false, id = 's1') => live('sessions', id, bad ? { name: null } : {});
const R = (id: string, sessionId = 's1') => live('series', id, { session_id: sessionId });
const T = (id: string, seriesId: string, bad = false) =>
  live('shots', id, { series_id: seriesId, value_tenths: bad ? null : 90 });
const F = (bad = false, id = 'f1') => live('firearms', id, bad ? { make: null } : {});
const L = (id: string, firearmId = 'f1', bad = false) =>
  live('licenses', id, { firearm_id: firearmId, ...(bad ? { purpose: 42 } : {}) });
const G = (id: string, firearmId = 'f1') => live('firearm_groups', id, { firearm_id: firearmId });

async function push(changes: ClientChange[]): Promise<PushAck[]> {
  return (await transport.push({ protocolVersion: PROTOCOL_VERSION, changes })).acks;
}

async function lastSeq(): Promise<number> {
  const found = await env.DB.prepare('SELECT last_seq FROM sync_sequence WHERE user_id = ?')
    .bind(USER)
    .first<{ last_seq: number }>();
  return found?.last_seq ?? 0;
}

async function storedCount(): Promise<number> {
  const found = await env.DB.prepare('SELECT COUNT(*) AS n FROM sync_rows WHERE user_id = ?')
    .bind(USER)
    .first<{ n: number }>();
  return found!.n;
}

async function stored(tableName: string, rowId: string) {
  return env.DB.prepare(
    'SELECT payload, deleted_at FROM sync_rows WHERE user_id = ? AND table_name = ? AND row_id = ?',
  )
    .bind(USER, tableName, rowId)
    .first<{ payload: string | null; deleted_at: string | null }>();
}

async function idempotency(clientChangeId: string) {
  return env.DB.prepare(
    'SELECT status, seq, reason FROM sync_idempotency WHERE user_id = ? AND client_change_id = ?',
  )
    .bind(USER, clientChangeId)
    .first<{ status: string; seq: number | null; reason: string | null }>();
}

/** A rejection at `arrival`; a family_refused one names its blocker (§11.7). */
const rejected = (
  change: ClientChange,
  reason: string,
  arrival: number,
  blocker?: { tableName: SyncTableName; rowId: string },
): PushAck => ({
  clientChangeId: change.clientChangeId,
  status: 'rejected',
  reason,
  arrival,
  ...(blocker === undefined ? {} : { blocker }),
});

beforeAll(async () => {
  await applyD1Migrations(env.DB, ALL_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.exec('DELETE FROM sync_rows');
  await env.DB.exec('DELETE FROM sync_sequence');
  await env.DB.exec('DELETE FROM sync_idempotency');
  await env.DB.exec('DELETE FROM sync_refusals');
});

describe('F1 a refused session refuses its whole push family', () => {
  it('refuses R1, T1, T2 as family_refused, stores none of them and consumes no seq', async () => {
    const changes = [S(true), R('r1'), T('t1', 'r1'), T('t2', 'r1')];
    const [s, r1, t1, t2] = changes;

    const acks = await push(changes);

    const blocker = { tableName: 'sessions' as const, rowId: 's1' };
    expect(acks).toStrictEqual([
      rejected(s!, 'invalid_payload', 1),
      rejected(r1!, 'family_refused', 1, blocker),
      rejected(t1!, 'family_refused', 1, blocker),
      rejected(t2!, 'family_refused', 1, blocker),
    ]);
    expect(await storedCount()).toBe(0);
    expect(await lastSeq()).toBe(0);
    expect(await idempotency(r1!.clientChangeId)).toStrictEqual({
      status: 'rejected',
      seq: null,
      reason: 'family_refused',
    });
  });
});

describe('F2 a refused shot refuses its session’s push family', () => {
  it('refuses S, R1, R2, T2, T3 alongside the invalid T1', async () => {
    const changes = [S(), R('r1'), R('r2'), T('t1', 'r1', true), T('t2', 'r1'), T('t3', 'r2')];
    const acks = await push(changes);

    expect(acks.map((ack) => ack.reason)).toEqual([
      'family_refused',
      'family_refused',
      'family_refused',
      'invalid_payload',
      'family_refused',
      'family_refused',
    ]);
    expect(acks.every((ack) => ack.status === 'rejected' && ack.seq === undefined)).toBe(true);
    expect(await storedCount()).toBe(0);
  });
});

describe('F3 siblings linked through a bare parent id', () => {
  it('refuses T2 when T1 is refused, with R1 not in the push', async () => {
    const t1 = T('t1', 'r1', true);
    const t2 = T('t2', 'r1');
    expect(await push([t1, t2])).toStrictEqual([
      rejected(t1, 'invalid_payload', 1),
      rejected(t2, 'family_refused', 1, { tableName: 'shots', rowId: 't1' }),
    ]);
  });
});

describe('F4 rows the push does not link are not refused (C4)', () => {
  it('applies T3 when T1 is refused and neither series is in the push', async () => {
    const acks = await push([T('t1', 'r1', true), T('t3', 'r2')]);
    expect(acks[1]).toMatchObject({ status: 'applied', seq: 1 });
    expect(await stored('shots', 't3')).not.toBeNull();
  });
});

describe('F5 other families in the same push are untouched', () => {
  it('applies every row of s2 next to s1’s refused family', async () => {
    const s1Family = [S(), R('r1'), T('t1', 'r1', true), T('t2', 'r1')];
    const s2Family = [S(false, 's2'), R('r9', 's2'), T('t9', 'r9')];

    const acks = await push([...s1Family, ...s2Family]);

    expect(acks.slice(0, 4).map((ack) => ack.status)).toEqual(Array(4).fill('rejected'));
    expect(acks.slice(4)).toStrictEqual(
      s2Family.map((change, i) => ({
        clientChangeId: change.clientChangeId,
        status: 'applied',
        seq: i + 1,
        arrival: 1,
      })),
    );
    expect(await lastSeq()).toBe(3);
  });
});

describe('F6 a refused firearm refuses its rows; a refused row of it does not refuse the firearm', () => {
  it('refuses L1 and G1 with F*', async () => {
    const changes = [F(true), L('l1'), G('g1')];
    const [f, l1, g1] = changes;
    const blocker = { tableName: 'firearms' as const, rowId: 'f1' };
    expect(await push(changes)).toStrictEqual([
      rejected(f!, 'invalid_payload', 1),
      rejected(l1!, 'family_refused', 1, blocker),
      rejected(g1!, 'family_refused', 1, blocker),
    ]);
  });

  it('applies F and G1 next to a refused L1*', async () => {
    const changes = [F(), L('l1', 'f1', true), G('g1')];
    const acks = await push(changes);
    expect(acks.map((ack) => [ack.status, ack.reason])).toEqual([
      ['applied', undefined],
      ['rejected', 'invalid_payload'],
      ['applied', undefined],
    ]);
  });
});

describe('F7 references are not families', () => {
  it('applies a valid session whose firearm_id names a firearm refused earlier', async () => {
    await push([F(true, 'f9')]);
    const [ack] = await push([live('sessions', 's1', { firearm_id: 'f9' })]);
    expect(ack).toMatchObject({ status: 'applied' });
  });

  it('applies it in the same push as the refused firearm, and a tag link next to a refused tag', async () => {
    const changes = [
      F(true, 'f9'),
      live('sessions', 's1', { firearm_id: 'f9' }),
      live('tags', 'tag1', { name: null }),
      live('session_tags', 'st1', { session_id: 's1', tag_id: 'tag1' }),
    ];
    const acks = await push(changes);
    expect(acks.map((ack) => ack.status)).toEqual(['rejected', 'applied', 'rejected', 'applied']);
  });
});

describe('F8 tombstones are never family-refused', () => {
  it('applies the tombstone of a shot of the refused session', async () => {
    await push([R('r1'), T('t5', 'r1')]);
    const removal = tombstone('shots', 't5');
    const acks = await push([S(true), removal]);
    expect(acks[1]).toMatchObject({ status: 'applied' });
    expect(await stored('shots', 't5')).toMatchObject({ deleted_at: T1 });
  });
});

describe('F9 a family-refused change replays as a duplicate with its reason', () => {
  it('acks duplicate/family_refused with no seq on a replay of F1, with arrival, blocker and current', async () => {
    const changes = [S(true), R('r1'), T('t1', 'r1'), T('t2', 'r1')];
    await push(changes);

    const acks = await push(changes);

    expect(acks.slice(1)).toStrictEqual(
      changes.slice(1).map((change) => ({
        clientChangeId: change.clientChangeId,
        status: 'duplicate',
        reason: 'family_refused',
        arrival: 1,
        blocker: { tableName: 'sessions', rowId: 's1' },
        current: null,
      })),
    );
    expect(await lastSeq()).toBe(0);
  });
});

describe('F10 a tombstoned row still reports tombstoned', () => {
  it('rejects a live R1 as tombstoned, not family_refused', async () => {
    await push([R('r1')]);
    await push([tombstone('series', 'r1')]);
    const before = await lastSeq();

    const r1 = R('r1');
    const acks = await push([S(true), r1]);

    expect(acks[1]).toStrictEqual(rejected(r1, 'tombstoned', 3));
    expect(await idempotency(r1.clientChangeId)).toMatchObject({ reason: 'tombstoned' });
    expect(await lastSeq()).toBe(before);
  });
});

describe('F11 the ownership map covers every foreign key', () => {
  const edgeKey = (e: { child: string; column: string; parent: string }) =>
    `${e.child}.${e.column}->${e.parent}`;

  function foreignKeys(): string[] {
    return Object.entries(SYNC_TABLES).flatMap(([tableName, table]) =>
      getTableConfig(table).foreignKeys.map((fk) => {
        const reference = fk.reference();
        expect(reference.columns).toHaveLength(1);
        return edgeKey({
          child: tableName,
          column: reference.columns[0]!.name,
          parent: getTableConfig(reference.foreignTable).name,
        });
      }),
    );
  }

  it('classifies every foreign key of every synced table exactly once', () => {
    const ownership = OWNERSHIP_EDGES.map(edgeKey);
    const references = REFERENCE_EDGES.map(edgeKey);
    const listed = [...ownership, ...references];

    expect(new Set(listed).size).toBe(listed.length);
    expect([...foreignKeys()].sort()).toEqual([...listed].sort());
  });
});

describe('H12 the web sees a family refusal as a rejection', () => {
  it('pushChanges reports partlyRejected with invalid_payload and family_refused', async () => {
    const changes = [S(), R('r1'), T('t1', 'r1', true), T('t2', 'r1')];

    await expect(pushChanges(transport, PROTOCOL_VERSION, changes)).resolves.toStrictEqual({
      kind: 'partlyRejected',
      rejected: [
        { tableName: 'sessions', rowId: 's1', reason: 'family_refused' },
        { tableName: 'series', rowId: 'r1', reason: 'family_refused' },
        { tableName: 'shots', rowId: 't1', reason: 'invalid_payload' },
        { tableName: 'shots', rowId: 't2', reason: 'family_refused' },
      ],
    });
    expect(await storedCount()).toBe(0);
  });

  it('a replay of it reads as a rejection too, not a save', async () => {
    const changes = [S(), T('t1', 's1-r', true), R('s1-r')];
    await push(changes);
    const outcome = await pushChanges(transport, PROTOCOL_VERSION, changes);
    expect(outcome).toMatchObject({ kind: 'partlyRejected' });
    expect(outcome.kind === 'partlyRejected' && outcome.rejected.map((r) => r.reason)).toEqual([
      'family_refused',
      'invalid_payload',
      'family_refused',
    ]);
  });
});

describe('the route logs a family refusal without ids or values (N6)', () => {
  it('names the count and the tables only', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await push([S(true, 'secret-session'), R('secret-r', 'secret-session'), T('t1', 'secret-r')]);
      const logged = warn.mock.calls.map((call) => call.join(' '));
      expect(logged).toContain('sync push: refused 2 with their family (series, shots)');
      expect(logged.join('\n')).not.toContain('secret');
    } finally {
      warn.mockRestore();
    }
  });

  it('logs no family line when nothing is family-refused', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await push([F(true)]);
      expect(warn.mock.calls.map((call) => call.join(' '))).toEqual([
        'sync push: refused firearms payload (make:invalid_type)',
      ]);
    } finally {
      warn.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Revision 3 (docs/specs/sync-family-refusal-spec.md §11): the server keeps
// refused families in sync_refusals and applies the waiting rows itself.
// ---------------------------------------------------------------------------

const ref = (tableName: SyncTableName, rowId: string) => ({ tableName, rowId });

/** The route over another D1 binding: a gate, a counter or a racer. */
async function pushThrough(
  d1: D1Database,
  changes: ClientChange[],
): Promise<{ status: number; acks: PushAck[]; body: unknown }> {
  const ctx = createExecutionContext();
  const response = await app.fetch(
    new Request('https://localhost/sync/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${USER}` },
      body: JSON.stringify({ protocolVersion: PROTOCOL_VERSION, changes }),
    }),
    { ...env, DB: d1 },
    ctx,
  );
  await waitOnExecutionContext(ctx);
  const body = (await response.json().catch(() => null)) as { acks?: PushAck[] } | null;
  return { status: response.status, acks: body?.acks ?? [], body };
}

/** Another push commits before every batch this binding runs, so the guard always fails. */
/** Another push commits before each of the first `times` batches; counts the batches tried. */
function racingD1(real: D1Database, times: number) {
  let attempts = 0;
  const d1 = new Proxy(real, {
    get(target, prop) {
      if (prop === 'batch') {
        return async (statements: D1PreparedStatement[]) => {
          attempts += 1;
          if (attempts <= times) {
            await target
              .prepare('UPDATE sync_sequence SET state_rev = state_rev + 1 WHERE user_id = ?')
              .bind(USER)
              .run();
          }
          return target.batch(statements);
        };
      }
      const value = Reflect.get(target, prop) as unknown;
      return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
    },
  });
  return { d1, attempts: () => attempts };
}

function bumpBeforeEveryBatch(real: D1Database): D1Database {
  return new Proxy(real, {
    get(target, prop) {
      if (prop === 'batch') {
        return async (statements: D1PreparedStatement[]) => {
          await target
            .prepare('UPDATE sync_sequence SET state_rev = state_rev + 1 WHERE user_id = ?')
            .bind(USER)
            .run();
          return target.batch(statements);
        };
      }
      const value = Reflect.get(target, prop) as unknown;
      return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
    },
  });
}

/**
 * Counts the reads, each batch's statements, the most parameters one
 * statement binds, the longest SQL text and the longest bound string.
 */
function countingD1(real: D1Database) {
  let reads = 0;
  let maxParams = 0;
  let maxSql = 0;
  let maxBound = 0;
  const batches: number[] = [];
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement =>
    new Proxy(statement, {
      get(target, prop) {
        if (prop === 'bind') {
          return (...values: unknown[]) => {
            maxParams = Math.max(maxParams, values.length);
            for (const value of values) {
              if (typeof value === 'string') maxBound = Math.max(maxBound, value.length);
            }
            return wrap(target.bind(...values));
          };
        }
        if (prop === 'all' || prop === 'raw' || prop === 'first' || prop === 'run') reads += 1;
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
      },
    });
  const d1 = new Proxy(real, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (query: string) => {
          maxSql = Math.max(maxSql, query.length);
          return wrap(target.prepare(query));
        };
      }
      if (prop === 'batch') {
        return (statements: D1PreparedStatement[]) => {
          batches.push(statements.length);
          return target.batch(statements);
        };
      }
      const value = Reflect.get(target, prop) as unknown;
      return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
    },
  });
  return {
    d1,
    reads: () => reads,
    batches: () => batches,
    maxParams: () => maxParams,
    maxSql: () => maxSql,
    maxBound: () => maxBound,
  };
}

interface RecordRow {
  table_name: string;
  row_id: string;
  reason: string;
  parent: string | null;
  arrival: number;
  blocker: string | null;
  waiting_payload: string | null;
}

/** The user's records, as `table:row` strings for the links. */
async function records(): Promise<RecordRow[]> {
  const found = await env.DB.prepare(
    `SELECT table_name, row_id, reason, arrival, payload AS waiting_payload,
       CASE WHEN parent_table IS NULL THEN NULL ELSE parent_table || ':' || parent_row_id END AS parent,
       CASE WHEN blocker_table IS NULL THEN NULL ELSE blocker_table || ':' || blocker_row_id END AS blocker
     FROM sync_refusals WHERE user_id = ? ORDER BY table_name, row_id`,
  )
    .bind(USER)
    .all<RecordRow>();
  return found.results;
}

async function recordKeys(): Promise<string[]> {
  return (await records()).map((r) => `${r.table_name}:${r.row_id}:${r.reason}`);
}

async function storedRow(tableName: string, rowId: string) {
  return env.DB.prepare(
    `SELECT seq, payload, deleted_at, arrival_rev FROM sync_rows
     WHERE user_id = ? AND table_name = ? AND row_id = ?`,
  )
    .bind(USER, tableName, rowId)
    .first<{
      seq: number;
      payload: string | null;
      deleted_at: string | null;
      arrival_rev: number;
    }>();
}

async function stateRev(): Promise<number | null> {
  const found = await env.DB.prepare('SELECT state_rev FROM sync_sequence WHERE user_id = ?')
    .bind(USER)
    .first<{ state_rev: number }>();
  return found?.state_rev ?? null;
}

async function pullAll() {
  return transport.pull({
    protocolVersion: PROTOCOL_VERSION,
    tables: ALL_TABLES.map((tableName) => ({ tableName, cursor: 0 })),
  });
}

const ALL_TABLES: SyncTableName[] = ['sessions', 'series', 'shots', 'firearms', 'licenses'];

const nameOf = async (tableName: string, rowId: string) => {
  const found = await storedRow(tableName, rowId);
  return found?.payload === null || found === null
    ? null
    : (JSON.parse(found.payload) as { name?: string }).name;
};

describe('H1’ rows after a refused session wait on the server', () => {
  it('acks R1, T1, T2 family_refused naming S1, keeps their payloads, and stores none', async () => {
    await push([S(true)]);
    const later = [R('r1'), T('t1', 'r1'), T('t2', 'r1')];

    const acks = await push(later);

    expect(acks).toStrictEqual(
      later.map((c) => rejected(c, 'family_refused', 2, ref('sessions', 's1'))),
    );
    expect(await records()).toEqual([
      expect.objectContaining({
        table_name: 'series',
        row_id: 'r1',
        reason: 'family_refused',
        parent: 'sessions:s1',
        arrival: 2,
        blocker: 'sessions:s1',
      }),
      expect.objectContaining({
        table_name: 'sessions',
        row_id: 's1',
        reason: 'invalid_payload',
        parent: null,
        arrival: 1,
        blocker: null,
        waiting_payload: null,
      }),
      expect.objectContaining({
        table_name: 'shots',
        row_id: 't1',
        reason: 'family_refused',
        parent: 'series:r1',
        blocker: 'sessions:s1',
      }),
      expect.objectContaining({
        table_name: 'shots',
        row_id: 't2',
        reason: 'family_refused',
        parent: 'series:r1',
      }),
    ]);
    // H3': the server holds R1's payload until the family is released.
    expect(JSON.parse((await records())[0]!.waiting_payload!)).toEqual(later[0]!.payload);
    expect(await storedCount()).toBe(0);
    const pulled = await pullAll();
    expect(pulled.changes).toEqual([]);
    expect(pulled.refusals).toEqual([
      {
        tableName: 'series',
        rowId: 'r1',
        reason: 'family_refused',
        arrival: 2,
        blocker: ref('sessions', 's1'),
      },
      { tableName: 'sessions', rowId: 's1', reason: 'invalid_payload', arrival: 1, blocker: null },
      {
        tableName: 'shots',
        rowId: 't1',
        reason: 'family_refused',
        arrival: 2,
        blocker: ref('sessions', 's1'),
      },
      {
        tableName: 'shots',
        rowId: 't2',
        reason: 'family_refused',
        arrival: 2,
        blocker: ref('sessions', 's1'),
      },
    ]);
  });
});

describe('H2’ fixing the refused row lands the family in one batch', () => {
  it('applies S1, then R1, T1, T2 at their own arrival, each at a new seq', async () => {
    await push([S(true)]);
    await push([R('r1'), T('t1', 'r1')]);
    await push([T('t2', 'r1')]);

    const [fix] = await push([S()]);

    expect(fix).toStrictEqual({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest types asymmetric matchers as `any`
      clientChangeId: expect.any(String),
      status: 'applied',
      seq: 1,
      arrival: 4,
    });
    expect(await records()).toEqual([]);
    const pulled = await pullAll();
    expect(pulled.refusals).toEqual([]);
    expect(pulled.changes.map((c) => [c.tableName, c.rowId, c.seq, c.arrival])).toEqual([
      ['sessions', 's1', 1, 4],
      ['series', 'r1', 2, 2],
      ['shots', 't1', 3, 2],
      ['shots', 't2', 4, 3],
    ]);
    expect(await lastSeq()).toBe(4);
  });
});

describe('H7’ ROOT deleting the root releases the family', () => {
  it('H7’ a tombstone of the refused session applies its waiting rows under it (N5)', async () => {
    await push([S(true)]);
    await push([R('r1'), T('t1', 'r1')]);

    const [removal] = await push([tombstone('sessions', 's1')]);

    expect(removal).toMatchObject({ status: 'applied' });
    expect(await records()).toEqual([]);
    expect(await storedRow('series', 'r1')).toMatchObject({ arrival_rev: 2, deleted_at: null });
    expect(await storedRow('shots', 't1')).toMatchObject({ arrival_rev: 2 });
  });

  it('ROOT a session deleted on another device makes its bad row inert and applies the waiting rows', async () => {
    await push([S(), R('r1'), R('r2')]);
    await push([T('t2', 'r1', true)]);
    await push([T('t3', 'r2')]);
    expect(await recordKeys()).toEqual(['shots:t2:invalid_payload', 'shots:t3:family_refused']);

    await push([tombstone('sessions', 's1')]);

    expect(await records()).toEqual([]);
    expect(await storedRow('shots', 't3')).toMatchObject({ arrival_rev: 3 });
    expect(await storedRow('shots', 't2')).toBeNull();
  });
});

describe('H8’ another device’s valid version of the refused row releases it', () => {
  it('a valid T2 deletes T2’s record and applies S1’s waiting rows in that batch', async () => {
    await push([S(), R('r1'), T('t2', 'r1')]);
    await push([T('t2', 'r1', true)]);
    await push([R('r2'), T('t3', 'r2')]);
    expect((await recordKeys()).length).toBe(3);

    await push([T('t2', 'r1')]);

    expect(await records()).toEqual([]);
    expect(await storedRow('shots', 't3')).toMatchObject({ arrival_rev: 3 });
  });
});

describe('H10’ tombstones are never refused', () => {
  it('applies a tombstone of a row whose session is a bad row', async () => {
    await push([R('r1'), T('t1', 'r1')]);
    await push([S(true)]);
    const [ack] = await push([tombstone('shots', 't1')]);
    expect(ack).toMatchObject({ status: 'applied' });
  });
});

describe('H13’ a bad row acked tombstoned blocks nothing', () => {
  it('applies R1 and T1 beside an invalid S1 over a tombstone', async () => {
    await push([S()]);
    await push([tombstone('sessions', 's1')]);

    const acks = await push([S(true), R('r1'), T('t1', 'r1')]);

    expect(acks.map((a) => [a.status, a.reason])).toEqual([
      ['rejected', 'tombstoned'],
      ['applied', undefined],
      ['applied', undefined],
    ]);
    expect(await records()).toEqual([]);
  });
});

describe('V1 X5 a deletion of a waiting row goes out and stays', () => {
  it('V1 a tombstone of a waiting T1 is applied, and the release later does not bring T1 back', async () => {
    await push([S(true)]);
    await push([R('r1'), T('t1', 'r1')]);

    await push([tombstone('shots', 't1')]);
    expect(await recordKeys()).toEqual(['series:r1:family_refused', 'sessions:s1:invalid_payload']);

    await push([S()]);
    expect(await storedRow('shots', 't1')).toMatchObject({ deleted_at: T1, payload: null });
    expect(await storedRow('series', 'r1')).toMatchObject({ deleted_at: null });
  });

  it('X5 a deleted waiting row stays deleted: a later live edit acks tombstoned', async () => {
    await push([S(true)]);
    await push([R('r1')]);
    await push([tombstone('series', 'r1')]);
    expect(await recordKeys()).toEqual(['sessions:s1:invalid_payload']);

    const [later] = await push([R('r1')]);
    expect(later).toMatchObject({ status: 'rejected', reason: 'tombstoned' });
    await push([S()]);
    expect(await storedRow('series', 'r1')).toMatchObject({ deleted_at: T1 });
  });
});

describe('X8 a lost push response cannot split a family', () => {
  it('the replay of R1 does not suppress its release; its ack carries the applied R1', async () => {
    const r1 = R('r1');
    await push([S()]);
    await push([r1, T('t1', 'r1', true)]);
    expect(await recordKeys()).toEqual(['series:r1:family_refused', 'shots:t1:invalid_payload']);

    const acks = await push([r1, T('t1', 'r1')]);

    expect(acks[0]).toStrictEqual({
      clientChangeId: r1.clientChangeId,
      status: 'duplicate',
      reason: 'family_refused',
      arrival: 2,
      blocker: ref('shots', 't1'),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest types asymmetric matchers as `any`
      current: expect.objectContaining({
        tableName: 'series',
        rowId: 'r1',
        arrival: 2,
        payload: r1.payload,
      }),
    });
    expect(acks[1]).toMatchObject({ status: 'applied', arrival: 3 });
    expect(await records()).toEqual([]);
    expect(await storedRow('series', 'r1')).toMatchObject({ arrival_rev: 2 });
  });
});

describe('X9 a still-invalid re-queue keeps the family blocked', () => {
  it('T3 of a stored R2 waits on T2 of R1, and T2 sent again invalid stays bad', async () => {
    await push([S(), R('r1'), R('r2')]);
    await push([T('t2', 'r1', true)]);
    const [t3] = await push([T('t3', 'r2')]);
    expect(t3).toMatchObject({ reason: 'family_refused', blocker: ref('shots', 't2') });

    const [again] = await push([T('t2', 'r1', true)]);

    expect(again).toMatchObject({ reason: 'invalid_payload', arrival: 4 });
    expect(await recordKeys()).toEqual(['shots:t2:invalid_payload', 'shots:t3:family_refused']);
    expect(await storedRow('shots', 't3')).toBeNull();
  });
});

describe('AB X7 RELEASEFAIL the change that reached the server last wins', () => {
  it('AB another device’s later edit of a waiting row replaces it and is applied at its arrival', async () => {
    await push([S(), R('r1'), T('t2', 'r1')]);
    await push([T('t2', 'r1', true)]);
    await push([live('sessions', 's1', { name: 'A-name' })]);
    await push([live('sessions', 's1', { name: 'B-name' })]);
    expect((await records()).find((r) => r.row_id === 's1')).toMatchObject({ arrival: 4 });

    await push([T('t2', 'r1')]);

    expect(await nameOf('sessions', 's1')).toBe('B-name');
    expect(await storedRow('sessions', 's1')).toMatchObject({ arrival_rev: 4 });
  });

  it('X7 an offline edit that reaches the server later wins', async () => {
    await push([S(), R('r1'), T('t2', 'r1')]);
    await push([T('t2', 'r1', true)]);
    await push([live('sessions', 's1', { name: 'B-name' })]);
    await push([live('sessions', 's1', { name: 'A-name' })]);

    await push([T('t2', 'r1')]);

    expect(await nameOf('sessions', 's1')).toBe('A-name');
  });

  it('RELEASEFAIL a failed push changes nothing, and the next one replaces the waiting version', async () => {
    await push([S(), R('r1'), T('t2', 'r1')]);
    await push([T('t2', 'r1', true)]);
    await push([live('sessions', 's1', { name: 'A-name' })]);
    const before = JSON.stringify([await records(), await pullAll()]);

    // B's push crashes at every D1 call in turn, its batch included.
    let crashes = 0;
    for (let k = 0; ; k += 1) {
      const gate = gateD1(env.DB, { kind: 'fail-before', at: k });
      const response = await pushThrough(gate.d1, [
        live('sessions', 's1', { name: 'B-name' }),
        T('t9', 'r1'),
      ]);
      if (response.status === 200) break;
      expect(response.status).toBe(500);
      crashes += 1;
      expect(JSON.stringify([await records(), await pullAll()]), `crash at call ${k}`).toBe(before);
    }
    expect(crashes).toBeGreaterThan(3);

    // The attempt that got through waits at arrival 4 and replaces A's (3).
    expect((await records()).find((r) => r.row_id === 's1')).toMatchObject({ arrival: 4 });
    await push([T('t2', 'r1')]);
    expect(await nameOf('sessions', 's1')).toBe('B-name');
  });
});

describe('REV2 DUP a duplicate ack carries the row as stored now', () => {
  it('REV2 a lost response, then another device’s fix and rename: the replay brings “B”', async () => {
    await push([S(), R('r1'), T('t2', 'r1')]);
    await push([T('t2', 'r1', true)]);
    const renameA = live('sessions', 's1', { name: 'A' });
    await push([renameA]);

    await push([T('t2', 'r1'), live('sessions', 's1', { name: 'B' })]);
    expect(await records()).toEqual([]);
    expect(await nameOf('sessions', 's1')).toBe('B');

    const [replay] = await push([renameA]);
    expect(replay).toMatchObject({
      status: 'duplicate',
      reason: 'family_refused',
      arrival: 3,
      blocker: ref('shots', 't2'),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest types asymmetric matchers as `any`
      current: expect.objectContaining({
        rowId: 's1',
        arrival: 4,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest types asymmetric matchers as `any`
        payload: expect.objectContaining({ name: 'B' }),
      }),
    });
  });

  it('DUP on the plain path: a replay of an applied edit carries the later edit', async () => {
    const e = live('sessions', 's1', { name: 'E' });
    await push([e]);
    await push([live('sessions', 's1', { name: 'B' })]);

    const [replay] = await push([e]);

    expect(replay).toStrictEqual({
      clientChangeId: e.clientChangeId,
      status: 'duplicate',
      seq: 1,
      arrival: 1,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest types asymmetric matchers as `any`
      current: expect.objectContaining({
        rowId: 's1',
        seq: 2,
        arrival: 2,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest types asymmetric matchers as `any`
        payload: expect.objectContaining({ name: 'B' }),
      }),
    });
  });
});

describe('REV6 a moved row leaves no stale link', () => {
  // The bad row is T3 of R2, not a shot of R1: a shot of R1 would move with
  // it (spec Revision 4, item 4).
  it('R1 moved to S2 is applied, its record goes, and S1’s release does not bring its old version back', async () => {
    await push([S(), S(false, 's2'), R('r1'), R('r2'), T('t3', 'r2')]);
    await push([T('t3', 'r2', true)]);
    await push([live('series', 'r1', { session_id: 's1', position: 7 })]);
    expect(await recordKeys()).toEqual(['series:r1:family_refused', 'shots:t3:invalid_payload']);

    const [moved] = await push([live('series', 'r1', { session_id: 's2', position: 8 })]);
    expect(moved).toMatchObject({ status: 'applied' });
    expect(await recordKeys()).toEqual(['shots:t3:invalid_payload']);

    // T7's root is S2, from the stored R1.
    const [t7] = await push([T('t7', 'r1')]);
    expect(t7).toMatchObject({ status: 'applied' });

    await push([T('t3', 'r2')]);
    const r1 = JSON.parse((await storedRow('series', 'r1'))!.payload!) as {
      position: number;
      session_id: string;
    };
    expect(r1).toMatchObject({ position: 8, session_id: 's2' });
  });
});

describe('TOMBROOT the root walk stops at a tombstoned row', () => {
  it('an invalid shot of a tombstoned series is inert, and T3 of R2 is applied', async () => {
    await push([S(), R('r1'), R('r2')]);
    await push([tombstone('series', 'r1')]);

    const acks = await push([T('t9', 'r1', true), T('t3', 'r2')]);

    expect(acks.map((a) => [a.status, a.reason])).toEqual([
      ['rejected', 'invalid_payload'],
      ['applied', undefined],
    ]);
    expect(await records()).toEqual([]);
  });
});

describe('TOMBROOT the walk reads two steps up from a row whose own link is unreadable', () => {
  it('an invalid shot with series_id null under a tombstoned session is inert', async () => {
    await push([S(), R('r1'), T('t2', 'r1')]);
    await push([tombstone('sessions', 's1')]);

    const [ack] = await push([live('shots', 't2', { series_id: null })]);

    // T2 links to R1 from its stored row, and R1 to S1: two steps, to a tombstone.
    expect(ack).toMatchObject({ status: 'rejected', reason: 'invalid_payload' });
    expect(await records()).toEqual([]);
  });
});

// §11.5's release skips two kinds of rows that the records table says cannot
// coexist with a waiting record. A defect could leave one (the release list
// "also catches any record that a defect left unblocked"), so the state is
// written directly, as REVAL writes its tightened payload.
describe('a release skips a row the server already holds later or deleted', () => {
  async function seedWaiting(rowId: string, arrival: number, name: string) {
    await env.DB.prepare(
      `INSERT INTO sync_refusals (user_id, table_name, row_id, reason, parent_table, parent_row_id,
         payload, updated_at, arrival)
       VALUES (?, 'sessions', ?, 'family_refused', NULL, NULL, ?, ?, ?)`,
    )
      .bind(USER, rowId, JSON.stringify(row('sessions', rowId, T0, { name })), T0, arrival)
      .run();
  }

  it('keeps a stored tombstone of the row, and deletes the record', async () => {
    await push([S()]);
    await push([tombstone('sessions', 's1')]);
    await seedWaiting('s1', 5, 'waiting');

    await push([live('tags', 'g1')]);

    expect(await storedRow('sessions', 's1')).toMatchObject({ deleted_at: T1 });
    expect(await records()).toEqual([]);
  });

  it('keeps a stored version that arrived after the record, and deletes the record', async () => {
    await push([S()]);
    await push([live('sessions', 's1', { name: 'later' })]);
    await seedWaiting('s1', 1, 'older');

    await push([live('tags', 'g1')]);

    expect(await nameOf('sessions', 's1')).toBe('later');
    expect(await records()).toEqual([]);
  });

  it('keeps a stored version that arrived at the record’s own arrival, and deletes the record', async () => {
    await push([S()]);
    await push([live('sessions', 's1', { name: 'stored' })]);
    expect(await storedRow('sessions', 's1')).toMatchObject({ arrival_rev: 2 });
    await seedWaiting('s1', 2, 'waiting');

    await push([live('tags', 'g1')]);

    expect(await nameOf('sessions', 's1')).toBe('stored');
    expect(await records()).toEqual([]);
  });
});

describe('GAP C4’s remaining gap', () => {
  it('T3 is applied while nothing links R2 to S1; when R1 and R2 arrive, both wait', async () => {
    const acks = await push([T('t1', 'r1', true), T('t3', 'r2')]);
    expect(acks[1]).toMatchObject({ status: 'applied' });

    const later = await push([R('r1'), R('r2')]);

    expect(later.map((a) => a.reason)).toEqual(['family_refused', 'family_refused']);
    expect(await storedRow('shots', 't3')).not.toBeNull();
  });
});

describe('FIRST a user’s first push', () => {
  it('creates the sequence row with last_seq 0 and state_rev 1, even when every change is refused', async () => {
    expect(await stateRev()).toBeNull();
    await push([S(true)]);
    expect(await stateRev()).toBe(1);
    expect(await lastSeq()).toBe(0);
  });

  it('a second first push judged from state_rev 0 fails its guard and is judged again', async () => {
    const gate = gateD1(env.DB, { kind: 'pause', at: 4 });
    const pending = pushThrough(gate.d1, [R('r1')]);
    await gate.paused;
    await push([S(true)]);
    gate.release();

    const [ack] = (await pending).acks;

    expect(ack).toMatchObject({
      reason: 'family_refused',
      arrival: 2,
      blocker: ref('sessions', 's1'),
    });
    expect(gate.calls()).toBeGreaterThan(5);
  });
});

describe('CONC two devices push into one family at once', () => {
  it('B’s batch fails its guard after A commits, writes nothing, and is judged again: T3 waits', async () => {
    await push([S(), R('r1'), R('r2')]);
    const gate = gateD1(env.DB, { kind: 'pause', at: 4 });
    const pendingB = pushThrough(gate.d1, [T('t3', 'r2')]);
    await gate.paused;
    await push([T('t2', 'r1', true)]);
    gate.release();

    const response = await pendingB;

    expect(response.status).toBe(200);
    expect(response.acks[0]).toMatchObject({
      reason: 'family_refused',
      arrival: 3,
      blocker: ref('shots', 't2'),
    });
    expect(await storedRow('shots', 't3')).toBeNull();
  });

  it('the guard’s failure is the NOT NULL message on state_rev, and nothing of the batch lands', async () => {
    await push([S()]);
    await expect(
      env.DB.batch([
        env.DB.prepare(
          `INSERT INTO sync_sequence (user_id, last_seq, state_rev) VALUES (?1, 0, 1)
           ON CONFLICT (user_id) DO UPDATE SET state_rev = CASE WHEN state_rev = ?2 THEN state_rev + 1 END`,
        ).bind(USER, 0),
        env.DB.prepare('DELETE FROM sync_rows WHERE user_id = ?').bind(USER),
      ]),
    ).rejects.toThrow('NOT NULL constraint failed: sync_sequence.state_rev');
    expect(await storedCount()).toBe(1);
  });

  it('answers 503 busy when the guard fails four times', async () => {
    await push([S()]);
    const racing = bumpBeforeEveryBatch(env.DB);
    const response = await pushThrough(racing, [R('r1')]);
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'busy' });
    expect(await storedRow('series', 'r1')).toBeNull();
  });

  it('tries the batch four times: a guard that fails three times then holds applies the push', async () => {
    await push([S()]);
    const racing = racingD1(env.DB, 3);

    const response = await pushThrough(racing.d1, [R('r1')]);

    expect(response.status).toBe(200);
    expect(racing.attempts()).toBe(4);
    expect(await storedRow('series', 'r1')).not.toBeNull();
  });

  it('gives up after the fourth failed guard, with no fifth batch', async () => {
    await push([S()]);
    const racing = racingD1(env.DB, Number.POSITIVE_INFINITY);

    const response = await pushThrough(racing.d1, [R('r1')]);

    expect(response.status).toBe(503);
    expect(racing.attempts()).toBe(4);
  });
});

/**
 * Commits `other` once, just before the push's first read of `state_rev`
 * executes. With `state_rev` read first, as §11.8 requires, every read of the
 * snapshot sees `other`; read later, the earlier reads miss it and the guard
 * still passes.
 */
function commitBeforeStateRevRead(real: D1Database, other: ClientChange[]): D1Database {
  let done = false;
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement =>
    new Proxy(statement, {
      get(target, prop) {
        if (prop === 'bind') return (...values: unknown[]) => wrap(target.bind(...values));
        const value = Reflect.get(target, prop) as unknown;
        if (typeof value !== 'function') return value;
        if (prop === 'all' || prop === 'raw' || prop === 'first' || prop === 'run') {
          return async (...args: unknown[]) => {
            if (!done) {
              done = true;
              await pushThrough(real, other);
            }
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return (value as () => unknown).bind(target);
      },
    });
  return new Proxy(real, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (query: string) => {
          const statement = target.prepare(query);
          return /select "state_rev" from "sync_sequence"/.test(query)
            ? wrap(statement)
            : statement;
        };
      }
      const value = Reflect.get(target, prop) as unknown;
      return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
    },
  });
}

describe('SNAP the snapshot reads state_rev before anything else', () => {
  it('a push committed just before the state_rev read is seen by every later read: T4 waits', async () => {
    await push([S(), R('r1'), T('t1', 'r1'), R('r2'), T('t3', 'r2')]);
    const racing = commitBeforeStateRevRead(env.DB, [T('t2', 'r1', true)]);

    const response = await pushThrough(racing, [T('t4', 'r2')]);

    expect(response.status).toBe(200);
    expect(response.acks[0]).toMatchObject({
      status: 'rejected',
      reason: 'family_refused',
      blocker: ref('shots', 't2'),
    });
    expect(await storedRow('shots', 't4')).toBeNull();
  });
});

describe('GONE a push judged before the account is deleted cannot land after it (V5-6)', () => {
  const OTHER = 'user-family-other';

  async function userRows(): Promise<number> {
    let n = 0;
    for (const table of ['sync_rows', 'sync_sequence', 'sync_idempotency', 'sync_refusals']) {
      const found = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`)
        .bind(USER)
        .first<{ n: number }>();
      n += found!.n;
    }
    return n;
  }

  it('the guard fails on a missing sequence row it expected, and nothing of the user is written', async () => {
    await push([S(), R('r1')]);
    const gate = gateD1(env.DB, { kind: 'pause', at: 4 });
    const pending = pushThrough(gate.d1, [T('t1', 'r1', true), T('t2', 'r1')]);
    await gate.paused;
    // The account deletion's cascade (routes/account.ts) commits in between.
    for (const table of ['sync_rows', 'sync_sequence', 'sync_idempotency', 'sync_refusals']) {
      await env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(USER).run();
    }
    gate.release();

    const response = await pending;

    expect(response.status).toBe(401);
    expect(await userRows()).toBe(0);
  });

  /** The account deletion's whole cascade (routes/account.ts), the `user` row included. */
  async function deleteAccount() {
    for (const table of ['sync_rows', 'sync_sequence', 'sync_idempotency', 'sync_refusals']) {
      await env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(USER).run();
    }
    await env.DB.prepare('DELETE FROM "user" WHERE id = ?').bind(USER).run();
  }

  async function accountExists(): Promise<boolean> {
    return (await env.DB.prepare('SELECT 1 FROM "user" WHERE id = ?').bind(USER).first()) !== null;
  }

  // Round 6, V6-1: attempt 1 is judged from an existing row and fails its
  // guard; the deletion commits before attempt 2 reads, which then sees no
  // sequence row. The guard must refuse because the account is gone.
  it('V6-1 a push judged again after its guard failed cannot recreate a deleted account', async () => {
    // Another account exists, as in production (round 7, F1).
    await ensureAccount(OTHER);
    await push([S(), R('r1')]);
    const batch = gateD1(env.DB, { kind: 'pause', at: 4 });
    const nextRead = gateD1(batch.d1, { kind: 'pause', at: 5 });
    const pending = pushThrough(nextRead.d1, [R('r2'), T('t3', 'r2'), T('t4', 'r2')]);
    await batch.paused;
    // Another device's push commits, so attempt 1's guard fails.
    await push([R('r9')]);
    batch.release();
    await nextRead.paused;
    await deleteAccount();
    nextRead.release();

    const response = await pending;

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'unauthenticated' });
    expect(await userRows()).toBe(0);
    expect(await accountExists()).toBe(false);
  });

  it('V6-1 a push whose first read follows the deletion cannot recreate the account', async () => {
    await ensureAccount(OTHER);
    await push([S()]);
    const gate = gateD1(env.DB, { kind: 'pause', at: 0 });
    const pending = pushThrough(gate.d1, [R('r1')]);
    await gate.paused;
    await deleteAccount();
    gate.release();

    const response = await pending;

    expect(response.status).toBe(401);
    expect(await userRows()).toBe(0);
  });

  // Round 7, F1: the guard must check the pushing user's account. A check
  // for any account passed while every test database held only this user.
  it('F1 the guard checks the pushing user’s account, not whether any account exists', async () => {
    await ensureAccount('acct-a');
    await ensureAccount('acct-b');
    await env.DB.prepare('DELETE FROM "user" WHERE id = ?').bind('acct-a').run();

    await expect(
      applyPush(createDb(env.DB), 'acct-a', [live('sessions', 's1')]),
    ).rejects.toBeInstanceOf(PushAccountGoneError);

    let stored = 0;
    for (const table of ['sync_rows', 'sync_sequence', 'sync_idempotency', 'sync_refusals']) {
      const found = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`)
        .bind('acct-a')
        .first<{ n: number }>();
      stored += found!.n;
    }
    expect(stored).toBe(0);
  });

  it('a first push still creates the sequence row', async () => {
    expect(await userRows()).toBe(0);
    const [ack] = await push([S()]);
    expect(ack).toMatchObject({ status: 'applied', arrival: 1 });
  });
});

describe('TENANT one account’s push leaves another’s records alone (V6-2)', () => {
  // Two accounts can hold the same ids: the JSON import keeps a session's
  // id (app/src/db/json-export/apply-import.ts). Each statement that writes
  // the records or applies them must keep to the pushing user.
  const U1 = 'user-family-u1';
  const U2 = 'user-family-u2';

  async function pushAs(userId: string, changes: ClientChange[]): Promise<PushAck[]> {
    const as = createHttpSyncTransport({
      fetchImpl: fetchApp,
      baseUrl: 'https://localhost',
      getToken: () => userId,
    });
    return (await as.push({ protocolVersion: PROTOCOL_VERSION, changes })).acks;
  }

  /** Everything the server holds for `userId`, as one comparable value. */
  async function holdings(userId: string) {
    const refusals = await env.DB.prepare(
      'SELECT * FROM sync_refusals WHERE user_id = ? ORDER BY table_name, row_id',
    )
      .bind(userId)
      .all();
    const rows = await env.DB.prepare(
      'SELECT * FROM sync_rows WHERE user_id = ? ORDER BY table_name, row_id',
    )
      .bind(userId)
      .all();
    return { refusals: refusals.results, rows: rows.results };
  }

  /** S1, R1 and T2 stored; T2 made bad; then a rename of S1 that waits on it. */
  async function waitingRename(userId: string) {
    await pushAs(userId, [S(), R('r1'), T('t2', 'r1')]);
    await pushAs(userId, [T('t2', 'r1', true)]);
    const [rename] = await pushAs(userId, [live('sessions', 's1', { name: `${userId} later` })]);
    expect(rename).toMatchObject({ reason: 'family_refused', blocker: ref('shots', 't2') });
  }

  it('U1’s fix releases U1’s waiting S1 and leaves U2’s waiting S1, its payload and blocker, as they were', async () => {
    await waitingRename(U1);
    await waitingRename(U2);
    const before = await holdings(U2);

    const [fix] = await pushAs(U1, [T('t2', 'r1')]);

    expect(fix).toMatchObject({ status: 'applied' });
    expect((await holdings(U1)).refusals).toEqual([]);
    expect(await holdings(U2)).toEqual(before);
    expect(before.refusals).toEqual([
      expect.objectContaining({ table_name: 'sessions', row_id: 's1', reason: 'family_refused' }),
      expect.objectContaining({ table_name: 'shots', row_id: 't2', reason: 'invalid_payload' }),
    ]);
  });

  it('U1’s demoted S1 becomes a bad row; U2’s waiting S1 stays a waiting row with its payload', async () => {
    await waitingRename(U1);
    await waitingRename(U2);
    // U1's waiting payload no longer validates, as in REVAL.
    await env.DB.prepare(
      `UPDATE sync_refusals SET payload = json_set(payload, '$.name', 42)
       WHERE user_id = ? AND row_id = 's1'`,
    )
      .bind(U1)
      .run();
    const before = await holdings(U2);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await pushAs(U1, [T('t2', 'r1')]);
    } finally {
      warn.mockRestore();
    }

    // As in REVAL, the fix waits on the demoted S1.
    expect((await holdings(U1)).refusals).toEqual([
      expect.objectContaining({ row_id: 's1', reason: 'invalid_payload', payload: null }),
      expect.objectContaining({ row_id: 't2', reason: 'family_refused', blocker_row_id: 's1' }),
    ]);
    expect(await holdings(U2)).toEqual(before);
  });

  it('U1’s moved blocker is written to U1’s waiting S1 only; U2’s S1 keeps its own', async () => {
    await waitingRename(U1);
    await pushAs(U1, [T('t5', 'r1', true)]);
    await waitingRename(U2);
    const before = await holdings(U2);

    await pushAs(U1, [T('t2', 'r1')]);

    expect((await holdings(U1)).refusals).toEqual([
      expect.objectContaining({
        row_id: 's1',
        reason: 'family_refused',
        blocker_table: 'shots',
        blocker_row_id: 't5',
      }),
      expect.objectContaining({ row_id: 't2', reason: 'family_refused', blocker_row_id: 't5' }),
      expect.objectContaining({ row_id: 't5', reason: 'invalid_payload' }),
    ]);
    expect(await holdings(U2)).toEqual(before);
  });
});

describe('DISCARD a tombstone of the blocker releases the family', () => {
  it('B tombstones T2, which only A ever held; S1’s waiting rows are applied', async () => {
    await push([S(), R('r1')]);
    await push([T('t2', 'r1', true)]);
    await push([T('t3', 'r1'), live('sessions', 's1', { name: 'later' })]);

    const [ack] = await push([tombstone('shots', 't2')]);

    expect(ack).toMatchObject({ status: 'applied' });
    expect(await storedRow('shots', 't2')).toMatchObject({ deleted_at: T1 });
    expect(await records()).toEqual([]);
    expect(await nameOf('sessions', 's1')).toBe('later');
    expect(await storedRow('shots', 't3')).toMatchObject({ arrival_rev: 3 });
  });
});

describe('FIRE a firearm family releases by C2', () => {
  it('fixing F releases L2, while L1 stays a bad row blocking only itself', async () => {
    await push([F(true)]);
    await push([L('l2')]);
    await push([L('l1', 'f1', true)]);
    expect(await recordKeys()).toEqual([
      'firearms:f1:invalid_payload',
      'licenses:l1:invalid_payload',
      'licenses:l2:family_refused',
    ]);

    await push([F()]);

    expect(await recordKeys()).toEqual(['licenses:l1:invalid_payload']);
    expect(await storedRow('licenses', 'l2')).toMatchObject({ arrival_rev: 2 });
    const [g] = await push([G('g1')]);
    expect(g).toMatchObject({ status: 'applied' });
  });
});

describe('OWN an invalid ownership column keeps the row in its family', () => {
  it('T2 with series_id null stays linked to R1 from its stored row, and T3 of R2 waits on it', async () => {
    await push([S(), R('r1'), R('r2'), T('t2', 'r1')]);

    const [bad] = await push([live('shots', 't2', { series_id: null })]);
    const [t3] = await push([T('t3', 'r2')]);

    expect(bad).toMatchObject({ reason: 'invalid_payload' });
    expect((await records()).find((r) => r.row_id === 't2')).toMatchObject({ parent: 'series:r1' });
    expect(t3).toMatchObject({ reason: 'family_refused', blocker: ref('shots', 't2') });
  });
});

describe('REVAL a released payload that no longer validates becomes a bad row', () => {
  // The spec's "T2 is applied" contradicts §11.4 and I2 once T1 is a bad row
  // of the same family at an earlier arrival; T2 waits too (spec Revision 4,
  // item 1).
  it('T1 fails re-validation at its own arrival, and its family, the fix included, keeps waiting', async () => {
    await push([S(), R('r9'), T('t2', 'r9')]);
    await push([T('t2', 'r9', true)]);
    await push([R('r1')]);
    await push([T('t1', 'r1')]);
    // The validator tightened since T1 arrived: its stored payload now fails.
    await env.DB.prepare(
      `UPDATE sync_refusals SET payload = json_set(payload, '$.value_tenths', 'x')
       WHERE user_id = ? AND row_id = 't1'`,
    )
      .bind(USER)
      .run();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const [fix] = await push([T('t2', 'r9')]);

      expect(fix).toMatchObject({ reason: 'family_refused', blocker: ref('shots', 't1') });
      expect(await records()).toEqual([
        expect.objectContaining({ row_id: 'r1', reason: 'family_refused', blocker: 'shots:t1' }),
        expect.objectContaining({
          row_id: 't1',
          reason: 'invalid_payload',
          arrival: 4,
          waiting_payload: null,
          blocker: null,
        }),
        expect.objectContaining({
          row_id: 't2',
          reason: 'family_refused',
          arrival: 5,
          blocker: 'shots:t1',
        }),
      ]);
      expect(await storedRow('series', 'r1')).toBeNull();
      const logged = warn.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(logged).toContain('sync push: a waiting shots row no longer validates (value_tenths:');
      expect(logged).not.toContain('t1');
    } finally {
      warn.mockRestore();
    }
  });
});

describe('MOVEIN a row moved into a blocked family waits', () => {
  it('R5 moved from S2 to S1 waits, linked to S1, and is released with S1’s rows', async () => {
    await push([S(), S(false, 's2'), R('r1'), T('t2', 'r1'), R('r5', 's2')]);
    await push([T('t2', 'r1', true)]);

    const [moved] = await push([live('series', 'r5', { session_id: 's1', position: 2 })]);

    expect(moved).toMatchObject({ reason: 'family_refused', blocker: ref('shots', 't2') });
    expect((await records()).find((r) => r.row_id === 'r5')).toMatchObject({
      parent: 'sessions:s1',
    });
    await push([T('t2', 'r1')]);
    const r5 = JSON.parse((await storedRow('series', 'r5'))!.payload!) as { session_id: string };
    expect(r5.session_id).toBe('s1');
  });
});

describe('STUCK the refusals list drops a record made inert by a deletion', () => {
  it('after S1 is deleted, the pull lists no refusal for T2', async () => {
    await push([S(), R('r1')]);
    await push([T('t2', 'r1', true)]);
    expect((await pullAll()).refusals).toHaveLength(1);

    await push([tombstone('sessions', 's1')]);

    expect((await pullAll()).refusals).toEqual([]);
  });
});

describe('the pull carries arrival on every row and the refusals on every response', () => {
  it('every page of a paged pull lists the refusals', async () => {
    await push([S(true)]);
    await push([F()]);
    const response = await transport.pull({
      protocolVersion: PROTOCOL_VERSION,
      tables: [{ tableName: 'firearms', cursor: 0 }],
    });
    expect(response.changes.map((c) => c.arrival)).toEqual([2]);
    expect(response.refusals).toHaveLength(1);
  });
});

describe('BUDGET the largest push stays within D1’s limits', () => {
  /**
   * `count` shots of R0 waiting on the bad T0 at arrival 3, written directly
   * (as REVAL writes its payload): building them through pushes would time
   * the thing under test.
   */
  async function seedWaitingShots(count: number) {
    await push([S(), R('r0'), T('t0', 'r0')]);
    await push([T('t0', 'r0', true)]);
    const template = JSON.stringify(
      row('shots', '__ID__', T0, { series_id: 'r0', value_tenths: 90 }),
    );
    await env.DB.prepare(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?2)
       INSERT INTO sync_refusals (user_id, table_name, row_id, reason, parent_table,
         parent_row_id, payload, updated_at, arrival, blocker_table, blocker_row_id)
       SELECT ?1, 'shots', 'w' || i, 'family_refused', 'series', 'r0',
         replace(?3, '__ID__', 'w' || i), ?4, 3, 'shots', 't0' FROM n`,
    )
      .bind(USER, count, template, T0)
      .run();
    await env.DB.prepare('UPDATE sync_sequence SET state_rev = 3 WHERE user_id = ?')
      .bind(USER)
      .run();
  }

  async function timed(changes: ClientChange[]) {
    const counting = countingD1(env.DB);
    const started = Date.now();
    const response = await pushThrough(counting.d1, changes);
    return { response, elapsed: Date.now() - started, counting };
  }

  it('V5-3 a push of one tag, a fix that moves every blocker, and one that releases them stay fast with 10,000 waiting rows', async ({
    annotate,
  }) => {
    const curve: string[] = [];
    for (const count of [1_000, 2_500, 5_000, 10_000]) {
      await env.DB.exec('DELETE FROM sync_rows');
      await env.DB.exec('DELETE FROM sync_sequence');
      await env.DB.exec('DELETE FROM sync_idempotency');
      await env.DB.exec('DELETE FROM sync_refusals');
      await seedWaitingShots(count);

      const tag = await timed([live('tags', `g${count}`)]);
      expect(tag.response.status).toBe(200);
      expect((await records()).length).toBe(count + 1);

      // A later bad row of the family, then the fix of the first: every
      // waiting row's blocker moves to T9, the fix waits too, and nothing is
      // released.
      await push([T('t9', 'r0', true)]);
      const move = await timed([T('t0', 'r0')]);
      expect(move.response.status).toBe(200);
      expect((await records()).filter((r) => r.blocker === 'shots:t9')).toHaveLength(count + 1);

      const fix = await timed([T('t9', 'r0')]);
      expect(fix.response.status).toBe(200);
      expect(await records()).toEqual([]);
      expect(await storedCount()).toBe(count + 5);

      for (const run of [tag, move, fix]) {
        // D1: 100 parameters and 100 KB of SQL per statement, 2 MB per string.
        expect(run.counting.maxParams()).toBeLessThan(100);
        expect(run.counting.maxSql()).toBeLessThan(100_000);
        expect(run.counting.maxBound()).toBeLessThan(2_000_000);
      }
      const point =
        `${count} waiting: tag push ${tag.elapsed} ms, blocker-moving fix ${move.elapsed} ms, ` +
        `releasing fix ${fix.elapsed} ms ` +
        `(longest SQL ${fix.counting.maxSql()} chars, longest bound string ` +
        `${fix.counting.maxBound()} chars)`;
      curve.push(point);
      // Printed by the reporter as each point is measured, for the evidence report.
      await annotate(`BUDGET point: ${point}`);
      if (count === 10_000) {
        // Well under D1's 30 s for the whole batch call.
        expect(tag.elapsed).toBeLessThan(5_000);
        expect(move.elapsed).toBeLessThan(10_000);
        expect(fix.elapsed).toBeLessThan(10_000);
      }
    }
    await annotate(`BUDGET curve: ${curve.join('; ')}`);
  }, 900_000);

  it('releases 2,000 waiting rows in a 500-change push: one batch, at most 5 reads before it', async ({
    annotate,
  }) => {
    await push([S(), R('r0'), T('t0', 'r0')]);
    await push([T('t0', 'r0', true)]);
    for (let chunk = 0; chunk < 4; chunk += 1) {
      await push(Array.from({ length: 500 }, (_, i) => T(`w${chunk * 500 + i}`, 'r0')));
    }
    expect((await records()).length).toBe(2001);
    const changes = [T('t0', 'r0'), ...Array.from({ length: 499 }, (_, i) => F(false, `f${i}`))];
    const counting = countingD1(env.DB);

    const started = Date.now();
    const response = await pushThrough(counting.d1, changes);
    const elapsed = Date.now() - started;

    expect(response.status).toBe(200);
    expect(await records()).toEqual([]);
    expect(counting.batches()).toEqual([5 * 500 + 7]);
    expect(counting.reads()).toBeLessThanOrEqual(5);
    // D1 allows 100 bound parameters per statement.
    expect(counting.maxParams()).toBeLessThan(100);
    // Printed by the reporter, for the evidence report.
    await annotate(
      `BUDGET: 500 changes releasing 2,000 rows: ${elapsed} ms wall time, ` +
        `${counting.reads()} reads, at most ${counting.maxParams()} parameters in a statement`,
    );
    expect(elapsed).toBeLessThan(30_000);
  }, 120_000);
});
