import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ClientChange } from '@shotledger/shared/src/sync';
import type { PushOutcome } from '@shotledger/shared/src/sync-client/direct-push';
import type { SettingsResult } from '@shotledger/shared/src/sync-client/settings-edit';
import { describe, expect, it, vi } from 'vitest';

import {
  afterEdit,
  afterSignIn,
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
    tableName: 'settings',
    rowId: 'skillClass',
    payload: { id: 'skillClass', value: '"3"' },
    deletedAt: null,
    updatedAt: '2026-10-07T10:00:00.000Z',
  },
];

function deps(outcome: PushOutcome, overrides: Partial<SaveDeps> = {}) {
  const built: SettingsResult = { ok: true, changes: CHANGES };
  return {
    currentUserId: vi.fn(() => Promise.resolve<string | null>('user-a')),
    build: vi.fn(() => built),
    push: vi.fn(() => Promise.resolve(outcome)),
    refresh: vi.fn(() => Promise.resolve(true)),
    ...overrides,
  } satisfies SaveDeps;
}

describe('saving settings', () => {
  it('U4 Save is blocked offline, while saving, and when nothing changed', () => {
    const saving: SaveState = { status: { kind: 'saving' }, held: null };
    expect(saveBlocked(true, IDLE, true)).toBeNull();
    expect(saveBlocked(false, IDLE, true)).toBe('offline');
    expect(saveBlocked(false, saving, true)).toBe('offline');
    expect(saveBlocked(true, saving, true)).toBe('saving');
    expect(saveBlocked(true, IDLE, false)).toBe('unchanged');
  });

  it('U5 a failed save holds the request; Retry resends it unchanged; an edit drops it', async () => {
    for (const error of ['network', 'unauthenticated'] as const) {
      const d = deps({ kind: 'failed', error });
      const failed = await save(d, null);
      expect(failed).toEqual({
        status: { kind: 'failed', error },
        held: { changes: CHANGES, userId: 'user-a' },
      });
      expect(d.refresh).not.toHaveBeenCalled();

      const retry = deps({ kind: 'saved' });
      const saved = await save(retry, failed.held);
      expect(retry.build).not.toHaveBeenCalled();
      expect(retry.push).toHaveBeenCalledWith(CHANGES);
      expect(saved.status).toEqual({ kind: 'saved', refreshed: true });

      expect(afterEdit(failed)).toEqual(IDLE);
    }
    // Errors no resend can fix hold nothing.
    for (const error of ['versionUnsupported', 'payloadTooLarge', 'unknown'] as const) {
      expect(await save(deps({ kind: 'failed', error }), null)).toEqual({
        status: { kind: 'failed', error },
        held: null,
      });
    }
    // An edit while saving does not lose the in-flight state.
    const saving: SaveState = { status: { kind: 'saving' }, held: null };
    expect(afterEdit(saving)).toBe(saving);
  });

  it('U6 a save refreshes the account; a rejected ack reads as failed', async () => {
    const d = deps({ kind: 'saved' });
    expect(await save(d, null)).toEqual({
      status: { kind: 'saved', refreshed: true },
      held: null,
    });
    expect(d.push).toHaveBeenCalledWith(CHANGES);
    expect(d.refresh).toHaveBeenCalledOnce();

    const noRefresh = deps({ kind: 'saved' }, { refresh: vi.fn(() => Promise.resolve(false)) });
    expect((await save(noRefresh, null)).status).toEqual({ kind: 'saved', refreshed: false });

    const rejected = deps({
      kind: 'partlyRejected',
      rejected: [{ tableName: 'settings', rowId: 'skillClass', reason: 'tombstoned' }],
    });
    expect(await save(rejected, null)).toEqual({
      status: { kind: 'failed', error: 'unknown' },
      held: null,
    });
    expect(rejected.refresh).toHaveBeenCalledOnce();
  });

  it('an invalid build sends nothing', async () => {
    const d = deps(
      { kind: 'saved' },
      {
        build: vi.fn((): SettingsResult => ({
          ok: false,
          errors: [{ key: 'skillClass', kind: 'notAllowed' }],
        })),
      },
    );
    expect(await save(d, null)).toEqual({
      status: { kind: 'invalid', errors: [{ key: 'skillClass', kind: 'notAllowed' }] },
      held: null,
    });
    expect(d.push).not.toHaveBeenCalled();
  });
});

