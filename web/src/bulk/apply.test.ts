import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ClientChange } from '@shotledger/shared/src/sync';
import type {
  BulkContext,
  BulkResult,
  FirearmMove,
} from '@shotledger/shared/src/sync-client/bulk-edit';
import type { PushOutcome } from '@shotledger/shared/src/sync-client/direct-push';
import { describe, expect, it, vi } from 'vitest';

import {
  accountChanged,
  afterEdit,
  apply,
  applyBlocked,
  IDLE,
  submitRequest,
  type ApplyDeps,
  type ApplyState,
  type Built,
} from './apply';

const change = (n: number, tableName: ClientChange['tableName'], rowId: string): ClientChange => ({
  clientChangeId: `00000000-0000-4000-8000-00000000000${n}`,
  tableName,
  rowId,
  payload: { id: rowId },
  deletedAt: null,
  updatedAt: '2026-10-07T10:00:00.000Z',
});
const CHANGES: ClientChange[] = [change(1, 'sessions', 's1')];
const MOVE: ClientChange[] = [
  change(2, 'firearms', 'f1'),
  change(3, 'firearms', 'f2'),
  change(4, 'sessions', 's1'),
  change(5, 'sessions', 's2'),
];
const SUMMARY = { changed: 1, unchanged: 2, missing: 1 };
// s1 and s2 move from f1 and f3 onto f2.
const MOVED_FIREARMS: FirearmMove = { target: 'f2', sources: { s1: 'f1', s2: 'f3' } };
const empty = () => new Map<string, Record<string, unknown>>();
const CONTEXT: BulkContext = {
  sessions: empty(),
  tags: empty(),
  sessionTags: empty(),
  firearms: empty(),
  series: empty(),
  shots: empty(),
  faltStations: empty(),
};

const ok = (
  overrides: {
    changes?: ClientChange[];
    firearms?: FirearmMove;
    tagId?: string;
    summary?: typeof SUMMARY;
  } = {},
): BulkResult => ({
  ok: true,
  changes: CHANGES,
  summary: SUMMARY,
  firearms: null,
  tagId: null,
  ...overrides,
});

function deps(outcomes: PushOutcome | PushOutcome[], overrides: Partial<ApplyDeps> = {}) {
  const queue = Array.isArray(outcomes) ? [...outcomes] : [outcomes];
  return {
    loadContext: vi.fn(() => Promise.resolve(CONTEXT)),
    currentUserId: vi.fn(() => Promise.resolve<string | null>('u1')),
    build: vi.fn(() => ok()),
    push: vi.fn(() => Promise.resolve(queue.length > 1 ? queue.shift()! : queue[0]!)),
    tagLive: vi.fn(() => Promise.resolve(true)),
    refresh: vi.fn(() => Promise.resolve(true)),
    ...overrides,
  } satisfies ApplyDeps;
}

const applied = (overrides: object = {}) => ({
  kind: 'applied',
  summary: SUMMARY,
  refused: 0,
  firearmsToCheck: [],
  tagGone: false,
  refreshed: true,
  ...overrides,
});

const s2Refused: PushOutcome = {
  kind: 'partlyRejected',
  rejected: [{ tableName: 'sessions', rowId: 's2', reason: 'tombstoned' }],
};
// Two sessions move; the refused one is taken off the changed count (R11).
const MOVED = { changed: 2, unchanged: 0, missing: 0 };
const moving = (firearms: FirearmMove = MOVED_FIREARMS) => ({
  build: vi.fn(() => ok({ changes: MOVE, firearms, summary: MOVED })),
});

