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
    expect(result).toEqual({ status: 'ok', pulled: 2, pushed: 0, rejected: 0, duplicates: 0 });
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
    expect(result.status).toBe('partial');
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
    const transport = createTransport({
      push: async (request) => ({ protocolVersion: request.protocolVersion, acks: [] }),
    });

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

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

describe('MAX_PUSH_ITERATIONS', () => {
  it('is a positive cap', () => {
    expect(MAX_PUSH_ITERATIONS).toBeGreaterThan(0);
  });
});
