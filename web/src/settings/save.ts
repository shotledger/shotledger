// What one Save (or Retry) on the Settings page does
// (docs/specs/web-settings-edit-spec.md C8, R8; as #669's entry/save.ts). Pure
// apart from the injected I/O; the built request is held in memory only.
import type { ClientChange } from '@shotledger/shared/src/sync';
import type { SyncErrorKey } from '@shotledger/shared/src/sync-client/backoff';
import type { PushOutcome } from '@shotledger/shared/src/sync-client/direct-push';
import { classifySyncError } from '@shotledger/shared/src/sync-client/http';
import type {
  SettingsError,
  SettingsResult,
} from '@shotledger/shared/src/sync-client/settings-edit';

import type { HeldRequest } from '../entry/save';

export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'invalid'; errors: SettingsError[] }
  | { kind: 'saved'; refreshed: boolean }
  | { kind: 'failed'; error: SyncErrorKey }
  /** The held request belongs to another account than the one signed in now. */
  | { kind: 'accountChanged' };

export interface SaveState {
  status: SaveStatus;
  held: HeldRequest | null;
}

export const IDLE: SaveState = { status: { kind: 'idle' }, held: null };

export interface SaveDeps {
  /** The signed-in user's id; null when the session is no longer valid. */
  currentUserId: () => Promise<string | null>;
  build: () => SettingsResult;
  push: (changes: readonly ClientChange[]) => Promise<PushOutcome>;
  /** Pulls the account again; false when that failed. */
  refresh: () => Promise<boolean>;
}

/** A lost response may have landed, so Retry resends the very same request. */
const HELD_ON: ReadonlySet<SyncErrorKey> = new Set(['network', 'unauthenticated']);

/** While a request is held, a submit resends it; null means build afresh. */
export function submitRequest(state: SaveState): HeldRequest | null {
  return state.held;
}

export async function save(deps: SaveDeps, held: HeldRequest | null): Promise<SaveState> {
  let userId: string | null;
  try {
    userId = await deps.currentUserId();
  } catch (error: unknown) {
    return { status: { kind: 'failed', error: classifySyncError(error) }, held };
  }
  if (userId === null) return { status: { kind: 'failed', error: 'unauthenticated' }, held };
  if (held !== null && held.userId !== userId) {
    return { status: { kind: 'accountChanged' }, held: null };
  }

  let changes: readonly ClientChange[];
  if (held !== null) {
    changes = held.changes;
  } else {
    const built = deps.build();
    if (!built.ok) return { status: { kind: 'invalid', errors: built.errors }, held: null };
    if (built.changes.length === 0) return IDLE;
    changes = built.changes;
  }

  const outcome = await deps.push(changes);
  if (outcome.kind === 'failed') {
    return {
      status: { kind: 'failed', error: outcome.error },
      held: HELD_ON.has(outcome.error) ? { changes, userId } : null,
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
