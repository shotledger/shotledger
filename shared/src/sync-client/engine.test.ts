import { describe, expect, it, vi } from 'vitest';

import {
  PULL_PAGE_SIZE,
  type ChangeRow,
  type PullRequest,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type RefusalEntry,
  type SyncTableName,
} from '../sync/protocol';
import { MAX_PULL_ITERATIONS, MAX_PUSH_ITERATIONS, runSyncCycle } from './engine';
import { APPLY_ORDER } from './order';
import type {
  AckOutcome,
  LocalRowSnapshot,
  LocalStore,
  OutboxEntry,
  RefusalMark,
  SyncTransport,
} from './ports';
import { applyMarkUpdate, rowKey, shadowPull } from './shadow';

function emptyCursors(): Record<SyncTableName, number> {
  return Object.fromEntries(APPLY_ORDER.map((t) => [t, 0])) as Record<SyncTableName, number>;
}

interface FakeStoreOptions {
  cursors?: Partial<Record<SyncTableName, number>>;
  outbox?: OutboxEntry[];
  rows?: Map<string, LocalRowSnapshot>;
  applyThrows?: boolean;
  marks?: RefusalMark[];
}

function createFakeStore(options: FakeStoreOptions = {}) {
  const cursors = { ...emptyCursors(), ...options.cursors };
  const outbox = [...(options.outbox ?? [])];
  const rows = options.rows ?? new Map<string, LocalRowSnapshot>();
  const applied: ChangeRow[][] = [];
  const cleared: OutboxEntry[] = [];
  const assigned: { entry: OutboxEntry; id: string }[] = [];
  const marks = new Map((options.marks ?? []).map((m) => [rowKey(m.tableName, m.rowId), m]));
  const outcomes: { entry: OutboxEntry; outcome: AckOutcome | undefined }[] = [];
  const replaceMarks = (next: readonly RefusalMark[]) => {
    marks.clear();
    for (const m of next) marks.set(rowKey(m.tableName, m.rowId), m);
  };

  const store: LocalStore = {
    readCursors: async () => ({ ...cursors }),
    setCursor: async (tableName, cursor) => {
      cursors[tableName] = cursor;
    },
    applyChanges: async (changes, next) => {
      if (options.applyThrows) throw new Error('apply failed');
      applied.push(changes);
      if (next !== undefined) replaceMarks(next);
    },
    readOutbox: async (limit) => outbox.slice(0, limit),
    readRow: async (tableName, rowId) => rows.get(`${tableName}:${rowId}`),
    assignClientChangeId: async (entry, id) => {
      assigned.push({ entry, id });
      const found = outbox.find((e) => e.tableName === entry.tableName && e.rowId === entry.rowId);
      if (found) found.clientChangeId = id;
    },
    // The adapter's contract (app/src/db/queries/sync-store.ts), kept small.
    clearOutboxEntry: async (entry, outcome) => {
      cleared.push(entry);
      outcomes.push({ entry, outcome });
      const index = outbox.findIndex(
        (e) => e.tableName === entry.tableName && e.rowId === entry.rowId && e.rev === entry.rev,
      );
      if (index >= 0) outbox.splice(index, 1);
      if (outcome === undefined) return;
      replaceMarks(applyMarkUpdate([...marks.values()], outcome.mark));
      if (outcome.current !== undefined) {
        const pending = new Set(outbox.map((e) => rowKey(e.tableName, e.rowId)));
        const out = shadowPull([outcome.current], pending, [...marks.values()]);
        applied.push(out.applicable);
        replaceMarks(out.marks);
      }
    },
    pendingRowKeys: async () => new Set(outbox.map((e) => `${e.tableName}:${e.rowId}`)),
    pendingCount: async () => outbox.length,
    readMarks: async () => [...marks.values()],
    markCounts: async () => {
      const all = [...marks.values()];
      return {
        invalid: all.filter((m) => m.kind === 'invalid').length,
        waiting: all.filter((m) => m.kind === 'waiting').length,
      };
    },
  };

  return { store, cursors, outbox, applied, cleared, assigned, marks, outcomes };
}

