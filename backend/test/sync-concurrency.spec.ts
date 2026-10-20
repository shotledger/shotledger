import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { Hono } from 'hono';

import {
  mergeChange,
  type ClientChange,
  type PushAck,
  type StoredRow,
} from '@shotledger/shared/src/sync';

import { devBearerAuthenticator } from '../src/auth';
import { SYNC_MIGRATIONS } from '../src/db/migrations';
import { applyPush, createDb, pullTablePage, type PullPage } from '../src/db/queries';
import { createSyncRoutes } from '../src/routes/sync';

import { gateD1, SimulatedCrash } from './gated-d1';
import { wholeRow } from './rows';

// Scenarios C1–C9 and the 500-change adversarial case (ADV1) of
// docs/specs/sync-push-atomicity-spec.md.

const USER = 'u';
const T0 = '2026-08-01T00:00:00.000Z';
/** Stops a pause/crash loop that never runs out of calls. */
const MAX_CALLS = 64;

function cid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

function live(id: number, rowId: string, make: string, updatedAt = T0): ClientChange {
  return {
    clientChangeId: cid(id),
    tableName: 'firearms',
    rowId,
    payload: { make },
    deletedAt: null,
    updatedAt,
  };
}

function tombstone(id: number, rowId: string, deletedAt: string): ClientChange {
  return {
    clientChangeId: cid(id),
    tableName: 'firearms',
    rowId,
    payload: null,
    deletedAt,
    updatedAt: deletedAt,
  };
}

const db = () => createDb(env.DB);

async function wipe() {
  await env.DB.exec('DELETE FROM sync_rows');
  await env.DB.exec('DELETE FROM sync_sequence');
  await env.DB.exec('DELETE FROM sync_idempotency');
  await env.DB.exec('DELETE FROM sync_refusals');
}

/**
 * Every sync table, as one comparable string. Not `state_rev`: every push
 * batch bumps it, a replay that changes nothing else included
 * (sync-family-refusal-spec.md §11.3); `stateRev()` reads it.
 */
async function snapshot(): Promise<string> {
  const rows = await env.DB.prepare(
    'SELECT * FROM sync_rows ORDER BY user_id, table_name, row_id',
  ).all();
  const sequence = await env.DB.prepare(
    'SELECT user_id, last_seq FROM sync_sequence ORDER BY user_id',
  ).all();
  const records = await env.DB.prepare(
    'SELECT * FROM sync_idempotency ORDER BY user_id, client_change_id',
  ).all();
  return JSON.stringify([rows.results, sequence.results, records.results]);
}

async function stateRev(): Promise<number> {
  const found = await env.DB.prepare('SELECT state_rev FROM sync_sequence WHERE user_id = ?')
    .bind(USER)
    .first<{ state_rev: number }>();
  return found!.state_rev;
}

async function pullAll(cursor = 0): Promise<PullPage> {
  return pullTablePage(db(), USER, 'firearms', cursor);
}

/** The stored row as mergeChange models it: without its arrival (§11.3). */
async function storedRow(rowId: string): Promise<StoredRow | undefined> {
  const found = (await pullAll()).rows.find((row) => row.rowId === rowId);
  if (found === undefined) return undefined;
  const { arrival: _arrival, ...row } = found;
  return row;
}

/**
 * Runs push A through a gate that parks it before its call k, runs
 * `whileAPaused` (other devices), then lets A finish. When A makes fewer
 * than k + 1 calls it is never parked: it completes first and
 * `whileAPaused` runs after it, so the loop below also covers "A first".
 */
async function runWithAPausedAt(
  k: number,
  pushA: ClientChange[],
  whileAPaused: () => Promise<void>,
): Promise<{ reached: boolean; acksA: PushAck[] }> {
  const gate = gateD1(env.DB, { kind: 'pause', at: k });
  const pending = applyPush(createDb(gate.d1), USER, pushA);
  const reached = await Promise.race([gate.paused.then(() => true), pending.then(() => false)]);
  await whileAPaused();
  gate.release();
  const acksA = await pending;
  expect(gate.calls(), 'the gate saw no D1 call').toBeGreaterThan(0);
  return { reached, acksA };
}

