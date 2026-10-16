// Family refusal on /sync/push, through the real route and the real D1 batch
// (docs/specs/sync-family-refusal-spec.md F1–F11). H1–H10 drive the real
// client engine and live in sync-client.spec.ts.
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

import { devBearerAuthenticator } from '../src/auth';
import { SYNC_MIGRATIONS } from '../src/db/migrations';
import { createSyncRoutes } from '../src/routes/sync';
import { row } from './rows';

const USER = 'user-family';
const T0 = '2026-10-14T10:00:00.000Z';
const T1 = '2026-10-14T11:00:00.000Z';

const app = new Hono<{ Bindings: Env }>();
app.route(
  '/sync',
  createSyncRoutes(() => devBearerAuthenticator),
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

const rejected = (change: ClientChange, reason: string): PushAck => ({
  clientChangeId: change.clientChangeId,
  status: 'rejected',
  reason,
});

beforeAll(async () => {
  await applyD1Migrations(env.DB, SYNC_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.exec('DELETE FROM sync_rows');
  await env.DB.exec('DELETE FROM sync_sequence');
  await env.DB.exec('DELETE FROM sync_idempotency');
});

describe('F1 a refused session refuses its whole push family', () => {
  it('refuses R1, T1, T2 as family_refused, stores none of them and consumes no seq', async () => {
    const changes = [S(true), R('r1'), T('t1', 'r1'), T('t2', 'r1')];
    const [s, r1, t1, t2] = changes;

    const acks = await push(changes);

    expect(acks).toStrictEqual([
      rejected(s!, 'invalid_payload'),
      rejected(r1!, 'family_refused'),
      rejected(t1!, 'family_refused'),
      rejected(t2!, 'family_refused'),
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
      rejected(t1, 'invalid_payload'),
      rejected(t2, 'family_refused'),
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
      })),
    );
    expect(await lastSeq()).toBe(3);
  });
});

describe('F6 a refused firearm refuses its rows; a refused row of it does not refuse the firearm', () => {
  it('refuses L1 and G1 with F*', async () => {
    const changes = [F(true), L('l1'), G('g1')];
    const [f, l1, g1] = changes;
    expect(await push(changes)).toStrictEqual([
      rejected(f!, 'invalid_payload'),
      rejected(l1!, 'family_refused'),
      rejected(g1!, 'family_refused'),
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
  it('acks duplicate/family_refused with no seq on a replay of F1', async () => {
    const changes = [S(true), R('r1'), T('t1', 'r1'), T('t2', 'r1')];
    await push(changes);

    const acks = await push(changes);

    expect(acks.slice(1)).toStrictEqual(
      changes.slice(1).map((change) => ({
        clientChangeId: change.clientChangeId,
        status: 'duplicate',
        reason: 'family_refused',
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

    expect(acks[1]).toStrictEqual(rejected(r1, 'tombstoned'));
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