function emptyPull(request: PullRequest): PullResponse {
  return {
    protocolVersion: request.protocolVersion,
    changes: [],
    refusals: [],
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
      acks: request.changes.map((c) => ({
        clientChangeId: c.clientChangeId,
        status: 'applied',
        arrival: 1,
      })),
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
          refusals: [],
          changes: [
            {
              tableName: 'shots',
              rowId: 's1',
              seq: 2,
              payload: {},
              deletedAt: null,
              updatedAt: 'u',
              arrival: 1,
            },
            {
              tableName: 'firearms',
              rowId: 'f1',
              seq: 1,
              payload: {},
              deletedAt: null,
              updatedAt: 'u',
              arrival: 1,
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
          refusals: [],
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
        refusals: [],
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
          refusals: [],
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
            arrival: 1,
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
          acks: [{ clientChangeId: existing, status: 'duplicate' as const, seq: 4, arrival: 1 }],
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
        refusals: [],
        changes: [
          {
            tableName: 'sessions',
            rowId: 'row-1',
            seq: 5,
            payload: { id: 'row-1', name: 'stale server copy' },
            deletedAt: null,
            updatedAt: 'u',
            arrival: 1,
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
          arrival: 1,
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
        arrival: 1,
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
          arrival: 1,
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
            arrival: 1,
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
            ? { clientChangeId: c.clientChangeId, status: 'applied' as const, seq: 1, arrival: 1 }
            : {
                clientChangeId: c.clientChangeId,
                status: 'rejected' as const,
                arrival: 1,
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
  // recorded then, not only in the result a later failing batch never returns.
  // Revision 3 (docs/specs/sync-family-refusal-spec.md §11.6) records it as a
  // durable invalid mark, written with the clear, instead of an app-session
  // event.
  it('records each refusal as it clears, even when a later batch fails the cycle', async () => {
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
            arrival: 4,
          })),
        };
      },
    });

    await expect(
      runSyncCycle({ store: fake.store, transport, newId: ids(), pushBatchMax: 1 }),
    ).rejects.toThrow('network');

    // Recorded once, with its entry's clear; b is still queued.
    expect([...fake.marks.values()]).toEqual([
      { tableName: 'series', rowId: 'a', kind: 'invalid', arrival: 4, blocker: null },
    ]);
    expect(fake.outbox.map((e) => e.rowId)).toEqual(['b']);
  });

  it('records a replayed refusal and not an applied or rejected change', async () => {
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
            ? { clientChangeId: c.clientChangeId, status: 'applied' as const, seq: 1, arrival: 1 }
            : c.rowId === 'b'
              ? {
                  clientChangeId: c.clientChangeId,
                  status: 'rejected' as const,
                  reason: 'other',
                  arrival: 1,
                }
              : {
                  clientChangeId: c.clientChangeId,
                  status: 'duplicate' as const,
                  reason: 'invalid_payload',
                  arrival: 2,
                  current: null,
                },
        ),
      }),
    });

    const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

    expect(await fake.store.markCounts()).toEqual({ invalid: 1, waiting: 0 });
    expect(fake.marks.get('series:c')?.kind).toBe('invalid');
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
            arrival: 1,
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
            arrival: 1,
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
        acks: [
          { clientChangeId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', status: 'applied', arrival: 1 },
        ],
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

// docs/specs/sync-family-refusal-spec.md §11.6: the server keeps refused
// families; the phone keeps marks so a pull does not overwrite a version the
// server is holding, and every ack clears its entry.
describe('runSyncCycle — refusal marks (Revision 3)', () => {
  const blocker = { tableName: 'shots' as const, rowId: 't2' };
  const waiting = (rowId: string, arrival: number, tableName: SyncTableName = 'sessions') => ({
    tableName,
    rowId,
    kind: 'waiting' as const,
    arrival,
    blocker,
  });
  const invalid = (rowId: string, arrival: number, tableName: SyncTableName = 'shots') => ({
    tableName,
    rowId,
    kind: 'invalid' as const,
    arrival,
    blocker: null,
  });
  const pulled = (rowId: string, arrival: number, name = 'server'): ChangeRow => ({
    tableName: 'sessions',
    rowId,
    seq: arrival,
    payload: { id: rowId, name },
    deletedAt: null,
    updatedAt: 'u',
    arrival,
  });
  const pullOf =
    (changes: ChangeRow[], refusals: PullResponse['refusals'] = []) =>
    async (request: PullRequest): Promise<PullResponse> => ({
      ...emptyPull(request),
      changes,
      refusals,
    });
  /** The pull's listing of a waiting session row; every pull lists the records (§11.7). */
  const listed = (rowId: string, arrival: number): RefusalEntry => ({
    tableName: 'sessions',
    rowId,
    reason: 'family_refused',
    arrival,
    blocker,
  });
  const one = (rowId: string, tableName: SyncTableName = 'sessions', rev = 1): OutboxEntry => ({
    tableName,
    rowId,
    rev,
    clientChangeId: null,
  });
  const ackAll =
    (
      ack: (
        c: PushRequest['changes'][number],
      ) => Omit<PushResponse['acks'][number], 'clientChangeId'>,
    ) =>
    async (request: PushRequest): Promise<PushResponse> => ({
      protocolVersion: request.protocolVersion,
      acks: request.changes.map((c) => ({ clientChangeId: c.clientChangeId, ...ack(c) })),
    });

  describe('pull', () => {
    it('FRESH a pull’s refusals rebuild every mark, in the transaction that applies its page', async () => {
      const fake = createFakeStore();
      const transport = createTransport({
        pull: pullOf(
          [],
          [
            {
              tableName: 'shots',
              rowId: 't2',
              reason: 'invalid_payload',
              arrival: 3,
              blocker: null,
            },
            { tableName: 'series', rowId: 'r1', reason: 'family_refused', arrival: 4, blocker },
          ],
        ),
      });

      await runSyncCycle({ store: fake.store, transport, newId: ids() });

      expect(await fake.store.markCounts()).toEqual({ invalid: 1, waiting: 1 });
      expect(fake.marks.get('series:r1')).toEqual(waiting('r1', 4, 'series'));
    });

    it('STUCK a mark whose record is gone is dropped by the next pull, with nothing pulled for its row', async () => {
      const fake = createFakeStore({ marks: [invalid('t2', 3)] });
      const transport = createTransport({ pull: pullOf([], []) });

      await runSyncCycle({ store: fake.store, transport, newId: ids() });

      expect(await fake.store.markCounts()).toEqual({ invalid: 0, waiting: 0 });
    });

    it('ECHO a live change older than the mark is shadowed and the mark kept', async () => {
      const fake = createFakeStore({ marks: [waiting('s1', 6)] });
      const transport = createTransport({
        pull: pullOf([pulled('s1', 5, 'A1')], [listed('s1', 6)]),
      });

      const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

      expect(result).toMatchObject({ pulled: 0, shadowed: 1 });
      expect(fake.applied[0]).toEqual([]);
      expect([...fake.marks.values()]).toEqual([waiting('s1', 6)]);
    });

    it('H2’ the release, at the mark’s arrival, is applied and drops the mark', async () => {
      const fake = createFakeStore({ marks: [waiting('s1', 6)] });
      const transport = createTransport({
        pull: pullOf([pulled('s1', 6, 'A2')], [listed('s1', 6)]),
      });

      const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

      expect(result).toMatchObject({ pulled: 1, shadowed: 0 });
      expect(fake.applied[0]).toEqual([pulled('s1', 6, 'A2')]);
      expect(fake.marks.size).toBe(0);
    });

    it('AB another device’s later version is applied over the mark', async () => {
      const fake = createFakeStore({ marks: [waiting('s1', 10)] });
      const transport = createTransport({
        pull: pullOf([pulled('s1', 12, 'B-name')], [listed('s1', 10)]),
      });

      await runSyncCycle({ store: fake.store, transport, newId: ids() });

      expect(fake.applied[0]).toEqual([pulled('s1', 12, 'B-name')]);
      expect(fake.marks.size).toBe(0);
    });

    it('VC a pulled tombstone is applied over a mark of any arrival', async () => {
      const fake = createFakeStore({ marks: [waiting('s1', 10)] });
      const tombstone = { ...pulled('s1', 3), payload: null, deletedAt: 'd' };
      const transport = createTransport({ pull: pullOf([tombstone], [listed('s1', 10)]) });

      await runSyncCycle({ store: fake.store, transport, newId: ids() });

      expect(fake.applied[0]).toEqual([tombstone]);
      expect(fake.marks.size).toBe(0);
    });

    it('the shadowing rules run against the page’s refusals, not the marks they replace', async () => {
      // An older mark would let the echo through; the list says the server
      // now holds arrival 9.
      const fake = createFakeStore({ marks: [waiting('s1', 2)] });
      const transport = createTransport({
        pull: pullOf(
          [pulled('s1', 5)],
          [{ tableName: 'sessions', rowId: 's1', reason: 'family_refused', arrival: 9, blocker }],
        ),
      });

      const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

      expect(result.shadowed).toBe(1);
      expect([...fake.marks.values()]).toEqual([waiting('s1', 9)]);
    });

    it('a queued entry still shadows a pulled change at any arrival', async () => {
      const fake = createFakeStore({
        outbox: [one('s1')],
        rows: new Map([['sessions:s1', row({ id: 's1' })]]),
        marks: [waiting('s1', 3)],
      });
      const transport = createTransport({ pull: pullOf([pulled('s1', 7)], [listed('s1', 3)]) });

      const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

      expect(result.shadowed).toBe(1);
      expect(fake.applied[0]).toEqual([]);
    });
  });

  describe('acks', () => {
    it('H1’ a family_refused ack clears the entry and writes a waiting mark with its blocker', async () => {
      const fake = createFakeStore({
        outbox: [one('r1', 'series')],
        rows: new Map([['series:r1', row({ id: 'r1' })]]),
      });
      const transport = createTransport({
        push: ackAll(() => ({ status: 'rejected', reason: 'family_refused', arrival: 5, blocker })),
      });

      const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

      expect(fake.outbox).toHaveLength(0);
      expect([...fake.marks.values()]).toEqual([waiting('r1', 5, 'series')]);
      expect(result).toMatchObject({ rejected: 1, invalid: 0 });
    });

    it('REV3 an invalid_payload ack of an entry rewritten mid-push keeps the entry and still marks it', async () => {
      const fake = createFakeStore({
        outbox: [one('t2', 'shots')],
        rows: new Map([['shots:t2', row({ id: 't2' })]]),
      });
      const transport = createTransport({
        push: async (request) => {
          // The user edits T2 again while the push is in flight.
          fake.outbox[0] = { ...fake.outbox[0]!, rev: 2, clientChangeId: null };
          return ackAll(() => ({ status: 'rejected', reason: 'invalid_payload', arrival: 8 }))(
            request,
          );
        },
      });

      await runSyncCycle({ store: fake.store, transport, newId: ids(), pushBatchMax: 1 });

      expect(fake.outcomes[0]?.outcome).toEqual({ mark: { set: invalid('t2', 8) } });
      expect(fake.marks.get('shots:t2')).toEqual(invalid('t2', 8));
    });

    it('an applied ack drops the row’s mark up to its arrival', async () => {
      const fake = createFakeStore({
        outbox: [one('s1')],
        rows: new Map([['sessions:s1', row({ id: 's1' })]]),
        marks: [waiting('s1', 4)],
      });
      const transport = createTransport({
        push: ackAll(() => ({ status: 'applied', seq: 9, arrival: 6 })),
      });

      await runSyncCycle({ store: fake.store, transport, newId: ids() });

      expect(fake.outcomes[0]?.outcome).toEqual({
        mark: { drop: { tableName: 'sessions', rowId: 's1' }, upTo: 6 },
      });
      expect(fake.marks.size).toBe(0);
    });

    it('a tombstoned rejection drops the mark too', async () => {
      const fake = createFakeStore({
        outbox: [one('s1')],
        rows: new Map([['sessions:s1', row({ id: 's1' })]]),
        marks: [waiting('s1', 4)],
      });
      const transport = createTransport({
        push: ackAll(() => ({ status: 'rejected', reason: 'tombstoned', arrival: 6 })),
      });

      await runSyncCycle({ store: fake.store, transport, newId: ids() });

      expect(fake.marks.size).toBe(0);
    });

    it('a refusal with no blocker still writes a mark', async () => {
      const fake = createFakeStore({
        outbox: [one('r1', 'series')],
        rows: new Map([['series:r1', row({ id: 'r1' })]]),
      });
      const transport = createTransport({
        push: ackAll(() => ({ status: 'rejected', reason: 'family_refused', arrival: 1 })),
      });

      await runSyncCycle({ store: fake.store, transport, newId: ids() });

      expect(fake.outcomes[0]?.outcome).toEqual({
        mark: { set: { ...waiting('r1', 1, 'series'), blocker: null } },
      });
    });

    it('H9’ refused entries leave the outbox: 600 queued, 590 refused, the cycle drains', async () => {
      const outbox: OutboxEntry[] = [];
      const rows = new Map<string, LocalRowSnapshot>();
      for (let i = 0; i < 600; i += 1) {
        outbox.push(one(`t${i}`, 'shots', i + 1));
        rows.set(`shots:t${i}`, row({ id: `t${i}` }));
      }
      const fake = createFakeStore({ outbox, rows });
      const transport = createTransport({
        push: ackAll((c) =>
          Number(c.rowId.slice(1)) < 10
            ? { status: 'applied', seq: 1, arrival: 1 }
            : { status: 'rejected', reason: 'family_refused', arrival: 1, blocker },
        ),
      });

      const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

      expect(result.status).toBe('ok');
      expect(fake.outbox).toHaveLength(0);
      expect(await fake.store.markCounts()).toEqual({ invalid: 0, waiting: 590 });
    });
  });

  describe('a duplicate ack’s current row', () => {
    const replay = (rowId: string) => ({
      tableName: 'sessions' as const,
      rowId,
      rev: 1,
      clientChangeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });

    it('DUP a replay of an applied change applies the row as stored now', async () => {
      const fake = createFakeStore({
        outbox: [replay('s1')],
        rows: new Map([['sessions:s1', row({ id: 's1', name: 'E' })]]),
      });
      const current = pulled('s1', 9, 'B');
      const transport = createTransport({
        push: ackAll(() => ({ status: 'duplicate', seq: 4, arrival: 5, current })),
      });

      const result = await runSyncCycle({ store: fake.store, transport, newId: ids() });

      expect(fake.outcomes[0]?.outcome).toEqual({
        mark: { drop: { tableName: 'sessions', rowId: 's1' }, upTo: 5 },
        current,
      });
      expect(fake.applied.at(-1)).toEqual([current]);
      expect(result.duplicates).toBe(1);
    });

    it('REV2 a replayed family_refused applies a later stored version and drops the mark', async () => {
      const fake = createFakeStore({
        outbox: [replay('s1')],
        rows: new Map([['sessions:s1', row({ id: 's1', name: 'A' })]]),
      });
      const current = pulled('s1', 12, 'B');
      const transport = createTransport({
        push: ackAll(() => ({
          status: 'duplicate',
          reason: 'family_refused',
          arrival: 10,
          blocker,
          current,
        })),
      });

      await runSyncCycle({ store: fake.store, transport, newId: ids() });

      expect(fake.applied.at(-1)).toEqual([current]);
      expect(fake.marks.size).toBe(0);
    });

    it('a stored version older than the waiting one is shadowed, and the mark stays', async () => {
      const fake = createFakeStore({
        outbox: [replay('s1')],
        rows: new Map([['sessions:s1', row({ id: 's1', name: 'A' })]]),
      });
      const transport = createTransport({
        push: ackAll(() => ({
          status: 'duplicate',
          reason: 'family_refused',
          arrival: 10,
          blocker,
          current: pulled('s1', 3, 'old'),
        })),
      });

      await runSyncCycle({ store: fake.store, transport, newId: ids() });

      expect(fake.applied.at(-1)).toEqual([]);
      expect([...fake.marks.values()]).toEqual([waiting('s1', 10)]);
    });

    it('a null current (the row is not stored) passes nothing to apply', async () => {
      const fake = createFakeStore({
        outbox: [replay('s1')],
        rows: new Map([['sessions:s1', row({ id: 's1' })]]),
      });
      const transport = createTransport({
        push: ackAll(() => ({
          status: 'duplicate',
          reason: 'invalid_payload',
          arrival: 2,
          current: null,
        })),
      });

      await runSyncCycle({ store: fake.store, transport, newId: ids() });

      expect(fake.outcomes[0]?.outcome).toEqual({ mark: { set: invalid('s1', 2, 'sessions') } });
    });

    it('only a duplicate passes current on', async () => {
      const fake = createFakeStore({
        outbox: [one('s1')],
        rows: new Map([['sessions:s1', row({ id: 's1' })]]),
      });
      const transport = createTransport({
        push: ackAll(() => ({ status: 'applied', seq: 1, arrival: 2, current: pulled('s1', 2) })),
      });

      await runSyncCycle({ store: fake.store, transport, newId: ids() });

      expect(fake.outcomes[0]?.outcome).not.toHaveProperty('current');
    });
  });
});