/** Runs `scenario` for k = 0, 1, … until k is past the push's last call. */
async function forEveryCallIndex(scenario: (k: number) => Promise<boolean>): Promise<number> {
  let reachedCount = 0;
  for (let k = 0; k < MAX_CALLS; k++) {
    if (!(await scenario(k))) {
      expect(reachedCount, 'no call index was ever reached').toBeGreaterThan(0);
      return reachedCount;
    }
    reachedCount += 1;
  }
  throw new Error(`push still making D1 calls after ${MAX_CALLS}`);
}

function isCrash(error: unknown): boolean {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if (e instanceof SimulatedCrash) return true;
  }
  return false;
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, SYNC_MIGRATIONS);
});

beforeEach(wipe);

describe('C1 the pull cursor never skips a committed row', () => {
  it('a device pulling while A is paused at any call still receives both rows', async () => {
    await forEveryCallIndex(async (k) => {
      await wipe();
      let mid: PullPage | undefined;
      const { reached } = await runWithAPausedAt(k, [live(1, 'r1', 'A')], async () => {
        await applyPush(db(), USER, [live(2, 'r2', 'B')]);
        mid = await pullAll(0);
      });
      const after = await pullAll(mid!.cursor);
      const seen = new Set([...mid!.rows, ...after.rows].map((row) => row.rowId));
      expect([...seen].sort(), `A paused before call ${k}`).toEqual(['r1', 'r2']);
      return reached;
    });
  });
});

describe('C2 the stored row is the applied change with the highest seq', () => {
  it('two devices editing one row: the stored row and every puller end on the highest seq', async () => {
    await forEveryCallIndex(async (k) => {
      await wipe();
      let mid: PullPage | undefined;
      let ackB: PushAck | undefined;
      const { reached, acksA } = await runWithAPausedAt(k, [live(1, 'r1', 'A')], async () => {
        [ackB] = await applyPush(db(), USER, [live(2, 'r1', 'B')]);
        mid = await pullAll(0);
      });
      const after = await pullAll(mid!.cursor);
      const stored = await storedRow('r1');

      const applied = [
        { ack: acksA[0]!, make: 'A' },
        { ack: ackB!, make: 'B' },
      ].filter(({ ack }) => ack.status === 'applied');
      const winner = applied.reduce((a, b) => (a.ack.seq! > b.ack.seq! ? a : b));
      const label = `A paused before call ${k}`;
      expect(stored?.seq, label).toBe(winner.ack.seq);
      expect(stored?.payload, label).toEqual({ make: winner.make });

      const lastSeen = [...mid!.rows, ...after.rows].filter((row) => row.rowId === 'r1').at(-1);
      expect(lastSeen, label).toEqual((await pullAll()).rows.find((row) => row.rowId === 'r1'));
      expect(lastSeen, label).toMatchObject(stored!);
      return reached;
    });
  });
});

describe('C3 a delete is never undone by a racing live edit', () => {
  it('a live edit racing a delete leaves the row deleted', async () => {
    const deletedAt = '2026-08-02T00:00:00.000Z';
    await forEveryCallIndex(async (k) => {
      await wipe();
      await applyPush(db(), USER, [live(10, 'r1', 'X')]);
      let ackB: PushAck | undefined;
      const { reached, acksA } = await runWithAPausedAt(k, [live(1, 'r1', 'A')], async () => {
        [ackB] = await applyPush(db(), USER, [tombstone(2, 'r1', deletedAt)]);
      });
      const label = `A paused before call ${k}`;
      const stored = await storedRow('r1');
      expect(stored?.deletedAt, label).toBe(deletedAt);
      expect(stored?.payload, label).toBeNull();
      expect(ackB?.status, label).toBe('applied');

      const ackA = acksA[0]!;
      if (ackA.status === 'applied') {
        expect(ackA.seq!, label).toBeLessThan(ackB!.seq!);
      } else {
        expect(ackA, label).toEqual({
          clientChangeId: cid(1),
          status: 'rejected',
          reason: 'tombstoned',
          arrival: 3,
        });
      }
      return reached;
    });
  });
});