describe('applying a bulk edit', () => {
  it('U5 offline blocks Apply and names the reason; so does applying', () => {
    expect(applyBlocked(false, IDLE)).toBe('offline');
    expect(applyBlocked(true, IDLE)).toBeNull();
    expect(applyBlocked(true, { status: { kind: 'applying' }, held: null })).toBe('applying');
    expect(applyBlocked(false, { status: { kind: 'applying' }, held: null })).toBe('offline');
    const holding: ApplyState = {
      status: { kind: 'failed', error: 'network' },
      held: { changes: MOVE, summary: SUMMARY, firearms: null, tagId: null, userId: 'u1' },
    };
    // A held request does not block: the one action resends it (R12).
    expect(applyBlocked(true, holding)).toBeNull();
    expect(submitRequest(holding)).toBe(holding.held);
    expect(submitRequest(IDLE)).toBeNull();
  });

  it('U6 a network failure holds the request; Retry resends the identical request', async () => {
    const failing = deps({ kind: 'failed', error: 'network' });
    const failed = await apply(failing, null);
    expect(failed).toEqual({
      status: { kind: 'failed', error: 'network' },
      held: { changes: CHANGES, summary: SUMMARY, firearms: null, tagId: null, userId: 'u1' },
    });
    expect(failing.refresh).not.toHaveBeenCalled();
    expect(failing.build).toHaveBeenCalledWith(CONTEXT);

    const retrying = deps({ kind: 'saved' });
    const retried = await apply(retrying, failed.held);
    expect(retrying.push).toHaveBeenCalledTimes(1);
    expect(vi.mocked(retrying.push).mock.calls[0]![0]).toBe(CHANGES);
    // A retry sends what was held; it neither pulls nor builds again.
    expect(retrying.loadContext).not.toHaveBeenCalled();
    expect(retrying.build).not.toHaveBeenCalled();
    expect(retried).toEqual({ status: applied(), held: null });
  });

  it('U6 a signed-out failure holds the request too; the others do not', async () => {
    const signedOut = await apply(deps({ kind: 'failed', error: 'unauthenticated' }), null);
    expect(signedOut.held?.changes).toBe(CHANGES);
    for (const error of ['versionUnsupported', 'payloadTooLarge', 'unknown'] as const) {
      expect(await apply(deps({ kind: 'failed', error }), null)).toEqual({
        status: { kind: 'failed', error },
        held: null,
      });
    }
  });

  it('U6 a builder error sends nothing; a failed fresh pull sends nothing and holds nothing', async () => {
    const invalid = deps(
      { kind: 'saved' },
      { build: vi.fn((): BulkResult => ({ ok: false, errors: [{ kind: 'nothingToChange' }] })) },
    );
    expect(await apply(invalid, null)).toEqual({
      status: { kind: 'invalid', errors: [{ kind: 'nothingToChange' }] },
      held: null,
    });
    expect(invalid.push).not.toHaveBeenCalled();

    const unreachable = deps(
      { kind: 'saved' },
      { loadContext: vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) },
    );
    expect(await apply(unreachable, null)).toEqual({
      status: { kind: 'failed', error: 'network' },
      held: null,
    });
    expect(unreachable.build).not.toHaveBeenCalled();
    expect(unreachable.push).not.toHaveBeenCalled();
  });

  it('R7 a builder that throws ends in an error, not in "applying", and sends nothing', async () => {
    const throwing = deps(
      { kind: 'saved' },
      {
        build: vi.fn((): BulkResult => {
          throw new RangeError('overrideShotCount must be a non-negative integer, got -1');
        }),
      },
    );
    expect(await apply(throwing, null)).toEqual({
      status: { kind: 'failed', error: 'unknown' },
      held: null,
    });
    expect(throwing.push).not.toHaveBeenCalled();
  });

  it('U7 an answered push refreshes; refused changes are counted; a failed refresh says reload', async () => {
    const three = { changed: 3, unchanged: 0, missing: 0 };
    const partly = deps(
      {
        kind: 'partlyRejected',
        rejected: [
          { tableName: 'sessions', rowId: 's1', reason: 'tombstoned' },
          { tableName: 'session_tags', rowId: 'l2', reason: 'tombstoned' },
          { tableName: 'tags', rowId: 't9', reason: 'tombstoned' },
        ],
      },
      { build: vi.fn(() => ok({ summary: three })) },
    );
    // A location or tag edit: no firearm to name. A refused session row and a
    // refused new link each stand for one unchanged session (R17); the tag row
    // does not.
    expect((await apply(partly, null)).status).toEqual(
      applied({ refused: 3, summary: { ...three, changed: 1 } }),
    );
    expect(partly.refresh).toHaveBeenCalledTimes(1);
    expect(partly.push).toHaveBeenCalledTimes(1);

    const stale = deps({ kind: 'saved' }, { refresh: vi.fn(() => Promise.resolve(false)) });
    expect((await apply(stale, null)).status).toEqual(applied({ refreshed: false }));
  });

  it('U8 an edit drops a held request, but not while applying', () => {
    const built: Built = {
      changes: MOVE,
      summary: SUMMARY,
      firearms: MOVED_FIREARMS,
      tagId: null,
      userId: 'u1',
    };
    // A held firearm change too: a fresh Apply pulls again before it builds (R26).
    expect(afterEdit({ status: { kind: 'failed', error: 'network' }, held: built })).toBe(IDLE);
    const applying = { status: { kind: 'applying' as const }, held: null };
    expect(afterEdit(applying)).toBe(applying);
    expect(afterEdit(IDLE)).toBe(IDLE);
  });
});

