import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ClientChange } from '@shotledger/shared/src/sync';
import type { PushOutcome } from '@shotledger/shared/src/sync-client/direct-push';
import { AuthError } from '@shotledger/shared/src/sync-client/http';
import type {
  CounterMove,
  EditContext,
  EditResult,
} from '@shotledger/shared/src/sync-client/session-edit';
import { describe, expect, it, vi } from 'vitest';

import {
  afterEdit,
  deleteClick,
  deleteStep,
  reload,
  destination,
  editBlocked,
  IDLE,
  run,
  submitRequest,
  type Built,
  type EditDeps,
  type EditState,
} from './save';

const change = (tableName: ClientChange['tableName'], rowId: string): ClientChange => ({
  clientChangeId: `c-${tableName}-${rowId}`,
  tableName,
  rowId,
  payload: { id: rowId },
  deletedAt: null,
  updatedAt: '2026-10-12T10:00:00.000Z',
});

const CHANGES = [change('firearms', 'f1'), change('sessions', 's1'), change('shots', 'h1')];
const MOVED: CounterMove[] = [
  {
    firearmId: 'f1',
    rows: [
      { tableName: 'sessions', rowId: 's1' },
      { tableName: 'shots', rowId: 'h1' },
    ],
  },
];
const FRESH = { sessions: new Map() } as unknown as EditContext;

function deps(overrides: Partial<EditDeps> = {}) {
  const push = vi.fn(async (): Promise<PushOutcome> => ({ kind: 'saved' }));
  const build = vi.fn((): EditResult => ({ ok: true, changes: CHANGES, moved: MOVED }));
  const loadContext = vi.fn(async () => FRESH);
  const refresh = vi.fn(async () => true);
  const all = {
    currentUserId: vi.fn(async (): Promise<string | null> => 'u1'),
    loadContext,
    build,
    push,
    refresh,
    ...overrides,
  };
  return all;
}

const held = (userId = 'u1'): Built => ({
  action: 'save',
  changes: CHANGES,
  moved: MOVED,
  userId,
});

