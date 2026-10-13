import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ClientChange } from '@shotledger/shared/src/sync';
import type { PushOutcome } from '@shotledger/shared/src/sync-client/direct-push';
import type { EntryContext, EntryResult } from '@shotledger/shared/src/sync-client/session-entry';
import { describe, expect, it, vi } from 'vitest';

import {
  afterEdit,
  IDLE,
  save,
  saveBlocked,
  submitRequest,
  type SaveDeps,
  type SaveState,
} from './save';

const CHANGES: ClientChange[] = [
  {
    clientChangeId: '00000000-0000-4000-8000-000000000001',
    tableName: 'sessions',
    rowId: 's1',
    payload: { id: 's1' },
    deletedAt: null,
    updatedAt: '2026-10-07T10:00:00.000Z',
  },
];
const CONTEXT: EntryContext = { firearms: new Map(), firearmGroups: [], ammoLots: new Map() };

function deps(outcome: PushOutcome, overrides: Partial<SaveDeps> = {}) {
  const built: EntryResult = { ok: true, sessionId: 's1', changes: CHANGES, photos: [] };
  return {
    currentUserId: vi.fn(() => Promise.resolve<string | null>('user-a')),
    loadContext: vi.fn(() => Promise.resolve(CONTEXT)),
    build: vi.fn(() => built),
    push: vi.fn(() => Promise.resolve(outcome)),
    refresh: vi.fn(() => Promise.resolve(true)),
    ...overrides,
  } satisfies SaveDeps;
}

