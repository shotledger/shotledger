// What one Apply (or Retry) does and what the page then shows
// (docs/specs/web-bulk-edit-spec.md B3, §3.2, R6–R8, R12–R17, R25), the bulk
// counterpart of entry/save.ts. Pure apart from the injected I/O; a built
// request is held in memory only, for Retry, and is never rebuilt once it
// may have been sent.
import type { ClientChange } from '@shotledger/shared/src/sync';
import type { SyncErrorKey } from '@shotledger/shared/src/sync-client/backoff';
import type {
  BulkContext,
  BulkError,
  BulkResult,
  BulkSummary,
  FirearmMove,
} from '@shotledger/shared/src/sync-client/bulk-edit';
import type { PushOutcome } from '@shotledger/shared/src/sync-client/direct-push';
import { classifySyncError } from '@shotledger/shared/src/sync-client/http';

export type ApplyStatus =
  | { kind: 'idle' }
  | { kind: 'applying' }
  | { kind: 'invalid'; errors: BulkError[] }
  | {
      kind: 'applied';
      summary: BulkSummary;
      /** Changes the server refused: rows deleted on another device. */
      refused: number;
      /**
       * A Change Firearm whose moved sessions were partly refused: the
       * firearms whose round counts to check by hand, target first (R25).
       */
      firearmsToCheck: string[];
      /** Add Tag's tag was deleted on another device meanwhile (R6). */
      tagGone: boolean;
      refreshed: boolean;
    }
  | {
      kind: 'failed';
      error: SyncErrorKey;
      /** The server answered, but not with an ack per change sent (R14). */
      unconfirmed?: true;
    }
  /** The held request belongs to another account than the one signed in now (R12). */
  | { kind: 'accountChanged'; userId: string };

/** A built request and what the page needs after it lands. */
export interface Built {
  changes: readonly ClientChange[];
  summary: BulkSummary;
  firearms: FirearmMove | null;
  tagId: string | null;
  /** The account it was built for; a held request goes to no other (R12). */
  userId: string;
}

export interface ApplyState {
  status: ApplyStatus;
  /** What Retry resends, as built. */
  held: Built | null;
}

export const IDLE: ApplyState = { status: { kind: 'idle' }, held: null };

export interface ApplyDeps {
  /** The signed-in user's id; null when the session is no longer valid. */
  currentUserId: () => Promise<string | null>;
  /** Pulls the rows the edit is built from afresh (B4). */
  loadContext: () => Promise<BulkContext>;
  build: (context: BulkContext) => BulkResult;
  push: (changes: readonly ClientChange[]) => Promise<PushOutcome>;
  /** Whether the tag is still live on the server. */
  tagLive: (tagId: string) => Promise<boolean>;
  /** Pulls the account again; false when that failed. */
  refresh: () => Promise<boolean>;
}

/** A lost response may have landed, so Retry resends the very same request. */
const HELD_ON: ReadonlySet<SyncErrorKey> = new Set(['network', 'unauthenticated']);

function failed(error: SyncErrorKey, held: Built | null, unconfirmed?: true): ApplyState {
  return {
    status: unconfirmed ? { kind: 'failed', error, unconfirmed } : { kind: 'failed', error },
    held,
  };
}

/**
 * The target and the refused sessions' sources: the counters a refused moved
 * session may have left off (R25). The web writes no correction, as the phone
 * writes none when its own push is refused.
 */
function firearmsToCheck(firearms: FirearmMove | null, refused: ReadonlySet<string>): string[] {
  if (firearms === null || refused.size === 0) return [];
  const ids = new Set<string>();
  if (firearms.target !== null) ids.add(firearms.target);
  for (const sessionId of refused) {
    const source = firearms.sources[sessionId];
    if (source !== undefined) ids.add(source);
  }
  return [...ids];
}

async function applyEdit(deps: ApplyDeps, built: Built): Promise<ApplyState> {
  const outcome = await deps.push(built.changes);
  if (outcome.kind === 'failed') {
    // A lost response, or an answer that does not match, may mean it landed.
    const mayHaveLanded = HELD_ON.has(outcome.error) || outcome.unconfirmed === true;
    return failed(outcome.error, mayHaveLanded ? built : null, outcome.unconfirmed);
  }
  const rejected = outcome.kind === 'partlyRejected' ? outcome.rejected : [];
  const refusedSessions = new Set(
    rejected.filter((r) => r.tableName === 'sessions').map((r) => r.rowId),
  );
  // A refused session row, or a refused new link, is a session that did not change (R17).
  const perSession = rejected.filter(
    (r) => r.tableName === 'sessions' || r.tableName === 'session_tags',
  ).length;
  // An unanswered check is not evidence the tag went: say nothing then.
  const tagGone = built.tagId !== null && !(await deps.tagLive(built.tagId).catch(() => true));
  const refreshed = await deps.refresh();
  return {
    status: {
      kind: 'applied',
      summary: { ...built.summary, changed: built.summary.changed - perSession },
      refused: rejected.length,
      firearmsToCheck: firearmsToCheck(built.firearms, refusedSessions),
      tagGone,
      refreshed,
    },
    held: null,
  };
}

/**
 * What a submit sends: the held request while there is one, so no key or
 * button builds a second request beside one that may have landed (R12, as
 * #669's R13). Kept as a function: it is the seam the tests reach the page's
 * submit wiring through (the page itself has no React tests).
 */
export function submitRequest(state: ApplyState): Built | null {
  return state.held;
}

/** The status when a held request meets another account (R12, R15). */
export function accountChanged(userId: string): ApplyState {
  return { status: { kind: 'accountChanged', userId }, held: null };
}

/** Apply with `held` null builds a fresh request; Retry passes the held one. */
export async function apply(deps: ApplyDeps, held: Built | null): Promise<ApplyState> {
  let userId: string | null;
  try {
    userId = await deps.currentUserId();
  } catch (error: unknown) {
    return failed(classifySyncError(error), held);
  }
  if (userId === null) return failed('unauthenticated', held);
  // Another account: its rows are not this one's to resend (as #669's R14).
  if (held !== null && held.userId !== userId) return accountChanged(userId);
  if (held !== null) return applyEdit(deps, held);

  let context: BulkContext;
  try {
    context = await deps.loadContext();
  } catch (error: unknown) {
    return failed(classifySyncError(error), null);
  }
  let result: BulkResult;
  try {
    result = deps.build(context);
  } catch {
    // A row the builder cannot read (R7): report it, never hang in "applying".
    return failed('unknown', null);
  }
  if (!result.ok) return { status: { kind: 'invalid', errors: result.errors }, held: null };
  const { changes, summary, firearms, tagId } = result;
  return applyEdit(deps, { changes, summary, firearms, tagId, userId });
}

/** An edit makes a held request stale: the next Apply pulls and builds afresh. */
export function afterEdit(state: ApplyState): ApplyState {
  return state.status.kind === 'applying' ? state : IDLE;
}

export function applyBlocked(online: boolean, state: ApplyState): 'offline' | 'applying' | null {
  if (!online) return 'offline';
  return state.status.kind === 'applying' ? 'applying' : null;
}