describe('C4 a crash leaves the push either fully applied or not applied', () => {
  for (const kind of ['fail-before', 'fail-after'] as const) {
    it(`${kind}: the state is pre or post, and a retry lands on a clean single push`, async () => {
      const change = live(1, 'r1', 'A');
      await applyPush(db(), USER, [change]);
      const post = await snapshot();

      await forEveryCallIndex(async (k) => {
        await wipe();
        const pre = await snapshot();
        const gate = gateD1(env.DB, { kind, at: k });
        let crashed = false;
        try {
          await applyPush(createDb(gate.d1), USER, [change]);
        } catch (error) {
          if (!isCrash(error)) throw error;
          crashed = true;
        }
        if (!crashed) return false;

        const label = `${kind} at call ${k}`;
        const afterCrash = await snapshot();
        expect([pre, post], label).toContain(afterCrash);

        const [retry] = await applyPush(db(), USER, [change]);
        expect(await snapshot(), label).toBe(post);
        const stored = (await pullAll()).rows[0]!;
        expect(retry, label).toStrictEqual(
          afterCrash === post
            ? {
                clientChangeId: cid(1),
                status: 'duplicate',
                seq: 1,
                arrival: 1,
                current: { ...stored, arrival: 1 },
              }
            : { clientChangeId: cid(1), status: 'applied', seq: 1, arrival: 1 },
        );
        // A replay is a push too: it bumps the arrival clock and nothing else.
        expect(await stateRev(), label).toBe(afterCrash === post ? 2 : 1);
        return true;
      });
    });
  }
});

describe('C5 the SQL merge agrees with mergeChange', () => {
  const seeds = {
    absent: [] as ClientChange[],
    live: [live(100, 'r1', 'X')],
    deleted: [tombstone(100, 'r1', '2026-07-01T00:00:00.000Z')],
  };
  const incoming = {
    live: live(2, 'r1', 'N', '2026-08-03T00:00:00.000Z'),
    deleted: tombstone(2, 'r1', '2026-08-03T00:00:00.000Z'),
  };
  const cases = [
    ['absent', 'live', 'applied'],
    ['absent', 'deleted', 'applied'],
    ['live', 'live', 'applied'],
    ['live', 'deleted', 'applied'],
    ['deleted', 'live', 'rejected'],
    ['deleted', 'deleted', 'applied'],
  ] as const;

  for (const [existingKind, incomingKind, status] of cases) {
    it(`${existingKind} row, ${incomingKind} change: ${status}`, async () => {
      if (seeds[existingKind].length > 0) await applyPush(db(), USER, seeds[existingKind]);
      const existing = await storedRow('r1');
      const change = incoming[incomingKind];
      const expectedSeq = existing ? 2 : 1;
      const outcome = mergeChange(existing, change, expectedSeq);
      expect(outcome.status).toBe(status);

      const [ack] = await applyPush(db(), USER, [change]);
      const stored = await storedRow('r1');
      const arrival = existing ? 2 : 1;
      if (outcome.status === 'applied') {
        expect(ack).toStrictEqual({
          clientChangeId: cid(2),
          status: 'applied',
          seq: expectedSeq,
          arrival,
        });
        expect(stored).toEqual(outcome.row);
      } else {
        expect(ack).toStrictEqual({
          clientChangeId: cid(2),
          status: 'rejected',
          reason: outcome.reason,
          arrival,
        });
        expect(stored).toEqual(existing);
      }
    });
  }
});

describe('C6 one push holds several changes to one row', () => {
  it('acks each change against the state the earlier ones left', async () => {
    const acks = await applyPush(db(), USER, [
      live(1, 'r1', 'v1'),
      live(2, 'r1', 'v2'),
      live(1, 'r1', 'v9'),
      tombstone(3, 'r1', '2026-08-02T00:00:00.000Z'),
      live(4, 'r1', 'v4'),
      tombstone(5, 'r1', '2026-08-03T00:00:00.000Z'),
    ]);
    const final = (await pullAll()).rows[0]!;
    expect(acks).toStrictEqual([
      { clientChangeId: cid(1), status: 'applied', seq: 1, arrival: 1 },
      { clientChangeId: cid(2), status: 'applied', seq: 2, arrival: 1 },
      { clientChangeId: cid(1), status: 'duplicate', seq: 1, arrival: 1, current: final },
      { clientChangeId: cid(3), status: 'applied', seq: 3, arrival: 1 },
      { clientChangeId: cid(4), status: 'rejected', reason: 'tombstoned', arrival: 1 },
      { clientChangeId: cid(5), status: 'applied', seq: 4, arrival: 1 },
    ]);
    const counter = await env.DB.prepare('SELECT last_seq FROM sync_sequence WHERE user_id = ?')
      .bind(USER)
      .first<{ last_seq: number }>();
    expect(counter?.last_seq).toBe(4);

    const replay = await applyPush(db(), USER, [live(4, 'r1', 'v4')]);
    expect(replay).toStrictEqual([
      {
        clientChangeId: cid(4),
        status: 'duplicate',
        reason: 'tombstoned',
        arrival: 1,
        current: final,
      },
    ]);
  });
});

