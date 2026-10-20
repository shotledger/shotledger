// docs/specs/sync-family-refusal-spec.md §11.10, properties I1 and I2,
// replayed against the real Worker and its D1: seeded push sequences over a
// fixed cast go through POST /sync/push, and an oracle written separately
// from judge.ts and from the batch's SQL checks the stored state after every
// push. shared/src/sync/judge.property.test.ts runs the same properties over
// the pure judge with a model of the batch; this file checks the batch
// itself (round 5, V5-5b).
import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import fc from 'fast-check';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  createHttpSyncTransport,
  PROTOCOL_VERSION,
  type ClientChange,
  type SyncTableName,
} from '@shotledger/shared';

import { devBearerAuthenticator } from '../src/auth';
import { SYNC_MIGRATIONS } from '../src/db/migrations';
import { createSyncRoutes } from '../src/routes/sync';
import { row } from './rows';

const USER = 'user-family-property';
const AT = '2026-10-20T10:00:00.000Z';

const app = new Hono<{ Bindings: Env }>();
app.route(
  '/sync',
  createSyncRoutes(() => devBearerAuthenticator),
);

const transport = createHttpSyncTransport({
  fetchImpl: async (input: string, init?: RequestInit) => {
    const ctx = createExecutionContext();
    const response = await app.fetch(new Request(input, init), env, ctx);
    await waitOnExecutionContext(ctx);
    return response;
  },
  baseUrl: 'https://localhost',
  getToken: () => USER,
});

/** The fixed cast: every row's table and parent. Rows never move. */
const CAST: Record<string, { tableName: SyncTableName; parent: string | null }> = {
  s1: { tableName: 'sessions', parent: null },
  s2: { tableName: 'sessions', parent: null },
  r1: { tableName: 'series', parent: 's1' },
  r2: { tableName: 'series', parent: 's1' },
  r3: { tableName: 'series', parent: 's2' },
  t1: { tableName: 'shots', parent: 'r1' },
  t2: { tableName: 'shots', parent: 'r1' },
  t3: { tableName: 'shots', parent: 'r2' },
  t4: { tableName: 'shots', parent: 'r3' },
  f1: { tableName: 'firearms', parent: null },
  l1: { tableName: 'licenses', parent: 'f1' },
  l2: { tableName: 'licenses', parent: 'f1' },
};
const IDS = Object.keys(CAST);
/** Each table's ownership column, and the field that makes its payload invalid. */
const SHAPE: Record<string, { column?: string; bad: Record<string, unknown> }> = {
  sessions: { bad: { name: null } },
  series: { column: 'session_id', bad: { position: null } },
  shots: { column: 'series_id', bad: { value_tenths: null } },
  firearms: { bad: { make: null } },
  licenses: { column: 'firearm_id', bad: { purpose: 42 } },
};

type Action = 'live' | 'invalid' | 'dead';

let counter = 0;
function change(id: string, action: Action): ClientChange {
  counter += 1;
  const { tableName, parent } = CAST[id]!;
  const shape = SHAPE[tableName]!;
  const fields = {
    ...(shape.column === undefined ? {} : { [shape.column]: parent }),
    ...(action === 'invalid' ? shape.bad : {}),
  };
  return {
    clientChangeId: `00000000-0000-4000-9000-${counter.toString(16).padStart(12, '0')}`,
    tableName,
    rowId: id,
    payload: action === 'dead' ? null : row(tableName, id, AT, fields),
    deletedAt: action === 'dead' ? AT : null,
    updatedAt: AT,
  };
}

// --- The state, read straight from D1.

interface State {
  stored: Map<string, { deleted: boolean; arrival: number }>;
  records: Map<string, { reason: string; arrival: number; blocker: string | null }>;
}

async function readState(): Promise<State> {
  const rows = await env.DB.prepare(
    'SELECT row_id, deleted_at IS NOT NULL AS deleted, arrival_rev FROM sync_rows WHERE user_id = ?',
  )
    .bind(USER)
    .all<{ row_id: string; deleted: number; arrival_rev: number }>();
  const records = await env.DB.prepare(
    'SELECT row_id, reason, arrival, blocker_row_id FROM sync_refusals WHERE user_id = ?',
  )
    .bind(USER)
    .all<{ row_id: string; reason: string; arrival: number; blocker_row_id: string | null }>();
  return {
    stored: new Map(
      rows.results.map((r) => [r.row_id, { deleted: r.deleted === 1, arrival: r.arrival_rev }]),
    ),
    records: new Map(
      records.results.map((r) => [
        r.row_id,
        { reason: r.reason, arrival: r.arrival, blocker: r.blocker_row_id },
      ]),
    ),
  };
}

// --- The oracle: §11.4 restated over the cast, independent of judge.ts and the SQL.