describe('a refused moved session (R25)', () => {
  it("R25 one push, no correction: the target and the refused sessions' sources are named to check", async () => {
    const d = deps(s2Refused, moving());
    expect(await apply(d, null)).toEqual({
      status: applied({
        refused: 1,
        firearmsToCheck: ['f2', 'f3'],
        summary: { ...MOVED, changed: 1 },
      }),
      held: null,
    });
    expect(d.push).toHaveBeenCalledTimes(1);
    expect(d.refresh).toHaveBeenCalledTimes(1);
  });

  it('R25 None as the target, or a source that was not live: only the known firearms are named', async () => {
    const toNone = deps(s2Refused, moving({ target: null, sources: { s1: 'f1', s2: 'f3' } }));
    expect((await apply(toNone, null)).status).toMatchObject({ firearmsToCheck: ['f3'] });
    const unknownSource = deps(s2Refused, moving({ target: 'f2', sources: { s1: 'f1' } }));
    expect((await apply(unknownSource, null)).status).toMatchObject({ firearmsToCheck: ['f2'] });
    const both = deps(
      {
        kind: 'partlyRejected',
        rejected: [
          { tableName: 'sessions', rowId: 's1', reason: 'tombstoned' },
          { tableName: 'sessions', rowId: 's2', reason: 'tombstoned' },
        ],
      },
      moving({ target: 'f2', sources: { s1: 'f1', s2: 'f1' } }),
    );
    // Each firearm once, the target first.
    expect((await apply(both, null)).status).toMatchObject({ firearmsToCheck: ['f2', 'f1'] });
  });

  it('R25 nothing to check without a refused session, or without a firearm change', async () => {
    const firearmOnly = deps(
      {
        kind: 'partlyRejected',
        rejected: [{ tableName: 'firearms', rowId: 'f2', reason: 'tombstoned' }],
      },
      moving(),
    );
    expect((await apply(firearmOnly, null)).status).toEqual(
      applied({ refused: 1, summary: MOVED }),
    );
    const landed = deps({ kind: 'saved' }, moving());
    expect((await apply(landed, null)).status).toEqual(applied({ summary: MOVED }));
    // A refused session on a location edit names no firearm.
    expect((await apply(deps(s2Refused), null)).status).toMatchObject({ firearmsToCheck: [] });
  });

  it('R25 a lost answer holds the firearm change; Retry resends it and reads the refusals then', async () => {
    const first = await apply(deps({ kind: 'failed', error: 'network' }, moving()), null);
    expect(first.held).toMatchObject({ changes: MOVE, firearms: MOVED_FIREARMS });
    const retry = deps(
      {
        kind: 'partlyRejected',
        rejected: [{ tableName: 'sessions', rowId: 's1', reason: 'tombstoned' }],
      },
      moving(),
    );
    expect((await apply(retry, first.held)).status).toMatchObject({
      firearmsToCheck: ['f2', 'f1'],
    });
    expect(retry.build).not.toHaveBeenCalled();
    expect(vi.mocked(retry.push).mock.calls[0]![0]).toBe(MOVE);
  });
});