describe('run', () => {
  it('U6 saved: builds from the fresh pull, pushes once, refreshes, and goes to the detail', async () => {
    const d = deps();
    const next = await run(d, 'save', null);
    expect(d.build).toHaveBeenCalledWith(FRESH);
    expect(d.push).toHaveBeenCalledTimes(1);
    expect(d.push).toHaveBeenCalledWith(CHANGES);
    expect(d.refresh).toHaveBeenCalledTimes(1);
    expect(next).toEqual({
      status: { kind: 'done', action: 'save', refused: 0, firearmsToCheck: [], refreshed: true },
      held: null,
    });
    expect(destination('s 1', next.status)).toBe('#sessions/s%201');
  });

  it('U6 deleted: goes to the list; a failed refresh is reported', async () => {
    const d = deps({ refresh: vi.fn(async () => false) });
    const next = await run(d, 'delete', null);
    expect(next.status).toEqual({
      kind: 'done',
      action: 'delete',
      refused: 0,
      firearmsToCheck: [],
      refreshed: false,
    });
    expect(destination('s1', next.status)).toBe('#sessions');
  });

  it('destination: nowhere while the form stays open', () => {
    for (const status of [
      { kind: 'idle' },
      { kind: 'invalid', errors: [] },
      { kind: 'stale', action: 'save', fresh: FRESH },
      { kind: 'stale', action: 'delete', fresh: FRESH },
      { kind: 'failed', error: 'network' },
      { kind: 'accountChanged' },
    ] as EditState['status'][]) {
      expect(destination('s1', status)).toBeNull();
    }
    expect(destination('s1', { kind: 'gone', refreshed: true })).toBe('#sessions');
  });

  it('U7 saved in part names the firearm only when a row its move was made for was refused', async () => {
    const refusedShot = deps({
      push: vi.fn(async (): Promise<PushOutcome> => ({
        kind: 'partlyRejected',
        rejected: [{ tableName: 'shots', rowId: 'h1', reason: 'tombstoned' }],
      })),
    });
    expect((await run(refusedShot, 'save', null)).status).toEqual({
      kind: 'done',
      action: 'save',
      refused: 1,
      firearmsToCheck: ['f1'],
      refreshed: true,
    });
    // The firearm row itself refused (deleted elsewhere): nothing to check.
    const refusedFirearm = deps({
      push: vi.fn(async (): Promise<PushOutcome> => ({
        kind: 'partlyRejected',
        rejected: [{ tableName: 'firearms', rowId: 'f1', reason: 'tombstoned' }],
      })),
    });
    expect((await run(refusedFirearm, 'save', null)).status).toMatchObject({
      refused: 1,
      firearmsToCheck: [],
    });
    // Same id, other table: not the row the move was made for.
    const otherTable = deps({
      push: vi.fn(async (): Promise<PushOutcome> => ({
        kind: 'partlyRejected',
        rejected: [{ tableName: 'series', rowId: 's1', reason: 'tombstoned' }],
      })),
    });
    expect((await run(otherTable, 'save', null)).status).toMatchObject({ firearmsToCheck: [] });
  });

  it('U3 a network or sign-out failure holds the request; Retry resends it identically', async () => {
    for (const error of ['network', 'unauthenticated'] as const) {
      const d = deps({
        push: vi.fn(async (): Promise<PushOutcome> => ({ kind: 'failed', error })),
      });
      const first = await run(d, 'save', null);
      expect(first).toEqual({
        status: { kind: 'failed', error },
        held: { action: 'save', changes: CHANGES, moved: MOVED, userId: 'u1' },
      });
      expect(submitRequest(first)).toBe(first.held);

      const retry = deps();
      const second = await run(retry, 'save', submitRequest(first));
      expect(retry.loadContext).not.toHaveBeenCalled();
      expect(retry.build).not.toHaveBeenCalled();
      expect(retry.push).toHaveBeenCalledWith(CHANGES);
      expect(second.status).toMatchObject({ kind: 'done' });
    }
  });

  it('U3 an unconfirmed answer is held too; another failure is not', async () => {
    const unconfirmed = deps({
      push: vi.fn(async (): Promise<PushOutcome> => ({
        kind: 'failed',
        error: 'unknown',
        unconfirmed: true,
      })),
    });
    expect(await run(unconfirmed, 'delete', null)).toEqual({
      status: { kind: 'failed', error: 'unknown', unconfirmed: true },
      held: { action: 'delete', changes: CHANGES, moved: MOVED, userId: 'u1' },
    });
    const outdated = deps({
      push: vi.fn(async (): Promise<PushOutcome> => ({
        kind: 'failed',
        error: 'versionUnsupported',
      })),
    });
    expect(await run(outdated, 'save', null)).toEqual({
      status: { kind: 'failed', error: 'versionUnsupported' },
      held: null,
    });
  });

  it('U3 signed out before sending: nothing pulled, the held request kept', async () => {
    const d = deps({ currentUserId: vi.fn(async () => null) });
    expect(await run(d, 'save', held())).toEqual({
      status: { kind: 'failed', error: 'unauthenticated' },
      held: held(),
    });
    expect(d.push).not.toHaveBeenCalled();
    const offline = deps({
      currentUserId: vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    });
    expect(await run(offline, 'save', null)).toEqual({
      status: { kind: 'failed', error: 'network' },
      held: null,
    });
  });

  it('U3 an edit drops the held request, except while one is in flight', () => {
    const holding: EditState = { status: { kind: 'failed', error: 'network' }, held: held() };
    expect(afterEdit(holding)).toBe(IDLE);
    const working: EditState = { status: { kind: 'working', action: 'save' }, held: null };
    expect(afterEdit(working)).toBe(working);
  });

  it('U4 a held request meets another account → accountChanged, nothing sent', async () => {
    const d = deps({ currentUserId: vi.fn(async () => 'u2') });
    expect(await run(d, 'save', held('u1'))).toEqual({
      status: { kind: 'accountChanged' },
      held: null,
    });
    expect(d.push).not.toHaveBeenCalled();
  });

  it('U5 stale → the fresh rows to reload from; nothing was sent', async () => {
    const d = deps({
      build: vi.fn((): EditResult => ({ ok: false, errors: [{ kind: 'stale' }] })),
    });
    expect(await run(d, 'save', null)).toEqual({
      status: { kind: 'stale', action: 'save', fresh: FRESH },
      held: null,
    });
    expect(d.push).not.toHaveBeenCalled();
    expect(d.refresh).not.toHaveBeenCalled();
  });

  it('U10 a stale Delete → stale for delete; nothing was sent', async () => {
    const d = deps({
      build: vi.fn((): EditResult => ({ ok: false, errors: [{ kind: 'stale' }] })),
    });
    expect(await run(d, 'delete', null)).toEqual({
      status: { kind: 'stale', action: 'delete', fresh: FRESH },
      held: null,
    });
    expect(d.push).not.toHaveBeenCalled();
    expect(d.refresh).not.toHaveBeenCalled();
  });

  it('gone → nothing sent; the page refreshes and leaves for the list', async () => {
    const d = deps({ build: vi.fn((): EditResult => ({ ok: false, errors: [{ kind: 'gone' }] })) });
    expect(await run(d, 'delete', null)).toEqual({
      status: { kind: 'gone', refreshed: true },
      held: null,
    });
    expect(d.push).not.toHaveBeenCalled();
    expect(d.refresh).toHaveBeenCalledTimes(1);
    const failedRefresh = deps({
      build: vi.fn((): EditResult => ({ ok: false, errors: [{ kind: 'gone' }] })),
      refresh: vi.fn(async () => false),
    });
    expect((await run(failedRefresh, 'save', null)).status).toEqual({
      kind: 'gone',
      refreshed: false,
    });
  });

  it('validation errors and nothing to change: kept on the form, nothing sent', async () => {
    const errors = [{ kind: 'nothingToChange' }, { kind: 'invalidStartedAt' }] as const;
    const d = deps({ build: vi.fn((): EditResult => ({ ok: false, errors: [...errors] })) });
    expect(await run(d, 'save', null)).toEqual({
      status: { kind: 'invalid', errors: [...errors] },
      held: null,
    });
    expect(d.push).not.toHaveBeenCalled();
  });

  it('a failed pull is reported, with nothing held', async () => {
    const d = deps({
      loadContext: vi.fn(async () => {
        throw new AuthError(401, 'expired');
      }),
    });
    expect(await run(d, 'save', null)).toEqual({
      status: { kind: 'failed', error: 'unauthenticated' },
      held: null,
    });
  });

  it('U9 a builder that throws ends in "Could not save", not a page stuck saving', async () => {
    const d = deps({
      build: vi.fn((): EditResult => {
        throw new Error('Unknown discipline: x');
      }),
    });
    expect(await run(d, 'save', null)).toEqual({
      status: { kind: 'failed', error: 'unknown' },
      held: null,
    });
    expect(d.push).not.toHaveBeenCalled();
  });
});

