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
  | { kind: 'failed'; error: SyncErrorKey };

export interface SaveState {
  status: SaveStatus;
  /** The request Retry resends; only after a failure it may have survived. */
  held: readonly ClientChange[] | null;
}

export const IDLE: SaveState = { status: { kind: 'idle' }, held: null };

export interface SaveDeps {
  /** Pulls the firearms, their groups and the ammo lots afresh (C1). */
  loadContext: () => Promise<EntryContext>;
  build: (context: EntryContext) => EntryResult;
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
    let context: EntryContext;
    try {
      context = await deps.loadContext();
    } catch (error: unknown) {
      return { status: { kind: 'failed', error: classifySyncError(error) }, held: null };
    }
    const built = deps.build(context);
    if (!built.ok) return { status: { kind: 'invalid', errors: built.errors }, held: null };
    changes = built.changes;
  }

  const outcome = await deps.push(changes);
  if (outcome.kind === 'failed') {
    return {
      status: { kind: 'failed', error: outcome.error },
      held: HELD_ON.has(outcome.error) ? changes : null,
    };
  }
  const firearmRejected =
    outcome.kind === 'partlyRejected' &&
    outcome.rejected.some((rejected) => rejected.tableName === 'firearms');
  const refreshed = await deps.refresh();
  return { status: { kind: 'saved', refreshed, firearmRejected }, held: null };
}

/** An edit makes the held request stale: the next Save builds a new one. */
export function afterEdit(state: SaveState): SaveState {
  return state.status.kind === 'saving' ? state : IDLE;
}

export function saveBlocked(online: boolean, state: SaveState): 'offline' | 'saving' | null {
  if (!online) return 'offline';
  return state.status.kind === 'saving' ? 'saving' : null;
}
