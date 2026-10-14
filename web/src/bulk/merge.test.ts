import type { ClientChange } from '@shotledger/shared/src/sync';
import type { PushOutcome } from '@shotledger/shared/src/sync-client/direct-push';
import { describe, expect, it, vi } from 'vitest';

import type { PulledTables } from '../pull';
import {
  afterMergeEdit,
  EMPTY_MERGE,
  keepOptions,
  lotOptions,
  MERGE_IDLE,
  MERGE_TABLES,
  mergeMessages,
  mergeReady,
  runMerge,
  type Built,
  type MergeIo,
  type MergeState,
} from './merge';

const OLD = '2026-01-01T00:00:00.000Z';
const NOW = '2026-10-13T21:00:00.000Z';

type Row = Record<string, unknown>;
const byId = (rows: Row[]) => new Map(rows.map((r) => [String(r.id), r]));

const lot = (id: string, label: string, fields: Row = {}): Row => ({
  id,
  created_at: OLD,
  updated_at: OLD,
  deleted_at: null,
  label,
  caliber: '.22 LR',
  ...fields,
});
const session = (id: string, ammoLotId: string | null, fields: Row = {}): Row => ({
  id,
  created_at: OLD,
  updated_at: OLD,
  deleted_at: null,
  ammo_lot_id: ammoLotId,
  ...fields,
});

function tables(): PulledTables {
  return {
    ammo_lots: byId([
      lot('a', 'SK Standard'),
      lot('b', 'Lapua Center-X', { caliber: null }),
      lot('c', 'Eley Club', { deleted_at: OLD }),
      lot('d', 'SK Standard', { deleted_at: undefined, caliber: undefined }),
    ]),
    sessions: byId([
      session('s1', 'a'),
      session('s2', 'a'),
      session('s3', 'a', { deleted_at: OLD }),
      session('s4', 'b'),
      session('s5', null),
    ]),
  } as unknown as PulledTables;
}

describe('U1 the lot options', () => {
  it('lists live lots only, by label then id, with caliber and live session count', () => {
    expect(lotOptions(tables())).toEqual([
      { id: 'b', label: 'Lapua Center-X', caliber: null, sessions: 1 },
      { id: 'a', label: 'SK Standard', caliber: '.22 LR', sessions: 2 },
      { id: 'd', label: 'SK Standard', caliber: null, sessions: 0 },
    ]);
  });

  it('Keep excludes the chosen Duplicate', () => {
    const options = lotOptions(tables());
    expect(keepOptions(options, 'a').map((o) => o.id)).toEqual(['b', 'd']);
    expect(keepOptions(options, '').map((o) => o.id)).toEqual(['b', 'a', 'd']);
  });

  it('is ready only with two different lots chosen', () => {
    expect(mergeReady(EMPTY_MERGE)).toBe(false);
    expect(mergeReady({ duplicateId: 'a', keptId: '' })).toBe(false);
    expect(mergeReady({ duplicateId: '', keptId: 'b' })).toBe(false);
    expect(mergeReady({ duplicateId: 'a', keptId: 'a' })).toBe(false);
    expect(mergeReady({ duplicateId: 'a', keptId: 'b' })).toBe(true);
  });
});

