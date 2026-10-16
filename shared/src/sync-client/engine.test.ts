import { describe, expect, it, vi } from 'vitest';

import {
  PULL_PAGE_SIZE,
  type ChangeRow,
  type PullRequest,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type SyncTableName,
} from '../sync/protocol';
import { MAX_PULL_ITERATIONS, MAX_PUSH_ITERATIONS, runSyncCycle } from './engine';
import { APPLY_ORDER } from './order';
import type { RowRef } from '../sync/family';
import type { LocalRowSnapshot, LocalStore, OutboxEntry, SyncTransport } from './ports';

function emptyCursors(): Record<SyncTableName, number> {
  return Object.fromEntries(APPLY_ORDER.map((t) => [t, 0])) as Record<SyncTableName, number>;
}

interface FakeStoreOptions {
  cursors?: Partial<Record<SyncTableName, number>>;
  outbox?: OutboxEntry[];
  rows?: Map<string, LocalRowSnapshot>;
  applyThrows?: boolean;
  held?: string[];
  refused?: RowRef[];
}

function createFakeStore(options: FakeStoreOptions = {}) {
  const cursors = { ...emptyCursors(), ...options.cursors };
  const outbox = [...(options.outbox ?? [])];
  const rows = options.rows ?? new Map<string, LocalRowSnapshot>();
  const applied: ChangeRow[][] = [];
  const cleared: OutboxEntry[] = [];
  const assigned: { entry: OutboxEntry; id: string }[] = [];
  // Family refusal (sync-family-refusal-spec.md §2.3): held entry keys and
  // the refused set, as the SQLite adapter keeps them.
  const held = new Set<string>(options.held ?? []);
  const refused = new Map<string, RowRef>(
    (options.refused ?? []).map((ref) => [`${ref.tableName}:${ref.rowId}`, ref]),
  );
  const holds: { entry: OutboxEntry; resetClientChangeId: boolean }[] = [];
  let releases = 0;
  const keyOf = (e: { tableName: string; rowId: string }) => `${e.tableName}:${e.rowId}`;

  const store: LocalStore = {
    readCursors: async () => ({ ...cursors }),
    setCursor: async (tableName, cursor) => {
      cursors[tableName] = cursor;
    },
    applyChanges: async (changes) => {
      if (options.applyThrows) throw new Error('apply failed');
      applied.push(changes);
    },
    readOutbox: async (limit) => outbox.filter((e) => !held.has(keyOf(e))).slice(0, limit),
    readRow: async (tableName, rowId) => rows.get(`${tableName}:${rowId}`),
    assignClientChangeId: async (entry, id) => {
      assigned.push({ entry, id });
      const found = outbox.find((e) => e.tableName === entry.tableName && e.rowId === entry.rowId);
      if (found) found.clientChangeId = id;
    },
    clearOutboxEntry: async (entry) => {
      cleared.push(entry);
      const index = outbox.findIndex(
        (e) => e.tableName === entry.tableName && e.rowId === entry.rowId && e.rev === entry.rev,
      );
      if (index >= 0) outbox.splice(index, 1);
    },
    pendingRowKeys: async () => new Set(outbox.map((e) => `${e.tableName}:${e.rowId}`)),
    pendingCount: async () => outbox.length,
    readRefused: async () => [...refused.values()],
    addRefused: async (ref) => {
      refused.set(keyOf(ref), ref);
    },
    removeRefused: async (refs) => {
      for (const ref of refs) refused.delete(keyOf(ref));
    },
    holdOutboxEntry: async (entry, resetClientChangeId) => {
      holds.push({ entry, resetClientChangeId });
      const found = outbox.find((e) => keyOf(e) === keyOf(entry) && e.rev === entry.rev);
      if (!found) return;
      held.add(keyOf(found));
      if (resetClientChangeId) found.clientChangeId = null;
    },
    releaseHeld: async (refs) => {
      releases += 1;
      for (const ref of refs) held.delete(keyOf(ref));
    },
    heldCount: async () => outbox.filter((e) => held.has(keyOf(e))).length,
    readHeld: async () => outbox.filter((e) => held.has(keyOf(e))),
  };

  return {
    store,
    cursors,
    outbox,
    applied,
    cleared,
    assigned,
    held,
    refused,
    holds,
    releases: () => releases,
  };
}

function emptyPull(request: PullRequest): PullResponse {
  return {
    protocolVersion: request.protocolVersion,
    changes: [],
    nextCursors: request.tables.map((t) => ({
      tableName: t.tableName,
      cursor: t.cursor,
      hasMore: false,
    })),
  };
}

function createTransport(over: Partial<SyncTransport> = {}): SyncTransport {
  return {
    pull: async (request) => emptyPull(request),
    push: async (request) => ({
      protocolVersion: request.protocolVersion,
      acks: request.changes.map((c) => ({ clientChangeId: c.clientChangeId, status: 'applied' })),
    }),
    ...over,
  };
}

function ids() {
  let n = 0;
  return () => {
    n += 1;
    return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  };
}

function row(payload: unknown, deletedAt: string | null = null): LocalRowSnapshot {
  return { payload, updatedAt: '2026-09-02T09:00:00.000Z', deletedAt };
}

