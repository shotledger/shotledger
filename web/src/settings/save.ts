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
import type { ReauthOutcome } from '../reauth';

export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'invalid'; errors: SettingsError[] }
  | { kind: 'saved'; refreshed: boolean }
  /** `unconfirmed`: the server answered, but not with an ack per change sent. */
  | { kind: 'failed'; error: SyncErrorKey; unconfirmed?: true }
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
    let built: SettingsResult;
    try {
      built = deps.build();
    } catch {
      // Nothing was sent, so there is nothing to hold (R9).
      return { status: { kind: 'failed', error: 'unknown' }, held: null };
    }
    if (!built.ok) return { status: { kind: 'invalid', errors: built.errors }, held: null };
    if (built.changes.length === 0) return IDLE;
    changes = built.changes;
  }

  const outcome = await deps.push(changes);
  if (outcome.kind === 'failed') {
    // A lost response, or an answer that does not match, may mean it landed (R10).
    const mayHaveLanded = HELD_ON.has(outcome.error) || outcome.unconfirmed === true;
    return {
      status: outcome.unconfirmed
        ? { kind: 'failed', error: outcome.error, unconfirmed: true }
        : { kind: 'failed', error: outcome.error },
      held: mayHaveLanded ? { changes, userId } : null,
    };
  }
  const refreshed = await deps.refresh();
  // Only a tombstoned row is rejected, and no ShotLedger client writes one.
  if (outcome.kind === 'partlyRejected') {
    return { status: { kind: 'failed', error: 'unknown' }, held: null };
  }
  return { status: { kind: 'saved', refreshed }, held: null };
}

/** Saved, but the page still shows the values from before the save (R11). */
const needsReload = (state: SaveState): boolean =>
  state.status.kind === 'saved' && !state.status.refreshed;

/**
 * An edit makes the held request stale: the next Save builds a new one. A
 * save the page could not refresh after stays until reload: its baseline is
 * stale, so a second Save would push the same keys again (R11).
 */
export function afterEdit(state: SaveState): SaveState {
  return state.status.kind === 'saving' || needsReload(state) ? state : IDLE;
}

/**
 * After the inline sign-in. The same account: the signed-out notice goes and
 * a held request stays for Retry. Another account: App reloads the logbook
 * and remounts this page, so nothing here survives anyway (R12).
 */
export function afterSignIn(state: SaveState, outcome: ReauthOutcome): SaveState {
  return outcome === 'same' ? { status: { kind: 'idle' }, held: state.held } : IDLE;
}

export function saveBlocked(
  online: boolean,
  state: SaveState,
  changed: boolean,
): 'offline' | 'saving' | 'reload' | 'unchanged' | null {
  if (!online) return 'offline';
  if (state.status.kind === 'saving') return 'saving';
  if (needsReload(state)) return 'reload';
  return changed ? null : 'unchanged';
}
