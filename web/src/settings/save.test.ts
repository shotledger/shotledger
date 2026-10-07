import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ClientChange } from '@shotledger/shared/src/sync';
import type { PushOutcome } from '@shotledger/shared/src/sync-client/direct-push';
import type { SettingsResult } from '@shotledger/shared/src/sync-client/settings-edit';
import { describe, expect, it, vi } from 'vitest';

import { afterEdit, IDLE, save, saveBlocked, type SaveDeps, type SaveState } from './save';

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
      expect(failed).toEqual({ status: { kind: 'failed', error }, held: CHANGES });
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
