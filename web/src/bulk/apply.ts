// What one Apply (or Retry) does and what the page then shows
// (docs/specs/web-bulk-edit-spec.md B3, §3.2), the bulk counterpart of
// entry/save.ts. Pure apart from the injected I/O; the built request is held
// in memory only, for Retry.
import type { ClientChange } from '@shotledger/shared/src/sync';
import type { SyncErrorKey } from '@shotledger/shared/src/sync-client/backoff';
import type {
  BulkContext,
  BulkError,
  BulkResult,
  BulkSummary,
} from '@shotledger/shared/src/sync-client/bulk-edit';
import type { PushOutcome } from '@shotledger/shared/src/sync-client/direct-push';
import { classifySyncError } from '@shotledger/shared/src/sync-client/http';

export type ApplyStatus =
  | { kind: 'idle' }
  | { kind: 'applying' }
  | { kind: 'invalid'; errors: BulkError[] }
  | { kind: 'applied'; summary: BulkSummary; refused: number; refreshed: boolean }
  | { kind: 'failed'; error: SyncErrorKey };

/** A built request and what it changes. */
export interface Built {
  changes: readonly ClientChange[];
  summary: BulkSummary;
}

export interface ApplyState {
  status: ApplyStatus;
  /** The request Retry resends; only after a failure it may have survived. */
  held: Built | null;
}

export const IDLE: ApplyState = { status: { kind: 'idle' }, held: null };

export interface ApplyDeps {
  /** Pulls the rows the edit is built from afresh (B4). */
  loadContext: () => Promise<BulkContext>;
  build: (context: BulkContext) => BulkResult;
  push: (changes: readonly ClientChange[]) => Promise<PushOutcome>;
  /** Pulls the account again; false when that failed. */
  refresh: () => Promise<boolean>;
}

/** A lost response may have landed, so Retry resends the very same request. */
const HELD_ON: ReadonlySet<SyncErrorKey> = new Set(['network', 'unauthenticated']);

/** Apply with `held` null builds a fresh request; Retry passes the held one. */
export async function apply(deps: ApplyDeps, held: Built | null): Promise<ApplyState> {
  let request = held;
  if (request === null) {
    let context: BulkContext;
    try {
      context = await deps.loadContext();
    } catch (error: unknown) {
      return { status: { kind: 'failed', error: classifySyncError(error) }, held: null };
    }
    const built = deps.build(context);
    if (!built.ok) return { status: { kind: 'invalid', errors: built.errors }, held: null };
    request = { changes: built.changes, summary: built.summary };
  }

  const outcome = await deps.push(request.changes);
  if (outcome.kind === 'failed') {
    return {
      status: { kind: 'failed', error: outcome.error },
      held: HELD_ON.has(outcome.error) ? request : null,
    };
  }
  const refused = outcome.kind === 'partlyRejected' ? outcome.rejected.length : 0;
  const refreshed = await deps.refresh();
  return {
    status: { kind: 'applied', summary: request.summary, refused, refreshed },
    held: null,
  };
}

/** An edit makes the held request stale: the next Apply builds a new one. */
export function afterEdit(state: ApplyState): ApplyState {
  return state.status.kind === 'applying' ? state : IDLE;
}

export function applyBlocked(online: boolean, state: ApplyState): 'offline' | 'applying' | null {
  if (!online) return 'offline';
  return state.status.kind === 'applying' ? 'applying' : null;
}