describe('saving an entry', () => {
  it('U1 offline disables Save and names the reason', () => {
    expect(saveBlocked(false, IDLE)).toBe('offline');
    expect(saveBlocked(true, IDLE)).toBeNull();
    expect(saveBlocked(true, { status: { kind: 'saving' }, held: null })).toBe('saving');
    expect(saveBlocked(false, { status: { kind: 'saving' }, held: null })).toBe('offline');
  });

  it('U2 a failed save keeps the draft and holds the request; Retry resends the identical request', async () => {
    const failing = deps({ kind: 'failed', error: 'network' });
    const failed = await save(failing, null);
    expect(failed).toEqual({
      status: { kind: 'failed', error: 'network' },
      held: { changes: CHANGES, userId: 'user-a' },
    });
    expect(failing.refresh).not.toHaveBeenCalled();

    const retrying = deps({ kind: 'saved' });
    const retried = await save(retrying, failed.held);
    expect(retrying.push).toHaveBeenCalledTimes(1);
    expect(vi.mocked(retrying.push).mock.calls[0]![0]).toBe(CHANGES);
    // A retry sends what was held; it neither pulls nor builds again.
    expect(retrying.loadContext).not.toHaveBeenCalled();
    expect(retrying.build).not.toHaveBeenCalled();
    expect(retried.status).toEqual({ kind: 'saved', refreshed: true, firearmRejected: false });
  });

  it('U2 a signed-out failure holds the request too; the others do not', async () => {
    expect(
      (await save(deps({ kind: 'failed', error: 'unauthenticated' }), null)).held?.changes,
    ).toBe(CHANGES);
    for (const error of ['versionUnsupported', 'payloadTooLarge', 'unknown'] as const) {
      expect(await save(deps({ kind: 'failed', error }), null)).toEqual({
        status: { kind: 'failed', error },
        held: null,
      });
    }
  });

  it('U9 an answer whose acks do not match what was sent holds the request (R19)', async () => {
    const unconfirmed = deps({ kind: 'failed', error: 'unknown', unconfirmed: true });
    expect(await save(unconfirmed, null)).toEqual({
      status: { kind: 'failed', error: 'unknown', unconfirmed: true },
      held: { changes: CHANGES, userId: 'user-a' },
    });
  });

  it('U10 a build that throws fails the save instead of leaving it saving (R18)', async () => {
    const throwing = deps(
      { kind: 'saved' },
      {
        build: vi.fn((): EntryResult => {
          throw new TypeError('crypto.randomUUID is not a function');
        }),
      },
    );
    expect(await save(throwing, null)).toEqual({
      status: { kind: 'failed', error: 'unknown' },
      held: null,
    });
    expect(throwing.push).not.toHaveBeenCalled();
  });

  it('U2 nothing retries on its own (N2)', async () => {
    const failing = deps({ kind: 'failed', error: 'network' });
    await save(failing, null);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(failing.push).toHaveBeenCalledTimes(1);
  });

  it('a failed pull before the build sends nothing and holds nothing', async () => {
    const failing = deps(
      { kind: 'saved' },
      {
        loadContext: vi.fn(() => Promise.reject(new Error('offline'))),
      },
    );
    expect(await save(failing, null)).toEqual({
      status: { kind: 'failed', error: 'network' },
      held: null,
    });
    expect(failing.push).not.toHaveBeenCalled();
  });

  it('an invalid entry sends nothing', async () => {
    const errors = [{ kind: 'unknownFirearm' as const }];
    const invalid = deps(
      { kind: 'saved' },
      { build: vi.fn(() => ({ ok: false as const, errors })) },
    );
    expect(await save(invalid, null)).toEqual({ status: { kind: 'invalid', errors }, held: null });
    expect(invalid.push).not.toHaveBeenCalled();
    expect(invalid.build).toHaveBeenCalledWith(CONTEXT);
  });

  it('U7 while a request is held, every submit resends it rather than building another', async () => {
    const held = { changes: CHANGES, userId: 'user-a' };
    const failed: SaveState = { status: { kind: 'failed', error: 'network' }, held };
    expect(submitRequest(failed)).toBe(held);
    expect(submitRequest(IDLE)).toBeNull();

    // Save after a lost response: the same request, so the server answers duplicate.
    const again = deps({ kind: 'saved' });
    await save(again, submitRequest(failed));
    expect(again.build).not.toHaveBeenCalled();
    expect(vi.mocked(again.push).mock.calls[0]![0]).toBe(CHANGES);
  });

  it('U8 a held request is never sent to another account', async () => {
    const held = { changes: CHANGES, userId: 'user-a' };
    const other = deps(
      { kind: 'saved' },
      { currentUserId: vi.fn(() => Promise.resolve('user-b')) },
    );
    expect(await save(other, held)).toEqual({ status: { kind: 'accountChanged' }, held: null });
    expect(other.push).not.toHaveBeenCalled();

    // Still signed out, or no answer: keep holding it for a later Retry.
    const signedOut = deps(
      { kind: 'saved' },
      { currentUserId: vi.fn(() => Promise.resolve(null)) },
    );
    expect(await save(signedOut, held)).toEqual({
      status: { kind: 'failed', error: 'unauthenticated' },
      held,
    });
    const unreachable = deps(
      { kind: 'saved' },
      { currentUserId: vi.fn(() => Promise.reject(new Error('offline'))) },
    );
    expect(await save(unreachable, held)).toEqual({
      status: { kind: 'failed', error: 'network' },
      held,
    });
    expect(signedOut.push).not.toHaveBeenCalled();
    expect(unreachable.push).not.toHaveBeenCalled();

    // A fresh save while signed out builds nothing.
    const fresh = deps({ kind: 'saved' }, { currentUserId: vi.fn(() => Promise.resolve(null)) });
    expect(await save(fresh, null)).toEqual({
      status: { kind: 'failed', error: 'unauthenticated' },
      held: null,
    });
    expect(fresh.build).not.toHaveBeenCalled();
  });

  it('U3 editing the draft after a failure drops the held request', () => {
    const failed: SaveState = {
      status: { kind: 'failed', error: 'network' },
      held: { changes: CHANGES, userId: 'user-a' },
    };
    expect(afterEdit(failed, { sendsTheSame: false })).toEqual(IDLE);
    const saving: SaveState = { status: { kind: 'saving' }, held: null };
    expect(afterEdit(saving, { sendsTheSame: false })).toBe(saving);
  });

  it('U12 an edit that changes nothing that was sent keeps the held request (R21)', () => {
    const failed: SaveState = {
      status: { kind: 'failed', error: 'network' },
      held: { changes: CHANGES, userId: 'user-a' },
    };
    expect(afterEdit(failed, { sendsTheSame: true })).toBe(failed);
    expect(afterEdit(failed, { sendsTheSame: false })).toEqual(IDLE);
  });

  it('U4 a save refreshes the logbook and clears the draft; a failed refresh says "reload"', async () => {
    const ok = deps({ kind: 'saved' });
    expect(await save(ok, null)).toEqual({
      status: { kind: 'saved', refreshed: true, firearmRejected: false },
      held: null,
    });
    expect(ok.refresh).toHaveBeenCalledTimes(1);

    const stale = deps({ kind: 'saved' }, { refresh: vi.fn(() => Promise.resolve(false)) });
    expect((await save(stale, null)).status).toEqual({
      kind: 'saved',
      refreshed: false,
      firearmRejected: false,
    });

    const rejected = deps({
      kind: 'partlyRejected',
      rejected: [{ tableName: 'firearms', rowId: 'f1', reason: 'tombstoned' }],
    });
    expect((await save(rejected, null)).status).toEqual({
      kind: 'saved',
      refreshed: true,
      firearmRejected: true,
    });
    expect(rejected.refresh).toHaveBeenCalledTimes(1);

    // Only a firearm rejection is the firearm message; any one of several is.
    const row = (tableName: 'firearms' | 'sessions') => ({ tableName, rowId: 'r', reason: 'x' });
    const other = deps({ kind: 'partlyRejected', rejected: [row('sessions')] });
    expect((await save(other, null)).status).toMatchObject({ firearmRejected: false });
    const mixed = deps({ kind: 'partlyRejected', rejected: [row('sessions'), row('firearms')] });
    expect((await save(mixed, null)).status).toMatchObject({ firearmRejected: true });
  });
});

// Browser storage under every spelling the scans look for: the APIs by name, a
// computed `'…' + 'Storage'`, the Cache Storage API and cookies.
const BROWSER_STORAGE =
  /localStorage|sessionStorage|indexedDB|Storage['"`]|\bcaches\b|document\.cookie/i;

describe('N1 no shooting data in browser storage', () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const sources = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

  it('the entry modules never touch browser storage', () => {
    expect(sources.length).toBeGreaterThanOrEqual(3);
    for (const file of sources) {
      expect(readFileSync(path.join(dir, file), 'utf8')).not.toMatch(BROWSER_STORAGE);
    }
  });

  it('the scan catches each spelling of browser storage it looks for', () => {
    for (const planted of [
      'window.localStorage.getItem("x")',
      'sessionStorage.setItem',
      'indexedDB.open("db")',
      "window['local' + 'Storage']",
      'await caches.open("photos")',
      'document.cookie = "x"',
    ]) {
      expect(planted).toMatch(BROWSER_STORAGE);
    }
  });
});
