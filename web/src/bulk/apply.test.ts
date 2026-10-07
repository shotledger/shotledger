import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ClientChange } from '@shotledger/shared/src/sync';
import type {
  BulkContext,
  BulkResult,
  CounterPlan,
} from '@shotledger/shared/src/sync-client/bulk-edit';
import type { PushOutcome } from '@shotledger/shared/src/sync-client/direct-push';
import { describe, expect, it, vi } from 'vitest';

import {
  afterEdit,
  apply,
  applyBlocked,
  IDLE,
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
const CORRECTION: ClientChange[] = [change(6, 'firearms', 'f2')];
const SUMMARY = { changed: 1, unchanged: 2, missing: 1 };
const PLAN: CounterPlan = {
  moves: [
    { sessionId: 's1', rounds: 3, from: 'f1', to: 'f2' },
    { sessionId: 's2', rounds: 2, from: 'f1', to: 'f2' },
  ],
  original: { f1: [100, 0], f2: [10, 10] },
};
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
const FIREARMS = new Map([['f2', { id: 'f2', round_count: 15 }]]);

const ok = (
  overrides: { changes?: ClientChange[]; counters?: CounterPlan; tagId?: string } = {},
): BulkResult => ({
  ok: true,
  changes: CHANGES,
  summary: SUMMARY,
  counters: null,
  tagId: null,
  ...overrides,
});

function deps(outcomes: PushOutcome | PushOutcome[], overrides: Partial<ApplyDeps> = {}) {
  const queue = Array.isArray(outcomes) ? [...outcomes] : [outcomes];
  return {
    loadContext: vi.fn(() => Promise.resolve(CONTEXT)),
    build: vi.fn(() => ok()),
    push: vi.fn(() => Promise.resolve(queue.length > 1 ? queue.shift()! : queue[0]!)),
    loadFirearms: vi.fn(() => Promise.resolve(FIREARMS)),
    correct: vi.fn(() => CORRECTION),
    tagLive: vi.fn(() => Promise.resolve(true)),
    refresh: vi.fn(() => Promise.resolve(true)),
    ...overrides,
  } satisfies ApplyDeps;
}

const applied = (overrides: object = {}) => ({
  kind: 'applied',
  summary: SUMMARY,
  refused: 0,
  corrected: false,
  tagGone: false,
  refreshed: true,
  ...overrides,
});

const s2Refused: PushOutcome = {
  kind: 'partlyRejected',
  rejected: [{ tableName: 'sessions', rowId: 's2', reason: 'tombstoned' }],
};
const moving = () => ({ build: vi.fn(() => ok({ changes: MOVE, counters: PLAN })) });

describe('applying a bulk edit', () => {
  it('U5 offline blocks Apply and names the reason; so does applying and a pending correction', () => {
    expect(applyBlocked(false, IDLE)).toBe('offline');
    expect(applyBlocked(true, IDLE)).toBeNull();
    expect(applyBlocked(true, { status: { kind: 'applying' }, held: null })).toBe('applying');
    expect(applyBlocked(false, { status: { kind: 'applying' }, held: null })).toBe('offline');
    const correcting: ApplyState = {
      status: { kind: 'failed', error: 'network', stage: 'correction' },
      held: {
        stage: 'correction',
        built: { changes: MOVE, summary: SUMMARY, counters: PLAN, tagId: null },
        refused: { sessions: new Set(['s2']), firearms: new Set(), count: 1 },
        changes: null,
      },
    };
    expect(applyBlocked(true, correcting)).toBe('correcting');
  });

  it('U6 a network failure holds the request; Retry resends the identical request', async () => {
    const failing = deps({ kind: 'failed', error: 'network' });
    const failed = await apply(failing, null);
    expect(failed).toEqual({
      status: { kind: 'failed', error: 'network', stage: 'edit' },
      held: {
        stage: 'edit',
        built: { changes: CHANGES, summary: SUMMARY, counters: null, tagId: null },
      },
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
    expect(signedOut.held?.built.changes).toBe(CHANGES);
    for (const error of ['versionUnsupported', 'payloadTooLarge', 'unknown'] as const) {
      expect(await apply(deps({ kind: 'failed', error }), null)).toEqual({
        status: { kind: 'failed', error, stage: 'edit' },
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
      status: { kind: 'failed', error: 'network', stage: 'edit' },
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
      status: { kind: 'failed', error: 'unknown', stage: 'edit' },
      held: null,
    });
    expect(throwing.push).not.toHaveBeenCalled();
  });

  it('U7 an answered push refreshes; refused changes are counted; a failed refresh says reload', async () => {
    const partly = deps({
      kind: 'partlyRejected',
      rejected: [
        { tableName: 'sessions', rowId: 's1', reason: 'tombstoned' },
        { tableName: 'session_tags', rowId: 'l2', reason: 'tombstoned' },
      ],
    });
    // No counter plan (a location or tag edit): nothing to correct.
    expect((await apply(partly, null)).status).toEqual(applied({ refused: 2 }));
    expect(partly.refresh).toHaveBeenCalledTimes(1);
    expect(partly.loadFirearms).not.toHaveBeenCalled();
    expect(partly.push).toHaveBeenCalledTimes(1);

    const stale = deps({ kind: 'saved' }, { refresh: vi.fn(() => Promise.resolve(false)) });
    expect((await apply(stale, null)).status).toEqual(applied({ refreshed: false }));
  });

  it('U8 an edit drops a held edit, but not a pending correction and not while applying', () => {
    const built: Built = { changes: CHANGES, summary: SUMMARY, counters: null, tagId: null };
    expect(
      afterEdit({
        status: { kind: 'failed', error: 'network', stage: 'edit' },
        held: { stage: 'edit', built },
      }),
    ).toBe(IDLE);
    const applying = { status: { kind: 'applying' as const }, held: null };
    expect(afterEdit(applying)).toBe(applying);
    const correcting: ApplyState = {
      status: { kind: 'failed', error: 'network', stage: 'correction' },
      held: {
        stage: 'correction',
        built,
        refused: { sessions: new Set(), firearms: new Set(), count: 1 },
        changes: CORRECTION,
      },
    };
    expect(afterEdit(correcting)).toBe(correcting);
  });
});

describe('correcting the counters after a refused session (R5)', () => {
  it('R5 a refused moved session: the firearms are pulled afresh and the correction pushed', async () => {
    const d = deps([s2Refused, { kind: 'saved' }], moving());
    expect(await apply(d, null)).toEqual({
      status: applied({ refused: 1, corrected: true }),
      held: null,
    });
    expect(d.push).toHaveBeenCalledTimes(2);
    expect(vi.mocked(d.push).mock.calls[1]![0]).toBe(CORRECTION);
    expect(d.correct).toHaveBeenCalledWith(
      PLAN,
      { sessions: new Set(['s2']), firearms: new Set(), count: 1 },
      FIREARMS,
    );
    // The refresh shows the corrected counters.
    expect(d.refresh).toHaveBeenCalledTimes(1);
    expect(vi.mocked(d.refresh).mock.invocationCallOrder[0]!).toBeGreaterThan(
      vi.mocked(d.push).mock.invocationCallOrder[1]!,
    );
  });

  it('R5 a refused firearm row is passed on, so its counters are left alone', async () => {
    const d = deps(
      [
        {
          kind: 'partlyRejected',
          rejected: [
            { tableName: 'firearms', rowId: 'f2', reason: 'tombstoned' },
            { tableName: 'sessions', rowId: 's2', reason: 'tombstoned' },
          ],
        },
        { kind: 'saved' },
      ],
      moving(),
    );
    await apply(d, null);
    expect(d.correct).toHaveBeenCalledWith(
      PLAN,
      { sessions: new Set(['s2']), firearms: new Set(['f2']), count: 2 },
      FIREARMS,
    );
  });

  it('R5 a firearm refusal alone, or nothing to take back, sends no correction', async () => {
    const firearmOnly = deps(
      {
        kind: 'partlyRejected',
        rejected: [{ tableName: 'firearms', rowId: 'f2', reason: 'tombstoned' }],
      },
      moving(),
    );
    expect((await apply(firearmOnly, null)).status).toEqual(applied({ refused: 1 }));
    expect(firearmOnly.loadFirearms).not.toHaveBeenCalled();

    const floored = deps([s2Refused], { ...moving(), correct: vi.fn(() => []) });
    expect((await apply(floored, null)).status).toEqual(applied({ refused: 1 }));
    expect(floored.push).toHaveBeenCalledTimes(1);
  });

  it('R5 a lost correction is held as built; Retry resends it identically and never rebuilds it', async () => {
    const d = deps([s2Refused, { kind: 'failed', error: 'network' }], moving());
    const first = await apply(d, null);
    expect(first.status).toEqual({ kind: 'failed', error: 'network', stage: 'correction' });
    expect(first.held).toMatchObject({ stage: 'correction', changes: CORRECTION });
    expect(d.refresh).not.toHaveBeenCalled();

    const retry = deps({ kind: 'saved' });
    expect(await apply(retry, first.held)).toEqual({
      status: applied({ refused: 1, corrected: true }),
      held: null,
    });
    expect(retry.push).toHaveBeenCalledTimes(1);
    expect(vi.mocked(retry.push).mock.calls[0]![0]).toBe(CORRECTION);
    expect(retry.loadFirearms).not.toHaveBeenCalled();
    expect(retry.correct).not.toHaveBeenCalled();
    expect(retry.loadContext).not.toHaveBeenCalled();
  });

  it('R5 a correction stays held whatever the failure, since the edit already landed', async () => {
    const d = deps([s2Refused, { kind: 'failed', error: 'versionUnsupported' }], moving());
    expect((await apply(d, null)).held?.stage).toBe('correction');
  });

  it('R5 an unanswered firearm pull holds the unbuilt correction; Retry builds and sends it', async () => {
    const d = deps(s2Refused, {
      ...moving(),
      loadFirearms: vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    });
    const first = await apply(d, null);
    expect(first.status).toEqual({ kind: 'failed', error: 'network', stage: 'correction' });
    expect(first.held).toMatchObject({ stage: 'correction', changes: null });
    expect(d.push).toHaveBeenCalledTimes(1);

    const retry = deps({ kind: 'saved' });
    expect((await apply(retry, first.held)).status).toEqual(
      applied({ refused: 1, corrected: true }),
    );
    expect(retry.correct).toHaveBeenCalledTimes(1);
    expect(vi.mocked(retry.push).mock.calls[0]![0]).toBe(CORRECTION);
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