describe('editBlocked', () => {
  it('U2 offline disables Save and Delete and names the reason; so does a request in flight', () => {
    expect(editBlocked(false, IDLE)).toBe('offline');
    expect(editBlocked(true, IDLE)).toBeNull();
    expect(editBlocked(true, { status: { kind: 'working', action: 'delete' }, held: null })).toBe(
      'working',
    );
  });
});

describe('deleteClick and reload (round-3 F1)', () => {
  it('U8 Delete Session asks first; only a held request resends without asking', () => {
    expect(deleteClick(IDLE)).toBe('ask');
    expect(
      deleteClick({ status: { kind: 'stale', action: 'delete', fresh: FRESH }, held: null }),
    ).toBe('ask');
    expect(deleteClick({ status: { kind: 'failed', error: 'network' }, held: held() })).toBe(
      'resend',
    );
  });

  it('U10 Reload pulls the account again and leaves the stale state', () => {
    const refresh = vi.fn(async () => true);
    expect(reload(refresh)).toBe(IDLE);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('deleteStep', () => {
  it('U8 Delete needs the confirmation; Cancel sends nothing', () => {
    expect(deleteStep('closed', 'ask')).toEqual({ step: 'asking', send: false });
    expect(deleteStep('asking', 'cancel')).toEqual({ step: 'closed', send: false });
    expect(deleteStep('asking', 'confirm')).toEqual({ step: 'closed', send: true });
    // A confirm without the question asked first sends nothing.
    expect(deleteStep('closed', 'confirm')).toEqual({ step: 'closed', send: false });
  });
});

describe('N1 no shooting data in browser storage', () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const sources = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

  it('the edit modules never touch localStorage, sessionStorage or IndexedDB', () => {
    expect(sources.length).toBeGreaterThanOrEqual(6);
    for (const file of sources) {
      expect(readFileSync(path.join(dir, file), 'utf8')).not.toMatch(
        /localStorage|sessionStorage|indexedDB/i,
      );
    }
  });
});

describe('N2 no automatic retry', () => {
  it('the edit modules set no timer', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    for (const file of readdirSync(dir).filter((f) => !/\.test\.tsx?$/.test(f))) {
      expect(readFileSync(path.join(dir, file), 'utf8')).not.toMatch(/setTimeout|setInterval/);
    }
  });
});
