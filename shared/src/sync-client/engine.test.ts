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
import type { LocalRowSnapshot, LocalStore, OutboxEntry, SyncTransport } from './ports';

function emptyCursors(): Record<SyncTableName, number> {
  return Object.fromEntries(APPLY_ORDER.map((t) => [t, 0])) as Record<SyncTableName, number>;
}

interface FakeStoreOptions {
  cursors?: Partial<Record<SyncTableName, number>>;
  outbox?: OutboxEntry[];
  rows?: Map<string, LocalRowSnapshot>;
  applyThrows?: boolean;
}

function createFakeStore(options: FakeStoreOptions = {}) {
  const cursors = { ...emptyCursors(), ...options.cursors };
  const outbox = [...(options.outbox ?? [])];
  const rows = options.rows ?? new Map<string, LocalRowSnapshot>();
  const applied: ChangeRow[][] = [];
  const cleared: OutboxEntry[] = [];
  const assigned: { entry: OutboxEntry; id: string }[] = [];

  const store: LocalStore = {
    readCursors: async () => ({ ...cursors }),
    setCursor: async (tableName, cursor) => {
      cursors[tableName] = cursor;
    },
    applyChanges: async (changes) => {
      if (options.applyThrows) throw new Error('apply failed');
      applied.push(changes);
    },
    readOutbox: async (limit) => outbox.slice(0, limit),
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
  };

  return { store, cursors, outbox, applied, cleared, assigned };
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
