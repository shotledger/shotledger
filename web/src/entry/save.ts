// What one Save (or Retry) does and what the page then shows
// (docs/specs/web-series-entry-spec.md C2, §3.5). Pure apart from the
// injected I/O; the built request is held in memory only, for Retry.
import type { ClientChange } from '@shotledger/shared/src/sync';
import type { SyncErrorKey } from '@shotledger/shared/src/sync-client/backoff';
import type { PushOutcome } from '@shotledger/shared/src/sync-client/direct-push';
import { classifySyncError } from '@shotledger/shared/src/sync-client/http';
import type {
  EntryContext,
  EntryError,
  EntryResult,
} from '@shotledger/shared/src/sync-client/session-entry';

export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'invalid'; errors: EntryError[] }
  | { kind: 'saved'; refreshed: boolean; firearmRejected: boolean }
  /** `unconfirmed`: the server answered, but not with an ack per change sent. */
  | { kind: 'failed'; error: SyncErrorKey; unconfirmed?: true }
  /** The held request belongs to another account than the one signed in now. */
  | { kind: 'accountChanged' };

/** A request that may have landed, and the account it was built for (R14). */
export interface HeldRequest {
  changes: readonly ClientChange[];
  userId: string;
}

export interface SaveState {
  status: SaveStatus;
  held: HeldRequest | null;
}

export const IDLE: SaveState = { status: { kind: 'idle' }, held: null };

export interface SaveDeps {
  /** The signed-in user's id; null when the session is no longer valid. */
  currentUserId: () => Promise<string | null>;
  /** Pulls the firearms, their groups and the ammo lots afresh (C1). */
  loadContext: () => Promise<EntryContext>;
  build: (context: EntryContext) => EntryResult;
  push: (changes: readonly ClientChange[]) => Promise<PushOutcome>;
  /** Pulls the account again; false when that failed. */
  refresh: () => Promise<boolean>;
}

/** A lost response may have landed, so Retry resends the very same request. */
const HELD_ON: ReadonlySet<SyncErrorKey> = new Set(['network', 'unauthenticated']);

/**
 * What a submit sends: the held request while there is one, so no key or
 * button can build a second copy of a session that may have landed (R13).
 * Null means build a fresh one. Kept as a function: it is the seam U7 tests
 * the page's submit wiring through (the page itself has no React tests).
 */
export function submitRequest(state: SaveState): HeldRequest | null {
  return state.held;
}

/** Save with `held` null builds a fresh request; Retry passes the held one. */
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
    let context: EntryContext;
    try {
      context = await deps.loadContext();
    } catch (error: unknown) {
      return { status: { kind: 'failed', error: classifySyncError(error) }, held: null };
    }
    let built: EntryResult;
    try {
      built = deps.build(context);
    } catch {
      // Nothing was sent, so there is nothing to hold (R18).
      return { status: { kind: 'failed', error: 'unknown' }, held: null };
    }
    if (!built.ok) return { status: { kind: 'invalid', errors: built.errors }, held: null };
    changes = built.changes;
  }

  const outcome = await deps.push(changes);
  if (outcome.kind === 'failed') {
    // A lost response, or an answer that does not match, may mean it landed.
    const mayHaveLanded = HELD_ON.has(outcome.error) || outcome.unconfirmed === true;
    return {
      status: outcome.unconfirmed
        ? { kind: 'failed', error: outcome.error, unconfirmed: true }
        : { kind: 'failed', error: outcome.error },
      held: mayHaveLanded ? { changes, userId } : null,
    };
  }
  const firearmRejected =
    outcome.kind === 'partlyRejected' &&
    outcome.rejected.some((rejected) => rejected.tableName === 'firearms');
  const refreshed = await deps.refresh();
  return { status: { kind: 'saved', refreshed, firearmRejected }, held: null };
}

/** An edit makes the held request stale: the next Save builds a new one. */
export function afterEdit(
  state: SaveState,
  { sendsTheSame }: { sendsTheSame: boolean } = { sendsTheSame: false },
): SaveState {
  return state.status.kind === 'saving' || sendsTheSame ? state : IDLE;
}

export function saveBlocked(online: boolean, state: SaveState): 'offline' | 'saving' | null {
  if (!online) return 'offline';
  return state.status.kind === 'saving' ? 'saving' : null;
}