describe('runSyncCycle — pull', () => {
  it('requests every table on a fresh device and applies what comes back', async () => {
    const fake = createFakeStore();
    let seenRequest: PullRequest | undefined;
    const transport = createTransport({
      pull: async (request) => {
        seenRequest = request;
        return {
          protocolVersion: request.protocolVersion,
          changes: [
            {
              tableName: 'shots',
              rowId: 's1',
              seq: 2,
              payload: {},
              deletedAt: null,
              updatedAt: 'u',
            },
            {
              tableName: 'firearms',
              rowId: 'f1',
              seq: 1,
              payload: {},
              deletedAt: null,
              updatedAt: 'u',
            },
          ],
          nextCursors: request.tables.map((t) => ({
            tableName: t.tableName,
            cursor: 2,
            hasMore: false,
          })),
        };
      },
    });

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(seenRequest?.tables.map((t) => t.tableName)).toEqual([...APPLY_ORDER]);
    expect(seenRequest?.tables.every((t) => t.cursor === 0)).toBe(true);
    // Sorted into dependency order before it reaches the store.
    expect(fake.applied[0]?.map((c) => c.tableName)).toEqual(['firearms', 'shots']);
    expect(fake.cursors.firearms).toBe(2);
    expect(result).toEqual({
      status: 'ok',
      pulled: 2,
      shadowed: 0,
      pushed: 0,
      rejected: 0,
      invalid: 0,
      held: 0,
      duplicates: 0,
    });
  });

  it('re-requests only the tables that still have more pages', async () => {
    const fake = createFakeStore();
    const requests: PullRequest[] = [];
    const transport = createTransport({
      pull: async (request) => {
        requests.push(request);
        const first = requests.length === 1;
        return {
          protocolVersion: request.protocolVersion,
          changes: [],
          nextCursors: request.tables.map((t) => ({
            tableName: t.tableName,
            cursor: first ? PULL_PAGE_SIZE : PULL_PAGE_SIZE * 2,
            hasMore: first && t.tableName === 'sessions',
          })),
        };
      },
    });

    await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(requests).toHaveLength(2);
    expect(requests[1]?.tables).toEqual([{ tableName: 'sessions', cursor: PULL_PAGE_SIZE }]);
    expect(fake.cursors.sessions).toBe(PULL_PAGE_SIZE * 2);
    expect(fake.cursors.shots).toBe(PULL_PAGE_SIZE);
  });

  it('starts from the stored cursors', async () => {
    const fake = createFakeStore({ cursors: { sessions: 42 } });
    let seen: PullRequest | undefined;
    const transport = createTransport({
      pull: async (request) => {
        seen = request;
        return emptyPull(request);
      },
    });

    await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(seen?.tables.find((t) => t.tableName === 'sessions')?.cursor).toBe(42);
  });

  it('leaves the cursor untouched when applying throws, so the page is re-pulled', async () => {
    const fake = createFakeStore({ applyThrows: true });
    const transport = createTransport({
      pull: async (request) => ({
        protocolVersion: request.protocolVersion,
        changes: [],
        nextCursors: request.tables.map((t) => ({
          tableName: t.tableName,
          cursor: 99,
          hasMore: false,
        })),
      }),
    });

    await expect(runSyncCycle({ store: fake.store, transport, newId: ids() })).rejects.toThrow(
      'apply failed',
    );
    expect(fake.cursors.sessions).toBe(0);
  });

  it('gives up as `partial` when the server never stops paging', async () => {
    const fake = createFakeStore();
    let calls = 0;
    const transport = createTransport({
      pull: async (request) => {
        calls += 1;
        return {
          protocolVersion: request.protocolVersion,
          changes: [],
          nextCursors: request.tables.map((t) => ({
            tableName: t.tableName,
            cursor: t.cursor + 1,
            hasMore: true,
          })),
        };
      },
    });

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(calls).toBe(MAX_PULL_ITERATIONS);
    expect(result).toMatchObject({ status: 'partial', pulled: 0, shadowed: 0 });
  });
});