describe('C7 a rejected change consumes no seq', () => {
  it('the next applied change takes the seq right after the tombstone', async () => {
    await applyPush(db(), USER, [
      live(1, 'r1', 'X'),
      tombstone(2, 'r1', '2026-08-02T00:00:00.000Z'),
    ]);
    const [rejected] = await applyPush(db(), USER, [live(3, 'r1', 'Y')]);
    expect(rejected?.status).toBe('rejected');
    const [next] = await applyPush(db(), USER, [live(4, 'r2', 'B')]);
    expect(next).toStrictEqual({ clientChangeId: cid(4), status: 'applied', seq: 3, arrival: 3 });
  });
});

describe('C9 a stale retry never overwrites a newer edit', () => {
  it('replaying an applied change after another device edited the row acks duplicate and changes nothing', async () => {
    await applyPush(db(), USER, [live(1, 'r1', 'A')]);
    await applyPush(db(), USER, [live(2, 'r1', 'B')]);
    const before = await snapshot();

    const [retry] = await applyPush(db(), USER, [live(1, 'r1', 'A')]);
    const stored = (await pullAll()).rows[0]!;
    expect(stored.payload).toEqual({ make: 'B' });
    expect(retry).toStrictEqual({
      clientChangeId: cid(1),
      status: 'duplicate',
      seq: 1,
      arrival: 1,
      current: stored,
    });
    expect(await snapshot()).toBe(before);
  });
});

describe('C8 concurrent HTTP pushes converge (stress, supplementary)', () => {
  const app = new Hono<{ Bindings: Env }>();
  app.route(
    '/sync',
    createSyncRoutes(() => devBearerAuthenticator),
  );

  async function call(path: string, body: unknown): Promise<unknown> {
    const request = new Request(`https://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${USER}` },
      body: JSON.stringify(body),
    });
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    return response.json();
  }

  interface PulledRow {
    rowId: string;
    seq: number;
    payload: unknown;
    deletedAt: string | null;
  }

  class Device {
    cursor = 0;
    rows = new Map<string, PulledRow>();
    async pull() {
      for (;;) {
        const body = (await call('/sync/pull', {
          protocolVersion: 1,
          tables: [{ tableName: 'firearms', cursor: this.cursor }],
        })) as {
          changes: PulledRow[];
          nextCursors: { cursor: number; hasMore: boolean }[];
        };
        for (const row of body.changes) this.rows.set(row.rowId, row);
        this.cursor = body.nextCursors[0]!.cursor;
        if (!body.nextCursors[0]!.hasMore) return;
      }
    }
    async push(change: ClientChange) {
      await call('/sync/push', { protocolVersion: 1, changes: [wholeRow(change)] });
    }
  }

  it('two devices pushing and pulling at once end with the server state', async () => {
    const one = new Device();
    const two = new Device();
    let id = 1000;
    for (let round = 0; round < 10; round++) {
      await Promise.all([
        one.push(live(id++, `r${round % 3}`, `one-${round}`)),
        two.push(live(id++, `r${(round + 1) % 3}`, `two-${round}`)),
        one.pull(),
        two.pull(),
      ]);
    }
    await Promise.all([one.pull(), two.pull()]);

    const fresh = new Device();
    await fresh.pull();
    expect(fresh.rows.size).toBe(3);
    expect(Object.fromEntries(one.rows)).toEqual(Object.fromEntries(fresh.rows));
    expect(Object.fromEntries(two.rows)).toEqual(Object.fromEntries(fresh.rows));
  });
});

describe('ADV1 a full push is one batch', () => {
  it('a 500-change push applies every change at seqs 1..500', async () => {
    const changes = Array.from({ length: 500 }, (_, i) => live(i + 1, `row-${i}`, `m${i}`));
    const gate = gateD1(env.DB, { kind: 'pause', at: -1 });
    const acks = await applyPush(createDb(gate.d1), USER, changes);
    expect(acks.map((ack) => ack.seq)).toEqual(changes.map((_, i) => i + 1));
    expect(acks.every((ack) => ack.status === 'applied')).toBe(true);
    // The four snapshot reads, then the one batch (sync-family-refusal-spec.md §11.8).
    expect(gate.calls()).toBe(5);
  });
});
