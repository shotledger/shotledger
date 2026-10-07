import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ClientChange } from '@shotledger/shared/src/sync';
import type { BulkContext, BulkResult } from '@shotledger/shared/src/sync-client/bulk-edit';
import type { PushOutcome } from '@shotledger/shared/src/sync-client/direct-push';
import { describe, expect, it, vi } from 'vitest';

import { afterEdit, apply, applyBlocked, IDLE, type ApplyDeps, type Built } from './apply';

const CHANGES: ClientChange[] = [
  {
    clientChangeId: '00000000-0000-4000-8000-000000000001',
    tableName: 'sessions',
    rowId: 's1',
    payload: { id: 's1', location: 'B' },
    deletedAt: null,
    updatedAt: '2026-10-07T10:00:00.000Z',
  },
];
const SUMMARY = { changed: 1, unchanged: 2, missing: 1 };
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

function deps(outcome: PushOutcome, overrides: Partial<ApplyDeps> = {}) {
  const built: BulkResult = { ok: true, changes: CHANGES, summary: SUMMARY };
  return {
    loadContext: vi.fn(() => Promise.resolve(CONTEXT)),
    build: vi.fn(() => built),
    push: vi.fn(() => Promise.resolve(outcome)),
    refresh: vi.fn(() => Promise.resolve(true)),
    ...overrides,
  } satisfies ApplyDeps;
}

describe('applying a bulk edit', () => {
  it('U5 offline blocks Apply and names the reason', () => {
    expect(applyBlocked(false, IDLE)).toBe('offline');
    expect(applyBlocked(true, IDLE)).toBeNull();
    expect(applyBlocked(true, { status: { kind: 'applying' }, held: null })).toBe('applying');
    expect(applyBlocked(false, { status: { kind: 'applying' }, held: null })).toBe('offline');
  });

  it('U6 a network failure holds the request; Retry resends the identical request', async () => {
    const failing = deps({ kind: 'failed', error: 'network' });
    const failed = await apply(failing, null);
    expect(failed).toEqual({
      status: { kind: 'failed', error: 'network' },
      held: { changes: CHANGES, summary: SUMMARY },
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
    expect(retried).toEqual({
      status: { kind: 'applied', summary: SUMMARY, refused: 0, refreshed: true },
      held: null,
    });
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

  it('U7 an answered push refreshes; refused changes are counted; a failed refresh says reload', async () => {
    const partly = deps({
      kind: 'partlyRejected',
      rejected: [
        { tableName: 'sessions', rowId: 's1', reason: 'tombstoned' },
        { tableName: 'sessions', rowId: 's2', reason: 'tombstoned' },
      ],
    });
    expect((await apply(partly, null)).status).toEqual({
      kind: 'applied',
      summary: SUMMARY,
      refused: 2,
      refreshed: true,
    });
    expect(partly.refresh).toHaveBeenCalledTimes(1);

    const stale = deps({ kind: 'saved' }, { refresh: vi.fn(() => Promise.resolve(false)) });
    expect((await apply(stale, null)).status).toMatchObject({ kind: 'applied', refreshed: false });
  });

  it('U8 an edit drops the held request, but not while applying', () => {
    const held: Built = { changes: CHANGES, summary: SUMMARY };
    expect(afterEdit({ status: { kind: 'failed', error: 'network' }, held })).toBe(IDLE);
    const applying = { status: { kind: 'applying' as const }, held: null };
    expect(afterEdit(applying)).toBe(applying);
  });
});

describe('N1 no shooting data in browser storage', () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const sources = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

  it('the bulk modules never touch localStorage, sessionStorage or IndexedDB', () => {
    expect(sources.length).toBeGreaterThanOrEqual(3);
    for (const file of sources) {
      expect(readFileSync(path.join(dir, file), 'utf8')).not.toMatch(
        /localStorage|sessionStorage|indexedDB/i,
      );
    }
  });
});