describe('a held request goes only to its own account (R12)', () => {
  const held = async () => (await apply(deps({ kind: 'failed', error: 'network' }), null)).held;

  it('R12 another account signed in: the held request is dropped and nothing is sent', async () => {
    const other = deps({ kind: 'saved' }, { currentUserId: vi.fn(() => Promise.resolve('u2')) });
    expect(await apply(other, await held())).toEqual({
      status: { kind: 'accountChanged', userId: 'u2' },
      held: null,
    });
    expect(other.push).not.toHaveBeenCalled();
  });

  it('R12 still signed out, or the server unreachable: the request stays held, nothing is sent', async () => {
    const request = await held();
    const signedOut = deps(
      { kind: 'saved' },
      { currentUserId: vi.fn(() => Promise.resolve(null)) },
    );
    expect(await apply(signedOut, request)).toEqual({
      status: { kind: 'failed', error: 'unauthenticated' },
      held: request,
    });
    const unreachable = deps(
      { kind: 'saved' },
      { currentUserId: vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) },
    );
    expect(await apply(unreachable, request)).toEqual({
      status: { kind: 'failed', error: 'network' },
      held: request,
    });
    expect(signedOut.push).not.toHaveBeenCalled();
    expect(unreachable.push).not.toHaveBeenCalled();
  });

  it('R12 a fresh Apply with the server unreachable builds nothing', async () => {
    const unreachable = deps(
      { kind: 'saved' },
      { currentUserId: vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) },
    );
    expect(await apply(unreachable, null)).toEqual({
      status: { kind: 'failed', error: 'network' },
      held: null,
    });
    expect(unreachable.loadContext).not.toHaveBeenCalled();
  });

  it('R12 a fresh Apply while signed out builds nothing', async () => {
    const signedOut = deps(
      { kind: 'saved' },
      { currentUserId: vi.fn(() => Promise.resolve(null)) },
    );
    expect(await apply(signedOut, null)).toEqual({
      status: { kind: 'failed', error: 'unauthenticated' },
      held: null,
    });
    expect(signedOut.loadContext).not.toHaveBeenCalled();
  });

  it('R12 a held firearm change goes to no other account, and nothing more is said (R26)', async () => {
    const held = (await apply(deps({ kind: 'failed', error: 'network' }, moving()), null)).held;
    const other = deps({ kind: 'saved' }, { currentUserId: vi.fn(() => Promise.resolve('u2')) });
    expect(await apply(other, held)).toEqual(accountChanged('u2'));
    expect(other.push).not.toHaveBeenCalled();
  });
});

describe('an unconfirmed answer (R14)', () => {
  it('R14 an unconfirmed answer may mean it landed: the edit is held and the page says so', async () => {
    const first = await apply(deps({ kind: 'failed', error: 'unknown', unconfirmed: true }), null);
    expect(first.status).toEqual({ kind: 'failed', error: 'unknown', unconfirmed: true });
    expect(first.held).toMatchObject({ changes: CHANGES });
  });

  it('R15 accountChanged names the account', () => {
    expect(accountChanged('u2')).toEqual({
      status: { kind: 'accountChanged', userId: 'u2' },
      held: null,
    });
  });
});

describe('a tag deleted meanwhile (R6)', () => {
  it('R6 Add Tag checks its tag afterwards and says so when it went', async () => {
    const tagged = () => ({ build: vi.fn(() => ok({ tagId: 't1' })) });
    const gone = deps(
      { kind: 'saved' },
      { ...tagged(), tagLive: vi.fn(() => Promise.resolve(false)) },
    );
    expect((await apply(gone, null)).status).toEqual(applied({ tagGone: true }));
    expect(gone.tagLive).toHaveBeenCalledWith('t1');

    const live = deps({ kind: 'saved' }, tagged());
    expect((await apply(live, null)).status).toEqual(applied());

    // An unanswered check is not evidence that the tag went.
    const unknown = deps(
      { kind: 'saved' },
      { ...tagged(), tagLive: vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) },
    );
    expect((await apply(unknown, null)).status).toEqual(applied());

    const untagged = deps({ kind: 'saved' });
    await apply(untagged, null);
    expect(untagged.tagLive).not.toHaveBeenCalled();
  });
});

describe('N1 no shooting data in browser storage', () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const sources = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

  it('the bulk modules never touch localStorage, sessionStorage or IndexedDB', () => {
    expect(sources.length).toBeGreaterThanOrEqual(5);
    for (const file of sources) {
      expect(readFileSync(path.join(dir, file), 'utf8')).not.toMatch(
        /localStorage|sessionStorage|indexedDB/i,
      );
    }
  });
});