function io(outcomes: PushOutcome | PushOutcome[], overrides: Partial<MergeIo> = {}) {
  const queue = Array.isArray(outcomes) ? [...outcomes] : [outcomes];
  let n = 0;
  const base = {
    currentUserId: vi.fn(() => Promise.resolve<string | null>('u1')),
    loadTables: vi.fn(() => Promise.resolve(tables())),
    push: vi.fn((_: readonly ClientChange[]) =>
      Promise.resolve(queue.length > 1 ? queue.shift()! : queue[0]!),
    ),
    refresh: vi.fn(() => Promise.resolve(true)),
    newId: () => `id-${(n += 1)}`,
    newChangeId: () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`,
    now: () => NOW,
  };
  // Overrides replace only the plain functions; push stays the mock.
  return Object.assign(base, overrides) as typeof base;
}

const FORM = { duplicateId: 'a', keptId: 'b' };

describe('U2 a Merge, a failure and Retry', () => {
  it('pulls sessions and lots, builds one push and reports the moved sessions', async () => {
    const deps = io({ kind: 'saved' });
    const state = await runMerge(deps, FORM, null);
    expect(deps.loadTables).toHaveBeenCalledWith(MERGE_TABLES);
    expect(MERGE_TABLES).toEqual(['sessions', 'ammo_lots']);
    const sent = deps.push.mock.calls[0]![0];
    expect(sent.map((c) => `${c.tableName}:${c.rowId}`)).toEqual([
      'ammo_lots:a',
      'sessions:s1',
      'sessions:s2',
    ]);
    expect(state).toEqual({
      status: { kind: 'applied', moved: 2, refused: 0, duplicateGone: false, refreshed: true },
      held: null,
    });
    expect(deps.refresh).toHaveBeenCalledOnce();
  });

  it('a builder error sends nothing', async () => {
    const deps = io({ kind: 'saved' });
    expect(await runMerge(deps, { duplicateId: 'a', keptId: 'c' }, null)).toEqual({
      status: { kind: 'invalid', errors: [{ kind: 'unknownLot' }] },
      held: null,
    });
    expect(deps.push).not.toHaveBeenCalled();
  });

  it('a network failure holds the request; Retry resends it identically without pulling', async () => {
    const deps = io([{ kind: 'failed', error: 'network' }, { kind: 'saved' }]);
    const first = await runMerge(deps, FORM, null);
    expect(first.status).toEqual({ kind: 'failed', error: 'network' });
    expect(first.held).not.toBeNull();
    const retried = await runMerge(deps, EMPTY_MERGE, first.held);
    expect(deps.loadTables).toHaveBeenCalledOnce();
    expect(deps.push.mock.calls[1]![0]).toBe(deps.push.mock.calls[0]![0]);
    expect(retried.status.kind).toBe('applied');
  });

  it('a signed-out push holds the request; an unconfirmed answer holds it too', async () => {
    const signedOut = await runMerge(io({ kind: 'failed', error: 'unauthenticated' }), FORM, null);
    expect(signedOut.held).not.toBeNull();
    const unconfirmed = await runMerge(
      io({ kind: 'failed', error: 'unknown', unconfirmed: true }),
      FORM,
      null,
    );
    expect(unconfirmed.status).toEqual({ kind: 'failed', error: 'unknown', unconfirmed: true });
    expect(unconfirmed.held).not.toBeNull();
  });

  it('any other failed push drops the request', async () => {
    const state = await runMerge(io({ kind: 'failed', error: 'versionUnsupported' }), FORM, null);
    expect(state).toEqual({ status: { kind: 'failed', error: 'versionUnsupported' }, held: null });
  });

  it('no session: unauthenticated, keeping a held request', async () => {
    const held: Built = { changes: [], moved: 0, userId: 'u1' };
    const deps = io({ kind: 'saved' }, { currentUserId: () => Promise.resolve(null) });
    expect(await runMerge(deps, FORM, held)).toEqual({
      status: { kind: 'failed', error: 'unauthenticated' },
      held,
    });
  });

  it('a failed user lookup or pull is classified', async () => {
    const lookup = io(
      { kind: 'saved' },
      { currentUserId: () => Promise.reject(new TypeError('x')) },
    );
    expect((await runMerge(lookup, FORM, null)).status).toEqual({
      kind: 'failed',
      error: 'network',
    });
    const pull = io({ kind: 'saved' }, { loadTables: () => Promise.reject(new TypeError('x')) });
    expect(await runMerge(pull, FORM, null)).toEqual({
      status: { kind: 'failed', error: 'network' },
      held: null,
    });
  });

  it('a held request meets another account: dropped, not sent', async () => {
    const held: Built = { changes: [], moved: 0, userId: 'u0' };
    const deps = io({ kind: 'saved' });
    expect(await runMerge(deps, FORM, held)).toEqual({
      status: { kind: 'accountChanged', userId: 'u1' },
      held: null,
    });
    expect(deps.push).not.toHaveBeenCalled();
  });

  it('a refused session is not counted as moved; the duplicate refused means it was gone', async () => {
    const partly = await runMerge(
      io({
        kind: 'partlyRejected',
        rejected: [{ tableName: 'sessions', rowId: 's2', reason: 'tombstoned' }],
      }),
      FORM,
      null,
    );
    expect(partly.status).toEqual({
      kind: 'applied',
      moved: 1,
      refused: 1,
      duplicateGone: false,
      refreshed: true,
    });
    const gone = await runMerge(
      io({
        kind: 'partlyRejected',
        rejected: [{ tableName: 'ammo_lots', rowId: 'a', reason: 'tombstoned' }],
      }),
      FORM,
      null,
    );
    expect(gone.status).toMatchObject({ moved: 2, refused: 1, duplicateGone: true });
  });

  it('an edit drops a held request, but not while applying', () => {
    const held: MergeState = {
      status: { kind: 'failed', error: 'network' },
      held: { changes: [], moved: 0, userId: 'u1' },
    };
    expect(afterMergeEdit(held)).toBe(MERGE_IDLE);
    const applying: MergeState = { status: { kind: 'applying' }, held: null };
    expect(afterMergeEdit(applying)).toBe(applying);
  });
});

describe('U3 what the panel says', () => {
  const said = (status: MergeState['status']) =>
    mergeMessages({ status, held: null }).map((m) => [m.key, m.params]);

  it('per outcome', () => {
    expect(said({ kind: 'idle' })).toEqual([]);
    expect(said({ kind: 'applying' })).toEqual([['web.bulk.applying', undefined]]);
    expect(
      said({ kind: 'applied', moved: 3, refused: 0, duplicateGone: false, refreshed: true }),
    ).toEqual([['web.bulk.merged', { count: 3 }]]);
    expect(
      said({ kind: 'applied', moved: 2, refused: 1, duplicateGone: false, refreshed: false }),
    ).toEqual([
      ['web.bulk.merged', { count: 2 }],
      ['web.bulk.refused', { count: 1 }],
      ['web.bulk.reload', undefined],
    ]);
    expect(
      said({ kind: 'applied', moved: 2, refused: 1, duplicateGone: true, refreshed: true }),
    ).toEqual([['web.bulk.mergeDuplicateGone', undefined]]);
    expect(said({ kind: 'accountChanged', userId: 'u2' })).toEqual([
      ['web.bulk.mergeAccountChanged', undefined],
    ]);
  });

  it('failures', () => {
    expect(said({ kind: 'failed', error: 'network' })).toEqual([
      ['web.bulk.mergeFailedNetwork', undefined],
    ]);
    expect(said({ kind: 'failed', error: 'unauthenticated' })).toEqual([
      ['web.bulk.failedSignedOut', undefined],
    ]);
    expect(said({ kind: 'failed', error: 'versionUnsupported' })).toEqual([
      ['web.bulk.failedOutdated', undefined],
    ]);
    expect(said({ kind: 'failed', error: 'unknown' })).toEqual([['web.entry.failed', undefined]]);
    expect(said({ kind: 'failed', error: 'network', unconfirmed: true })).toEqual([
      ['web.bulk.failedUnconfirmed', undefined],
    ]);
  });

  it('builder errors', () => {
    expect(
      said({
        kind: 'invalid',
        errors: [
          { kind: 'sameLot' },
          { kind: 'unknownLot' },
          { kind: 'tooManyChanges', max: 500, needed: 612 },
        ],
      }),
    ).toEqual([
      ['web.bulk.mergeErrorSameLot', undefined],
      ['web.bulk.mergeErrorUnknownLot', undefined],
      ['web.bulk.mergeErrorTooMany', { needed: 612, max: 500 }],
    ]);
  });
});
