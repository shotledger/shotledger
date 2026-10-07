// What one Save (or Retry) on the Settings page does
// (docs/specs/web-settings-edit-spec.md C8, as #669's entry/save.ts). Pure
// apart from the injected I/O; the built request is held in memory only.
import type { ClientChange } from '@shotledger/shared/src/sync';
import type { SyncErrorKey } from '@shotledger/shared/src/sync-client/backoff';
import type { PushOutcome } from '@shotledger/shared/src/sync-client/direct-push';
import type {
  SettingsError,
  SettingsResult,
} from '@shotledger/shared/src/sync-client/settings-edit';

export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'invalid'; errors: SettingsError[] }
  | { kind: 'saved'; refreshed: boolean }
  | { kind: 'failed'; error: SyncErrorKey };

export interface SaveState {
  status: SaveStatus;
  /** The request Retry resends; only after a failure it may have survived. */
  held: readonly ClientChange[] | null;
}

export const IDLE: SaveState = { status: { kind: 'idle' }, held: null };

export interface SaveDeps {
  build: () => SettingsResult;
  push: (changes: readonly ClientChange[]) => Promise<PushOutcome>;
  /** Pulls the account again; false when that failed. */
  refresh: () => Promise<boolean>;
}

/** A lost response may have landed, so Retry resends the very same request. */
const HELD_ON: ReadonlySet<SyncErrorKey> = new Set(['network', 'unauthenticated']);

/** Save with `held` null builds a fresh request; Retry passes the held one. */
export async function save(
  deps: SaveDeps,
  held: readonly ClientChange[] | null,
): Promise<SaveState> {
  let changes = held;
  if (changes === null) {
    const built = deps.build();
    if (!built.ok) return { status: { kind: 'invalid', errors: built.errors }, held: null };
    if (built.changes.length === 0) return IDLE;
    changes = built.changes;
  }

  const outcome = await deps.push(changes);
  if (outcome.kind === 'failed') {
    return {
      status: { kind: 'failed', error: outcome.error },
      held: HELD_ON.has(outcome.error) ? changes : null,
    };
  }
  const refreshed = await deps.refresh();
  // Only a tombstoned row is rejected, and no ShotLedger client writes one.
  if (outcome.kind === 'partlyRejected') {
    return { status: { kind: 'failed', error: 'unknown' }, held: null };
  }
  return { status: { kind: 'saved', refreshed }, held: null };
}

/** An edit makes the held request stale: the next Save builds a new one. */
export function afterEdit(state: SaveState): SaveState {
  return state.status.kind === 'saving' ? state : IDLE;
}

export function saveBlocked(
  online: boolean,
  state: SaveState,
  changed: boolean,
): 'offline' | 'saving' | 'unchanged' | null {
  if (!online) return 'offline';
  if (state.status.kind === 'saving') return 'saving';
  return changed ? null : 'unchanged';
}