describe('the held request (R8, as #669 R13/R14)', () => {
  const held = { changes: CHANGES, userId: 'user-a' };

  it('U7 while a request is held, every submit resends it rather than building another', async () => {
    const failed: SaveState = { status: { kind: 'failed', error: 'network' }, held };
    expect(submitRequest(failed)).toBe(held);
    expect(submitRequest(IDLE)).toBeNull();
    const again = deps({ kind: 'saved' });
    await save(again, submitRequest(failed));
    expect(again.build).not.toHaveBeenCalled();
    expect(vi.mocked(again.push).mock.calls[0]![0]).toBe(CHANGES);
  });

  it('U8 a held request is never sent to another account', async () => {
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
});

describe('review fixes (R9–R12)', () => {
  const held = { changes: CHANGES, userId: 'user-a' };

  it('U9 a build that throws fails the save instead of leaving it saving (R9)', async () => {
    const d = deps(
      { kind: 'saved' },
      {
        build: vi.fn((): SettingsResult => {
          throw new TypeError('crypto.randomUUID is not a function');
        }),
      },
    );
    expect(await save(d, null)).toEqual({
      status: { kind: 'failed', error: 'unknown' },
      held: null,
    });
    expect(d.push).not.toHaveBeenCalled();
  });

  it('U10 an answer that does not match the request is held for Retry (R10)', async () => {
    const d = deps({ kind: 'failed', error: 'unknown', unconfirmed: true });
    expect(await save(d, null)).toEqual({
      status: { kind: 'failed', error: 'unknown', unconfirmed: true },
      held,
    });
    // A plain unknown failure holds nothing.
    expect((await save(deps({ kind: 'failed', error: 'unknown' }), null)).held).toBeNull();
  });

  it('U11 saved without a refresh keeps Save off until reload, edits included (R11)', () => {
    const stale: SaveState = { status: { kind: 'saved', refreshed: false }, held: null };
    expect(saveBlocked(true, stale, true)).toBe('reload');
    expect(afterEdit(stale)).toBe(stale);
    const fresh: SaveState = { status: { kind: 'saved', refreshed: true }, held: null };
    expect(saveBlocked(true, fresh, true)).toBeNull();
    expect(afterEdit(fresh)).toEqual(IDLE);
  });

  it('U12 signing in again as the same account clears the notice and keeps the held request (R12)', () => {
    const signedOut: SaveState = { status: { kind: 'failed', error: 'unauthenticated' }, held };
    expect(afterSignIn(signedOut, 'same')).toEqual({ status: { kind: 'idle' }, held });
    // Another account: App reloads and remounts the page; nothing is kept.
    expect(afterSignIn(signedOut, 'switched')).toEqual(IDLE);
  });
});

describe('an empty build', () => {
  it('sends nothing and goes back to idle (R4)', async () => {
    const d = deps(
      { kind: 'saved' },
      { build: vi.fn((): SettingsResult => ({ ok: true, changes: [] })) },
    );
    expect(await save(d, null)).toEqual(IDLE);
    expect(d.push).not.toHaveBeenCalled();
    expect(d.refresh).not.toHaveBeenCalled();
  });
});

describe('N1 no settings in browser storage', () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));

  it('the settings modules never touch localStorage, sessionStorage or IndexedDB', () => {
    const sources = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.'));
    expect(sources.length).toBeGreaterThanOrEqual(2);
    for (const file of sources) {
      expect(readFileSync(path.join(dir, file), 'utf8'), file).not.toMatch(
        /localStorage|sessionStorage|indexedDB/i,
      );
    }
  });
});

describe('N8 no imports from the phone app', () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));

  it('the settings modules import the phone’s logic from shared/, never from app/src', () => {
    const sources = readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
    expect(sources.length).toBeGreaterThanOrEqual(4);
    for (const file of sources) {
      expect(readFileSync(path.join(dir, file), 'utf8'), file).not.toMatch(/app\/src\//);
    }
  });
});