describe('runSyncCycle — push', () => {
  it('sends queued rows and clears them on an applied ack', async () => {
    const rows = new Map([['sessions:row-1', row({ id: 'row-1' })]]);
    const fake = createFakeStore({
      outbox: [{ tableName: 'sessions', rowId: 'row-1', rev: 3, clientChangeId: null }],
      rows,
    });
    let sent: PushRequest | undefined;
    const transport = createTransport({
      push: async (request) => {
        sent = request;
        return {
          protocolVersion: request.protocolVersion,
          acks: request.changes.map((c) => ({
            clientChangeId: c.clientChangeId,
            status: 'applied' as const,
            seq: 1,
          })),
        };
      },
    });

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(sent?.changes).toHaveLength(1);
    expect(sent?.changes[0]?.payload).toEqual({ id: 'row-1' });
    expect(fake.assigned).toHaveLength(1);
    expect(fake.cleared.map((e) => e.rev)).toEqual([3]);
    expect(result.pushed).toBe(1);
  });

  it('replays a previously assigned change id instead of minting a new one', async () => {
    const existing = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const fake = createFakeStore({
      outbox: [{ tableName: 'tags', rowId: 't1', rev: 1, clientChangeId: existing }],
      rows: new Map([['tags:t1', row({ id: 't1' })]]),
    });
    let sent: PushRequest | undefined;
    const transport = createTransport({
      push: async (request) => {
        sent = request;
        return {
          protocolVersion: request.protocolVersion,
          acks: [{ clientChangeId: existing, status: 'duplicate' as const, seq: 4 }],
        };
      },
    });

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(sent?.changes[0]?.clientChangeId).toBe(existing);
    expect(fake.assigned).toHaveLength(0);
    expect(result.duplicates).toBe(1);
  });

  it('does not let a pulled page overwrite a row with an unsent local edit', async () => {
    const fake = createFakeStore({
      outbox: [{ tableName: 'sessions', rowId: 'row-1', rev: 1, clientChangeId: null }],
      rows: new Map([['sessions:row-1', row({ id: 'row-1', name: 'local edit' })]]),
    });
    const transport = createTransport({
      pull: async (request) => ({
        protocolVersion: request.protocolVersion,
        changes: [
          {
            tableName: 'sessions',
            rowId: 'row-1',
            seq: 5,
            payload: { id: 'row-1', name: 'stale server copy' },
            deletedAt: null,
            updatedAt: 'u',
          },
        ],
        nextCursors: request.tables.map((t) => ({
          tableName: t.tableName,
          cursor: 5,
          hasMore: false,
        })),
      }),
    });

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(result.shadowed).toBe(1);
    expect(result.pulled).toBe(0);
    expect(fake.applied[0]).toEqual([]);
    // The cursor still advances: the local edit is what the server ends up
    // holding, so nothing is lost by not re-pulling the stale row.
    expect(fake.cursors.sessions).toBe(5);
  });

  it('counts and clears a rejected (tombstoned) ack', async () => {
    const fake = createFakeStore({
      outbox: [{ tableName: 'series', rowId: 'x', rev: 1, clientChangeId: null }],
      rows: new Map([['series:x', row({ id: 'x' })]]),
    });
    const transport = createTransport({
      push: async (request) => ({
        protocolVersion: request.protocolVersion,
        acks: request.changes.map((c) => ({
          clientChangeId: c.clientChangeId,
          status: 'rejected' as const,
          reason: 'tombstoned',
        })),
      }),
    });

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(result.rejected).toBe(1);
    expect(fake.outbox).toHaveLength(0);
    // The tombstone the pull shadowed is written locally here, because the
    // cursor has already moved past it.
    expect(fake.applied.at(-1)).toEqual([
      {
        tableName: 'series',
        rowId: 'x',
        seq: 1,
        payload: null,
        deletedAt: '2026-09-02T09:00:00.000Z',
        updatedAt: '2026-09-02T09:00:00.000Z',
      },
    ]);
  });

  it('does not synthesise a tombstone for a rejection it does not understand', async () => {
    const fake = createFakeStore({
      outbox: [{ tableName: 'series', rowId: 'y', rev: 1, clientChangeId: null }],
      rows: new Map([['series:y', row({ id: 'y' })]]),
    });
    const transport = createTransport({
      push: async (request) => ({
        protocolVersion: request.protocolVersion,
        acks: request.changes.map((c) => ({
          clientChangeId: c.clientChangeId,
          status: 'rejected' as const,
          reason: 'something-new',
        })),
      }),
    });

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(result.rejected).toBe(1);
    expect(fake.applied).toEqual([[]]);
    expect(fake.outbox).toHaveLength(0);
  });

  // docs/specs/sync-payload-validation-spec.md §2.3, P7.
  it.each([
    ['a refusal', 'rejected' as const],
    ['a replayed refusal', 'duplicate' as const],
  ])(
    'counts %s for an invalid payload as invalid, not rejected or duplicate',
    async (_label, status) => {
      const fake = createFakeStore({
        outbox: [{ tableName: 'series', rowId: 'z', rev: 1, clientChangeId: null }],
        rows: new Map([['series:z', row({ id: 'z' })]]),
      });
      const transport = createTransport({
        push: async (request) => ({
          protocolVersion: request.protocolVersion,
          acks: request.changes.map((c) => ({
            clientChangeId: c.clientChangeId,
            status,
            reason: 'invalid_payload',
          })),
        }),
      });

      const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

      expect(result).toMatchObject({ invalid: 1, rejected: 0, duplicates: 0, pushed: 0 });
      // The entry clears like any ack; the row stays local and nothing is written.
      expect(fake.outbox).toHaveLength(0);
      expect(fake.applied).toEqual([[]]);
    },
  );

  it('counts every invalid_payload refusal in a push, alongside an applied change', async () => {
    const fake = createFakeStore({
      outbox: [
        { tableName: 'series', rowId: 'a', rev: 1, clientChangeId: null },
        { tableName: 'series', rowId: 'b', rev: 2, clientChangeId: null },
        { tableName: 'series', rowId: 'c', rev: 3, clientChangeId: null },
      ],
      rows: new Map([
        ['series:a', row({ id: 'a' })],
        ['series:b', row({ id: 'b' })],
        ['series:c', row({ id: 'c' })],
      ]),
    });
    const transport = createTransport({
      push: async (request) => ({
        protocolVersion: request.protocolVersion,
        acks: request.changes.map((c) =>
          c.rowId === 'b'
            ? { clientChangeId: c.clientChangeId, status: 'applied' as const, seq: 1 }
            : {
                clientChangeId: c.clientChangeId,
                status: 'rejected' as const,
                reason: 'invalid_payload',
              },
        ),
      }),
    });

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(result).toMatchObject({ invalid: 2, pushed: 1, rejected: 0 });
    expect(fake.outbox).toHaveLength(0);
  });

  // Round-2 verification: a refusal is cleared as its ack arrives, so it is
  // reported then, not only in the result a later failing batch never returns.
  it('reports each refusal as it clears, even when a later batch fails the cycle', async () => {
    const fake = createFakeStore({
      outbox: [
        { tableName: 'series', rowId: 'a', rev: 1, clientChangeId: null },
        { tableName: 'series', rowId: 'b', rev: 2, clientChangeId: null },
      ],
      rows: new Map([
        ['series:a', row({ id: 'a' })],
        ['series:b', row({ id: 'b' })],
      ]),
    });
    let calls = 0;
    const transport = createTransport({
      push: async (request) => {
        calls += 1;
        if (calls > 1) throw new Error('network');
        return {
          protocolVersion: request.protocolVersion,
          acks: request.changes.map((c) => ({
            clientChangeId: c.clientChangeId,
            status: 'rejected' as const,
            reason: 'invalid_payload',
          })),
        };
      },
    });
    const refused: string[] = [];

    await expect(
      runSyncCycle({
        store: fake.store,
        transport,
        newId: ids(),
        pushBatchMax: 1,
        onRefused: () => refused.push(`after ${fake.outbox.length} left`),
      }),
    ).rejects.toThrow('network');

    // Reported once, after its entry was cleared; b is still queued.
    expect(refused).toEqual(['after 1 left']);
    expect(fake.outbox.map((e) => e.rowId)).toEqual(['b']);
  });

  it('reports a replayed refusal and not an applied or rejected change', async () => {
    const fake = createFakeStore({
      outbox: [
        { tableName: 'series', rowId: 'a', rev: 1, clientChangeId: null },
        { tableName: 'series', rowId: 'b', rev: 2, clientChangeId: null },
        { tableName: 'series', rowId: 'c', rev: 3, clientChangeId: null },
      ],
      rows: new Map([
        ['series:a', row({ id: 'a' })],
        ['series:b', row({ id: 'b' })],
        ['series:c', row({ id: 'c' })],
      ]),
    });
    const transport = createTransport({
      push: async (request) => ({
        protocolVersion: request.protocolVersion,
        acks: request.changes.map((c) =>
          c.rowId === 'a'
            ? { clientChangeId: c.clientChangeId, status: 'applied' as const, seq: 1 }
            : c.rowId === 'b'
              ? { clientChangeId: c.clientChangeId, status: 'rejected' as const, reason: 'other' }
              : {
                  clientChangeId: c.clientChangeId,
                  status: 'duplicate' as const,
                  reason: 'invalid_payload',
                },
        ),
      }),
    });
    let refused = 0;

    const result = await runSyncCycle({
      store: fake.store,
      transport,
      newId: ids(),
      onRefused: () => {
        refused += 1;
      },
    });

    expect(refused).toBe(1);
    expect(result).toMatchObject({ invalid: 1, pushed: 1, rejected: 1 });
  });

  it('sends a null payload for a tombstoned row', async () => {
    const fake = createFakeStore({
      outbox: [{ tableName: 'shots', rowId: 'del', rev: 1, clientChangeId: null }],
      rows: new Map([['shots:del', row({ id: 'del' }, '2026-09-02T08:00:00.000Z')]]),
    });
    let sent: PushRequest | undefined;
    const transport = createTransport({
      push: async (request) => {
        sent = request;
        return {
          protocolVersion: request.protocolVersion,
          acks: request.changes.map((c) => ({
            clientChangeId: c.clientChangeId,
            status: 'applied' as const,
          })),
        };
      },
    });

    await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(sent?.changes[0]?.payload).toBeNull();
    expect(sent?.changes[0]?.deletedAt).toBe('2026-09-02T08:00:00.000Z');
  });

  it('drops a queued entry whose row is gone, without sending it', async () => {
    const fake = createFakeStore({
      outbox: [{ tableName: 'tags', rowId: 'ghost', rev: 5, clientChangeId: null }],
    });
    const push = vi.fn();
    const transport = createTransport({ push });

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(push).not.toHaveBeenCalled();
    expect(fake.cleared.map((e) => e.rowId)).toEqual(['ghost']);
    expect(result.status).toBe('ok');
  });

  it('pages the outbox at the batch cap', async () => {
    const rows = new Map<string, LocalRowSnapshot>();
    const outbox: OutboxEntry[] = [];
    for (let i = 0; i < 5; i += 1) {
      outbox.push({ tableName: 'tags', rowId: `t${i}`, rev: i + 1, clientChangeId: null });
      rows.set(`tags:t${i}`, row({ id: `t${i}` }));
    }
    const fake = createFakeStore({ outbox, rows });
    const batches: number[] = [];
    const transport = createTransport({
      push: async (request) => {
        batches.push(request.changes.length);
        return {
          protocolVersion: request.protocolVersion,
          acks: request.changes.map((c) => ({
            clientChangeId: c.clientChangeId,
            status: 'applied' as const,
          })),
        };
      },
    });

    const result = await runSyncCycle({
      store: fake.store,
      transport,
      newId: ids(),
      pushBatchMax: 2,
    });

    expect(batches).toEqual([2, 2, 1]);
    expect(result.pushed).toBe(5);
    expect(fake.outbox).toHaveLength(0);
  });

  it('clears nothing when the push transport fails', async () => {
    const fake = createFakeStore({
      outbox: [{ tableName: 'tags', rowId: 't1', rev: 1, clientChangeId: null }],
      rows: new Map([['tags:t1', row({ id: 't1' })]]),
    });
    const transport = createTransport({
      push: async () => {
        throw new Error('offline');
      },
    });

    await expect(runSyncCycle({ store: fake.store, transport, newId: ids() })).rejects.toThrow(
      'offline',
    );
    expect(fake.cleared).toHaveLength(0);
    expect(fake.outbox).toHaveLength(1);
    // The id was persisted first, so the retry replays it and the server
    // acks `duplicate` instead of applying the change twice.
    expect(fake.outbox[0]?.clientChangeId).not.toBeNull();
  });

  it('ignores an ack for a change id it did not send', async () => {
    const fake = createFakeStore({
      outbox: [{ tableName: 'tags', rowId: 't1', rev: 1, clientChangeId: null }],
      rows: new Map([['tags:t1', row({ id: 't1' })]]),
    });
    const transport = createTransport({
      push: async (request): Promise<PushResponse> => ({
        protocolVersion: request.protocolVersion,
        acks: [{ clientChangeId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', status: 'applied' }],
      }),
    });

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(result.pushed).toBe(0);
    expect(fake.cleared).toHaveLength(0);
  });

  it('gives up as `partial` when the outbox never drains', async () => {
    const fake = createFakeStore({
      outbox: [{ tableName: 'tags', rowId: 't1', rev: 1, clientChangeId: null }],
      rows: new Map([['tags:t1', row({ id: 't1' })]]),
    });
    // Acks nothing, so clearOutboxEntry is never called and the entry stays.
    let calls = 0;
    const transport = createTransport({
      push: async (request) => {
        calls += 1;
        return { protocolVersion: request.protocolVersion, acks: [] };
      },
    });

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    // Retried up to the cap, then stopped: more than once, never forever.
    expect(calls).toBeGreaterThan(1);
    expect(calls).toBe(MAX_PUSH_ITERATIONS);
    expect(result.status).toBe('partial');
    expect(fake.outbox).toHaveLength(1);
  });

  it('skips a push page that turned out to be entirely ghost rows', async () => {
    const fake = createFakeStore({
      outbox: [
        { tableName: 'tags', rowId: 'ghost1', rev: 1, clientChangeId: null },
        { tableName: 'tags', rowId: 'ghost2', rev: 2, clientChangeId: null },
      ],
    });
    const push = vi.fn();
    const result = await runSyncCycle({
      store: fake.store,
      transport: createTransport({ push }),
      newId: ids(),
      pushBatchMax: 1,
    });

    expect(push).not.toHaveBeenCalled();
    expect(result.status).toBe('ok');
    expect(fake.outbox).toHaveLength(0);
  });
});

// docs/specs/sync-family-refusal-spec.md §2.3. The same scenarios run end to
// end against the real Worker in backend/test/sync-client.spec.ts (H1–H10).
describe('runSyncCycle — family refusal', () => {
  const entry = (tableName: SyncTableName, rowId: string, rev: number): OutboxEntry => ({
    tableName,
    rowId,
    rev,
    clientChangeId: null,
  });
  const ref = (tableName: SyncTableName, rowId: string): RowRef => ({ tableName, rowId });

  /** s1 with series r1 holding shot t1; firearm f1 with license l1 and group g1. */
  function localRows(): Map<string, LocalRowSnapshot> {
    return new Map([
      ['sessions:s1', row({ id: 's1', firearm_id: 'f1' })],
      ['series:r1', row({ id: 'r1', session_id: 's1' })],
      ['shots:t1', row({ id: 't1', series_id: 'r1' })],
      ['shots:t2', row({ id: 't2', series_id: 'r1' })],
      ['sessions:s2', row({ id: 's2' })],
      ['series:r2', row({ id: 'r2', session_id: 's2' })],
      ['firearms:f1', row({ id: 'f1' })],
      ['licenses:l1', row({ id: 'l1', firearm_id: 'f1' })],
      ['firearm_groups:g1', row({ id: 'g1', firearm_id: 'f1' })],
      ['tags:tag1', row({ id: 'tag1' })],
    ]);
  }

  function recordingTransport(reason: (change: { rowId: string }) => string | undefined) {
    const pushes: PushRequest[] = [];
    const transport = createTransport({
      push: async (request) => {
        pushes.push(request);
        return {
          protocolVersion: request.protocolVersion,
          acks: request.changes.map((c) => {
            const why = reason(c);
            return why === undefined
              ? { clientChangeId: c.clientChangeId, status: 'applied' as const, seq: 1 }
              : { clientChangeId: c.clientChangeId, status: 'rejected' as const, reason: why };
          }),
        };
      },
    });
    const sent = () => pushes.flatMap((p) => p.changes.map((c) => `${c.tableName}:${c.rowId}`));
    return { transport, pushes, sent };
  }

  it('remembers an invalid_payload refusal as refused (step 3)', async () => {
    const fake = createFakeStore({ outbox: [entry('sessions', 's1', 1)], rows: localRows() });
    const { transport } = recordingTransport(() => 'invalid_payload');

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(result).toMatchObject({ invalid: 1, held: 0, rejected: 0 });
    expect([...fake.refused.values()]).toEqual([ref('sessions', 's1')]);
    expect(fake.outbox).toHaveLength(0);
  });

  it('remembers a replayed invalid_payload refusal too', async () => {
    const fake = createFakeStore({ outbox: [entry('shots', 't1', 1)], rows: localRows() });
    const transport = createTransport({
      push: async (request) => ({
        protocolVersion: request.protocolVersion,
        acks: request.changes.map((c) => ({
          clientChangeId: c.clientChangeId,
          status: 'duplicate' as const,
          reason: 'invalid_payload',
        })),
      }),
    });
    await runSyncCycle({ store: fake.store, transport, newId: ids() });
    expect([...fake.refused.keys()]).toEqual(['shots:t1']);
  });

  it.each([['rejected' as const], ['duplicate' as const]])(
    'holds a family_refused (%s) entry with its id reset, never clearing it (step 4, H3)',
    async (status) => {
      const fake = createFakeStore({ outbox: [entry('series', 'r1', 1)], rows: localRows() });
      const transport = createTransport({
        push: async (request) => ({
          protocolVersion: request.protocolVersion,
          acks: request.changes.map((c) => ({
            clientChangeId: c.clientChangeId,
            status,
            reason: 'family_refused',
          })),
        }),
      });

      const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

      expect(result).toMatchObject({
        status: 'ok',
        held: 1,
        rejected: 0,
        invalid: 0,
        duplicates: 0,
        pushed: 0,
      });
      expect(fake.cleared).toEqual([]);
      expect(fake.outbox).toEqual([entry('series', 'r1', 1)]);
      expect([...fake.held]).toEqual(['series:r1']);
      expect(fake.holds[0]).toMatchObject({ resetClientChangeId: true });
      expect(fake.holds[0]?.entry.clientChangeId).not.toBeNull();
      expect(fake.refused.size).toBe(0);
    },
  );

  it('leaves an entry rewritten mid-push unheld after a family_refused ack (rev-matched)', async () => {
    const fake = createFakeStore({ outbox: [entry('series', 'r1', 1)], rows: localRows() });
    const pushes: PushRequest[] = [];
    const transport = createTransport({
      push: async (request) => {
        pushes.push(request);
        // The first push: a local write lands while it is in flight, so the
        // trigger bumps rev and resets the id.
        if (pushes.length === 1) fake.outbox[0] = entry('series', 'r1', 2);
        return {
          protocolVersion: request.protocolVersion,
          acks: request.changes.map((c) =>
            pushes.length === 1
              ? {
                  clientChangeId: c.clientChangeId,
                  status: 'rejected' as const,
                  reason: 'family_refused',
                }
              : { clientChangeId: c.clientChangeId, status: 'applied' as const, seq: 1 },
          ),
        };
      },
    });

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    // The hold named rev 1 and missed; rev 2 went out as a new change.
    expect(fake.holds.map((h) => h.entry.rev)).toEqual([1]);
    expect(pushes).toHaveLength(2);
    expect(pushes[1]?.changes[0]?.clientChangeId).not.toBe(pushes[0]?.changes[0]?.clientChangeId);
    expect(fake.outbox).toHaveLength(0);
    expect(result).toMatchObject({ held: 1, pushed: 1 });
  });

  it('holds every live row of a refused session’s family and sends the rest (step 2, H1)', async () => {
    const fake = createFakeStore({
      outbox: [
        entry('series', 'r1', 1),
        entry('shots', 't1', 2),
        entry('series', 'r2', 3),
        entry('tags', 'tag1', 4),
      ],
      rows: localRows(),
      refused: [ref('sessions', 's1')],
    });
    const { transport, sent } = recordingTransport(() => undefined);

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(sent()).toEqual(['series:r2', 'tags:tag1']);
    expect([...fake.held].sort()).toEqual(['series:r1', 'shots:t1']);
    expect(fake.holds.every((h) => !h.resetClientChangeId)).toBe(true);
    expect(result).toMatchObject({ status: 'ok', held: 2, pushed: 2 });
  });

  it('a refused shot holds its siblings, its series and its session (H4)', async () => {
    const fake = createFakeStore({
      outbox: [entry('shots', 't2', 1), entry('sessions', 's1', 2), entry('series', 'r1', 3)],
      rows: localRows(),
      refused: [ref('shots', 't1')],
    });
    const { transport, sent } = recordingTransport(() => undefined);
    await runSyncCycle({ store: fake.store, transport, newId: ids() });
    expect(sent()).toEqual([]);
    expect(fake.held.size).toBe(3);
  });

  it('never holds a tombstone (H10)', async () => {
    const rows = localRows();
    rows.set('shots:t1', row({ id: 't1', series_id: 'r1' }, '2026-10-14T12:00:00.000Z'));
    const fake = createFakeStore({
      outbox: [entry('shots', 't1', 1)],
      rows,
      refused: [ref('sessions', 's1')],
    });
    const { transport, sent } = recordingTransport(() => undefined);
    await runSyncCycle({ store: fake.store, transport, newId: ids() });
    expect(sent()).toEqual(['shots:t1']);
    expect(fake.held.size).toBe(0);
  });

  it('a refused firearm holds its rows, not the sessions shot with it (H5)', async () => {
    const fake = createFakeStore({
      outbox: [entry('licenses', 'l1', 1), entry('sessions', 's1', 2)],
      rows: localRows(),
      refused: [ref('firearms', 'f1')],
    });
    const { transport, sent } = recordingTransport(() => undefined);
    await runSyncCycle({ store: fake.store, transport, newId: ids() });
    expect(sent()).toEqual(['sessions:s1']);
    expect([...fake.held]).toEqual(['licenses:l1']);
  });

  it('a refused license holds only itself: the firearm and its group are sent (H6)', async () => {
    const fake = createFakeStore({
      outbox: [entry('firearms', 'f1', 1), entry('firearm_groups', 'g1', 2)],
      rows: localRows(),
      refused: [ref('licenses', 'l1')],
    });
    const { transport, sent } = recordingTransport(() => undefined);
    await runSyncCycle({ store: fake.store, transport, newId: ids() });
    expect(sent()).toEqual(['firearms:f1', 'firearm_groups:g1']);
  });

  it('only a refused firearm blocks a firearm’s rows, not another row with its id', async () => {
    const fake = createFakeStore({
      outbox: [entry('licenses', 'l1', 1)],
      rows: localRows(),
      refused: [ref('sessions', 'f1')],
    });
    const { transport, sent } = recordingTransport(() => undefined);
    await runSyncCycle({ store: fake.store, transport, newId: ids() });
    expect(sent()).toEqual(['licenses:l1']);
  });

  it('a refused row of a firearm costs no walk for a session entry', async () => {
    const fake = createFakeStore({
      outbox: [entry('shots', 't1', 1)],
      rows: localRows(),
      refused: [ref('licenses', 'l1')],
    });
    const reads: string[] = [];
    const { store } = fake;
    const inner = { ...store };
    store.readRow = async (tableName, rowId) => {
      reads.push(`${tableName}:${rowId}`);
      return inner.readRow(tableName, rowId);
    };
    const { transport, sent } = recordingTransport(() => undefined);
    await runSyncCycle({ store, transport, newId: ids() });
    expect(reads).toEqual(['shots:t1']);
    expect(sent()).toEqual(['shots:t1']);
  });

  it('holds a refused firearm’s own entry written after step 1', async () => {
    const fake = createFakeStore({ outbox: [entry('tags', 'tag1', 1)], rows: localRows() });
    let calls = 0;
    const transport = createTransport({
      push: async (request) => {
        calls += 1;
        if (calls === 1) {
          // Refused earlier in the cycle, and written again before the next read.
          fake.refused.set('firearms:f1', ref('firearms', 'f1'));
          fake.outbox.push(entry('firearms', 'f1', 2));
        }
        return {
          protocolVersion: request.protocolVersion,
          acks: request.changes.map((c) => ({
            clientChangeId: c.clientChangeId,
            status: 'applied' as const,
            seq: 1,
          })),
        };
      },
    });
    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });
    expect(calls).toBe(1);
    expect([...fake.held]).toEqual(['firearms:f1']);
    expect(result).toMatchObject({ pushed: 1, held: 1 });
  });

  it('a firearm row with no firearm id is not held by a refused firearm', async () => {
    const rows = localRows();
    rows.set('licenses:l9', row({ id: 'l9', firearm_id: null }));
    const fake = createFakeStore({
      outbox: [entry('licenses', 'l9', 1)],
      rows,
      refused: [ref('firearms', 'f1')],
    });
    const { transport, sent } = recordingTransport(() => undefined);
    await runSyncCycle({ store: fake.store, transport, newId: ids() });
    expect(sent()).toEqual(['licenses:l9']);
  });

  it('holds a refused row written mid-cycle, then releases it with its family next cycle', async () => {
    // The refused session itself is queued again but reaches step 2 before
    // step 1 sees it: it is held, and released at the next cycle's step 1.
    const fake = createFakeStore({ outbox: [entry('series', 'r1', 1)], rows: localRows() });
    let calls = 0;
    const { transport: inner } = recordingTransport(() => undefined);
    const transport = createTransport({
      push: async (request) => {
        calls += 1;
        if (calls === 1) {
          fake.refused.set('sessions:s1', ref('sessions', 's1'));
          fake.outbox.push(entry('sessions', 's1', 2));
          return {
            protocolVersion: request.protocolVersion,
            acks: request.changes.map((c) => ({
              clientChangeId: c.clientChangeId,
              status: 'rejected' as const,
              reason: 'family_refused',
            })),
          };
        }
        return inner.push(request);
      },
    });
    const first = await runSyncCycle({ store: fake.store, transport, newId: ids() });
    expect(first.held).toBe(2);
    expect(fake.held.size).toBe(2);

    const second = await runSyncCycle({ store: fake.store, transport, newId: ids() });
    expect(second).toMatchObject({ pushed: 2, held: 0 });
    expect(fake.refused.size).toBe(0);
    expect(fake.outbox).toHaveLength(0);
  });

  it('releases the family when the refused row is queued again (step 1, H2)', async () => {
    const fake = createFakeStore({
      outbox: [entry('series', 'r1', 1), entry('shots', 't1', 2), entry('sessions', 's1', 3)],
      rows: localRows(),
      refused: [ref('sessions', 's1'), ref('licenses', 'l1')],
      held: ['series:r1', 'shots:t1'],
    });
    const { transport, sent, pushes } = recordingTransport(() => undefined);

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(pushes).toHaveLength(1);
    expect(sent()).toEqual(['series:r1', 'shots:t1', 'sessions:s1']);
    expect([...fake.refused.keys()]).toEqual(['licenses:l1']);
    expect(fake.releases()).toBe(1);
    expect(result).toMatchObject({ pushed: 3, held: 0 });
  });

  it('releases the family when a pull replaces the refused row (H8)', async () => {
    const fake = createFakeStore({
      outbox: [entry('shots', 't2', 1)],
      rows: localRows(),
      refused: [ref('shots', 't1')],
      held: ['shots:t2'],
    });
    const { transport: pushing, sent } = recordingTransport(() => undefined);
    const transport = createTransport({
      push: (request) => pushing.push(request),
      pull: async (request) => ({
        ...emptyPull(request),
        changes: [
          {
            tableName: 'shots',
            rowId: 't1',
            seq: 5,
            payload: { id: 't1', series_id: 'r1' },
            deletedAt: null,
            updatedAt: 'u',
          },
        ],
      }),
    });

    await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(fake.refused.size).toBe(0);
    expect(fake.releases()).toBe(1);
    expect(sent()).toEqual(['shots:t2']);
  });

  /** A pull that delivers `changes` once, then nothing. */
  function pullingOnce(changes: ChangeRow[]) {
    let delivered = false;
    return async (request: PullRequest): Promise<PullResponse> => {
      const response = { ...emptyPull(request), changes: delivered ? [] : changes };
      delivered = true;
      return response;
    };
  }
  const pulledSession = (deletedAt: string | null = null): ChangeRow => ({
    tableName: 'sessions',
    rowId: 's1',
    seq: 7,
    payload: deletedAt === null ? { id: 's1', name: 'B-name' } : null,
    deletedAt,
    updatedAt: '2026-10-14T12:00:00.000Z',
  });

  it('a pulled change for a held row is applied and drops its entry (Revision 2 item 8)', async () => {
    const fake = createFakeStore({
      outbox: [entry('sessions', 's1', 1)],
      rows: localRows(),
      held: ['sessions:s1'],
      refused: [ref('shots', 't1')],
    });
    const { transport: pushing, sent } = recordingTransport(() => undefined);
    const transport = createTransport({
      push: (request) => pushing.push(request),
      pull: pullingOnce([pulledSession()]),
    });

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(fake.applied.flat().map((c) => `${c.tableName}:${c.rowId}`)).toEqual(['sessions:s1']);
    expect(fake.cleared).toEqual([entry('sessions', 's1', 1)]);
    expect(fake.outbox).toEqual([]);
    expect(sent()).toEqual([]);
    expect(result).toMatchObject({ pulled: 1, shadowed: 0 });
  });

  it('this device’s own older push, pulled back, does not drop the held edit after it (Revision 2 item 9)', async () => {
    const rows = localRows();
    rows.set('sessions:s1', {
      payload: { id: 's1', name: 'A2' },
      updatedAt: '2026-10-14T12:00:00.000Z',
      deletedAt: null,
    });
    const fake = createFakeStore({
      outbox: [entry('sessions', 's1', 1)],
      rows,
      held: ['sessions:s1'],
      refused: [ref('shots', 't1')],
    });
    const echo: ChangeRow = {
      ...pulledSession(),
      payload: { id: 's1', name: 'A1' },
      updatedAt: '2026-10-14T11:00:00.000Z',
    };
    const transport = createTransport({ pull: pullingOnce([echo]) });

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(fake.applied.flat()).toEqual([]);
    expect(fake.cleared).toEqual([]);
    expect(fake.outbox).toEqual([entry('sessions', 's1', 1)]);
    expect([...fake.held]).toEqual(['sessions:s1']);
    expect(result).toMatchObject({ pulled: 0, shadowed: 1 });
  });

  it('a pulled tombstone of a held row is applied and drops its entry', async () => {
    const fake = createFakeStore({
      outbox: [entry('sessions', 's1', 1)],
      rows: localRows(),
      held: ['sessions:s1'],
      refused: [ref('shots', 't1')],
    });
    const transport = createTransport({
      pull: pullingOnce([pulledSession('2026-10-14T12:00:00.000Z')]),
    });

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(fake.applied.flat()).toEqual([pulledSession('2026-10-14T12:00:00.000Z')]);
    expect(fake.outbox).toEqual([]);
    expect(result).toMatchObject({ pulled: 1, shadowed: 0 });
  });

  it('an unheld queued edit still shadows a pull of its row, held rows beside it or not', async () => {
    const fake = createFakeStore({
      outbox: [entry('sessions', 's1', 1), entry('series', 'r1', 2)],
      rows: localRows(),
      held: ['series:r1'],
    });
    const { transport: pushing, sent } = recordingTransport(() => undefined);
    const transport = createTransport({
      push: (request) => pushing.push(request),
      pull: pullingOnce([pulledSession()]),
    });

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(fake.applied.flat()).toEqual([]);
    expect(result).toMatchObject({ pulled: 0, shadowed: 1 });
    expect(sent()).toEqual(['sessions:s1', 'series:r1']);
  });

  it('a held entry rewritten after it was read shadows the pull (rev-matched drop)', async () => {
    const fake = createFakeStore({
      outbox: [entry('sessions', 's1', 1)],
      rows: localRows(),
      held: ['sessions:s1'],
      refused: [ref('shots', 't1')],
    });
    const { store } = fake;
    const inner = { ...store };
    store.readHeld = async () => {
      const heldNow = await inner.readHeld();
      // A local write lands after the read: the trigger bumps rev.
      fake.outbox[0] = entry('sessions', 's1', 2);
      return heldNow;
    };
    const transport = createTransport({ pull: pullingOnce([pulledSession()]) });

    const result = await runSyncCycle({ store, transport, newId: ids() });

    expect(fake.applied.flat()).toEqual([]);
    expect(fake.outbox).toEqual([entry('sessions', 's1', 2)]);
    expect(result).toMatchObject({ pulled: 0, shadowed: 1 });
  });

  it('a pull of an unrelated row releases nothing', async () => {
    const fake = createFakeStore({
      rows: localRows(),
      refused: [ref('shots', 't1')],
      held: ['shots:t2'],
    });
    const transport = createTransport({
      pull: async (request) => ({
        ...emptyPull(request),
        changes: [
          {
            tableName: 'shots',
            rowId: 't9',
            seq: 5,
            payload: {},
            deletedAt: null,
            updatedAt: 'u',
          },
        ],
      }),
    });
    await runSyncCycle({ store: fake.store, transport, newId: ids() });
    expect(fake.refused.size).toBe(1);
    expect(fake.releases()).toBe(0);
  });

  it('held entries never stall the outbox (H9)', async () => {
    // 600 held shots of a refused session (each judged again at step 1 and
    // held again), then 10 tags.
    const outbox: OutboxEntry[] = [];
    const held: string[] = [];
    const rows = localRows();
    for (let i = 0; i < 600; i += 1) {
      outbox.push(entry('shots', `h${i}`, i + 1));
      rows.set(`shots:h${i}`, row({ id: `h${i}`, series_id: 'r1' }));
      held.push(`shots:h${i}`);
    }
    for (let i = 0; i < 10; i += 1) {
      outbox.push(entry('tags', `g${i}`, 601 + i));
      rows.set(`tags:g${i}`, row({ id: `g${i}` }));
    }
    const fake = createFakeStore({ outbox, rows, held, refused: [ref('sessions', 's1')] });
    const { transport, pushes } = recordingTransport(() => undefined);

    const result = await runSyncCycle({
      store: fake.store,
      transport,
      newId: ids(),
      pushBatchMax: 500,
    });

    expect(pushes).toHaveLength(1);
    expect(pushes[0]?.changes).toHaveLength(10);
    expect(result).toMatchObject({ status: 'ok', pushed: 10 });
    expect(await fake.store.heldCount()).toBe(600);
  });

  it('releases a held entry whose family no refused row blocks any more (Revision 2 item 7)', async () => {
    // A family_refused ack whose blocker was acked `tombstoned`, so it never
    // entered the refused set: nothing would ever release it.
    const fake = createFakeStore({
      outbox: [entry('series', 'r1', 1), entry('shots', 't1', 2)],
      rows: localRows(),
      held: ['series:r1', 'shots:t1'],
    });
    const { transport, sent } = recordingTransport(() => undefined);

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(sent()).toEqual(['series:r1', 'shots:t1']);
    expect(result).toMatchObject({ pushed: 2, held: 0 });
    expect(await fake.store.heldCount()).toBe(0);
  });

  it('judges a held entry again each cycle: still blocked, it stays held and unsent', async () => {
    const fake = createFakeStore({
      outbox: [entry('series', 'r1', 1), entry('tags', 'tag1', 2)],
      rows: localRows(),
      held: ['series:r1'],
      refused: [ref('shots', 't1')],
    });
    const { transport, sent } = recordingTransport(() => undefined);

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(sent()).toEqual(['tags:tag1']);
    expect([...fake.held]).toEqual(['series:r1']);
    expect(result).toMatchObject({ pushed: 1, held: 1 });
  });

  it('a refused row whose session is deleted here blocks nothing (Revision 2 item 7)', async () => {
    const rows = localRows();
    rows.set('sessions:s1', row({ id: 's1' }, '2026-10-14T12:00:00.000Z'));
    const fake = createFakeStore({
      outbox: [entry('shots', 't2', 1)],
      rows,
      held: ['shots:t2'],
      refused: [ref('shots', 't1')],
    });
    const { transport, sent } = recordingTransport(() => undefined);

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(sent()).toEqual(['shots:t2']);
    expect(result).toMatchObject({ pushed: 1, held: 0 });
  });

  it('a refused session deleted here blocks nothing either', async () => {
    const rows = localRows();
    rows.set('sessions:s1', row({ id: 's1' }, '2026-10-14T12:00:00.000Z'));
    const fake = createFakeStore({
      outbox: [entry('series', 'r1', 1)],
      rows,
      refused: [ref('sessions', 's1')],
    });
    const { transport, sent } = recordingTransport(() => undefined);
    await runSyncCycle({ store: fake.store, transport, newId: ids() });
    expect(sent()).toEqual(['series:r1']);
  });

  it('a push that fails before a held entry is read leaves it held (Revision 2 item 10)', async () => {
    const fake = createFakeStore({
      outbox: [entry('tags', 'tag1', 1), entry('sessions', 's1', 2), entry('series', 'r2', 3)],
      rows: localRows(),
      held: ['sessions:s1', 'series:r2'],
      refused: [ref('shots', 't1')],
    });
    const transport = createTransport({
      push: async () => {
        throw new Error('network');
      },
    });

    await expect(
      runSyncCycle({ store: fake.store, transport, newId: ids(), pushBatchMax: 1 }),
    ).rejects.toThrow('network');

    // s1 is still blocked by t1, so it stays held; r2 (another session) was
    // released at step 1, unsent.
    expect([...fake.held]).toEqual(['sessions:s1']);
  });

  it('a failure while judging the held entries releases none of them', async () => {
    const fake = createFakeStore({
      outbox: [entry('series', 'r2', 1), entry('sessions', 's1', 2)],
      rows: localRows(),
      held: ['series:r2', 'sessions:s1'],
      refused: [ref('shots', 't1')],
    });
    const { store } = fake;
    const inner = { ...store };
    // The refused set's walk reads s1 twice (its root, then whether it is
    // deleted); the third read is step 1 judging s1, after r2 was judged free.
    const reads: string[] = [];
    store.readRow = async (tableName, rowId) => {
      reads.push(`${tableName}:${rowId}`);
      if (reads.filter((r) => r === 'sessions:s1').length === 3) throw new Error('disk');
      return inner.readRow(tableName, rowId);
    };

    await expect(
      runSyncCycle({ store, transport: createTransport(), newId: ids() }),
    ).rejects.toThrow('disk');

    expect(reads.slice(-3)).toEqual(['series:r2', 'sessions:s2', 'sessions:s1']);
    expect([...fake.held].sort()).toEqual(['series:r2', 'sessions:s1']);
    expect(fake.releases()).toBe(0);
  });

  it('counts the entries still held after step 1 as held this cycle', async () => {
    const fake = createFakeStore({
      outbox: [entry('series', 'r1', 1), entry('series', 'r2', 2)],
      rows: localRows(),
      held: ['series:r1', 'series:r2'],
      refused: [ref('shots', 't1')],
    });
    const { transport, sent } = recordingTransport(() => undefined);
    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });
    expect(sent()).toEqual(['series:r2']);
    expect(result).toMatchObject({ held: 1, pushed: 1 });
  });

  it('with nothing refused, reads no extra rows and releases nothing (N4)', async () => {
    const fake = createFakeStore({ outbox: [entry('shots', 't1', 1)], rows: localRows() });
    const reads: string[] = [];
    const { store } = fake;
    const inner = { ...store };
    store.readRow = async (tableName, rowId) => {
      reads.push(`${tableName}:${rowId}`);
      return inner.readRow(tableName, rowId);
    };
    const { transport, sent } = recordingTransport(() => undefined);

    await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(reads).toEqual(['shots:t1']);
    expect(sent()).toEqual(['shots:t1']);
    expect(fake.releases()).toBe(0);
  });

  it('an orphan whose parent is missing locally forms its own family (§9)', async () => {
    const rows = localRows();
    rows.set('shots:o1', row({ id: 'o1', series_id: 'missing' }));
    rows.set('shots:o2', row({ id: 'o2', series_id: 'missing' }));
    const fake = createFakeStore({
      outbox: [entry('shots', 'o2', 1), entry('shots', 't1', 2)],
      rows,
      refused: [ref('shots', 'o1')],
    });
    const { transport, sent } = recordingTransport(() => undefined);
    await runSyncCycle({ store: fake.store, transport, newId: ids() });
    expect(sent()).toEqual(['shots:o2', 'shots:t1']);
  });

  it('a refused row that is gone locally blocks only its own id', async () => {
    const fake = createFakeStore({
      outbox: [entry('sessions', 's1', 1)],
      rows: localRows(),
      refused: [ref('series', 'vanished')],
    });
    const { transport, sent } = recordingTransport(() => undefined);
    await runSyncCycle({ store: fake.store, transport, newId: ids() });
    expect(sent()).toEqual(['sessions:s1']);
  });
});