const isSession = (id: string) => ['sessions', 'series', 'shots'].includes(CAST[id]!.tableName);
const deletedIn = (state: State, id: string) => state.stored.get(id)?.deleted === true;
function rootOf(state: State, id: string): string {
  let current = id;
  while (!deletedIn(state, current) && CAST[current]!.parent !== null) {
    current = CAST[current]!.parent!;
  }
  return current;
}
/** The non-inert bad rows that block `id`, oldest first, then by table and id in code units. */
function blockersOf(state: State, id: string): [string, number][] {
  const bad = [...state.records].flatMap(([badId, r]) =>
    r.reason === 'invalid_payload' && !deletedIn(state, rootOf(state, badId))
      ? [[badId, r.arrival] as [string, number]]
      : [],
  );
  const blocking = bad.filter(([badId]) => {
    if (isSession(id)) return isSession(badId) && rootOf(state, badId) === rootOf(state, id);
    return CAST[id]!.tableName !== 'firearms' && badId === CAST[id]!.parent;
  });
  const order = (id2: string) => `${CAST[id2]!.tableName}\u0000${id2}`;
  return blocking.sort(
    (a, b) => a[1] - b[1] || (order(a[0]) < order(b[0]) ? -1 : order(a[0]) > order(b[0]) ? 1 : 0),
  );
}

function checkInvariants(state: State) {
  for (const [id, record] of state.records) {
    if (record.reason !== 'family_refused') continue;
    const blockers = blockersOf(state, id);
    // I1: every waiting record is blocked, by its first blocking bad row.
    expect(blockers.length, `I1 ${id}`).toBeGreaterThan(0);
    expect(record.blocker, `I1 blocker of ${id}`).toBe(blockers[0]![0]);
  }
  for (const [id, row] of state.stored) {
    if (row.deleted) continue;
    // I2: no live stored row arrived at or after its family's first bad row.
    const first = blockersOf(state, id)[0];
    if (first !== undefined) expect(row.arrival, `I2 ${id}`).toBeLessThan(first[1]);
  }
}

/** Adds each unknown ancestor as a valid live write ahead of its child, so C4's gap never opens. */
function withAncestors(state: State, ops: { id: string; action: Action }[]) {
  const out: { id: string; action: Action }[] = [];
  const inPush = new Set<string>();
  const known = (id: string) => state.stored.has(id) || state.records.has(id) || inPush.has(id);
  const add = (id: string, action: Action) => {
    const parent = CAST[id]!.parent;
    if (action !== 'dead' && parent !== null && !known(parent)) add(parent, 'live');
    out.push({ id, action });
    inPush.add(id);
  };
  for (const o of ops) add(o.id, o.action);
  return out;
}

async function pushOps(ops: { id: string; action: Action }[]) {
  const full = withAncestors(await readState(), ops);
  await transport.push({
    protocolVersion: PROTOCOL_VERSION,
    changes: full.map((o) => change(o.id, o.action)),
  });
}

async function wipe() {
  for (const table of ['sync_rows', 'sync_sequence', 'sync_idempotency', 'sync_refusals']) {
    await env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(USER).run();
  }
}

const op = fc.record({
  id: fc.constantFrom(...IDS),
  action: fc.constantFrom<Action>('live', 'live', 'invalid', 'dead'),
});
const pushes = fc.array(fc.array(op, { minLength: 1, maxLength: 4 }), {
  minLength: 1,
  maxLength: 6,
});

beforeAll(async () => {
  await applyD1Migrations(env.DB, SYNC_MIGRATIONS);
});

describe('I1 and I2 over seeded push sequences, through the Worker and D1', () => {
  it('hold after every push, and fixing every bad row releases every waiting row', async () => {
    await fc.assert(
      fc.asyncProperty(pushes, async (sequence) => {
        await wipe();
        for (const ops of sequence) {
          await pushOps(ops);
          checkInvariants(await readState());
        }
        const before = await readState();
        const waiting = [...before.records].filter(([, r]) => r.reason === 'family_refused');
        const fixes = [...before.records]
          .filter(([, r]) => r.reason === 'invalid_payload')
          .map(([id]) => ({ id, action: 'live' as const }));
        if (fixes.length > 0) await pushOps(fixes);
        const after = await readState();
        checkInvariants(after);
        expect([...after.records.values()].filter((r) => r.reason === 'family_refused')).toEqual(
          [],
        );
        // Each released row is stored at its own first arrival, unless deleted.
        for (const [id, record] of waiting) {
          if (after.stored.get(id)?.deleted) continue;
          expect(after.stored.get(id)?.arrival, `release of ${id}`).toBe(record.arrival);
        }
      }),
      // Seeded, so a failure replays; small, since every push is a real batch.
      { seed: 856, numRuns: 100 },
    );
  }, 300_000);
});
