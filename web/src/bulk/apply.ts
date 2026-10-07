// What one Apply (or Retry) does and what the page then shows
// (docs/specs/web-bulk-edit-spec.md B3, §3.2, R5–R8, R12–R18), the bulk
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
  CounterPlan,
} from '@shotledger/shared/src/sync-client/bulk-edit';
import type { PushOutcome } from '@shotledger/shared/src/sync-client/direct-push';
import { classifySyncError } from '@shotledger/shared/src/sync-client/http';
import type { Payload } from '@shotledger/shared/src/sync-client/rows';

export type ApplyStatus =
  | { kind: 'idle' }
  | { kind: 'applying' }
  | { kind: 'invalid'; errors: BulkError[] }
  | {
      kind: 'applied';
      summary: BulkSummary;
      /** Changes the server refused: rows deleted on another device. */
      refused: number;
      /** A correction took the refused sessions' rounds back out (R5). */
      corrected: boolean;
      /** Add Tag's tag was deleted on another device meanwhile (R6). */
      tagGone: boolean;
      refreshed: boolean;
    }
  | {
      kind: 'failed';
      error: SyncErrorKey;
      /** `correction`: the edit landed, the counters still need correcting. */
      stage: 'edit' | 'correction';
      /** The server answered, but not with an ack per change sent (R14). */
      unconfirmed?: true;
    }
  /**
   * The held request belongs to another account than the one signed in now
   * (R12). `correctionDropped`: it was a correction, so the other account's
   * counters still count the refused sessions (R15).
   */
  | { kind: 'accountChanged'; userId: string; correctionDropped: boolean }
  /** A correction could not be built after MAX_CORRECTION_ATTEMPTS tries (R16). */
  | { kind: 'correctionAbandoned' };

/** A built request and what the page needs after it lands. */
export interface Built {
  changes: readonly ClientChange[];
  summary: BulkSummary;
  counters: CounterPlan | null;
  tagId: string | null;
  /** The account it was built for; a held request goes to no other (R12). */
  userId: string;
}

export interface Refused {
  sessions: ReadonlySet<string>;
  firearms: ReadonlySet<string>;
  /** Refused rows that stood for one session each: sessions and new links (R17). */
  perSession: number;
  count: number;
}

/** What Retry resends. A correction is built once, then only resent. */
export type Held =
  | { stage: 'edit'; built: Built }
  | {
      stage: 'correction';
      built: Built;
      refused: Refused;
      changes: ClientChange[] | null;
      /** Builds that threw; a deterministic throw must not hold forever (R16). */
      attempts: number;
    };

export interface ApplyState {
  status: ApplyStatus;
  held: Held | null;
}

export const IDLE: ApplyState = { status: { kind: 'idle' }, held: null };

/** Builds of a correction that may throw before the page gives up on it. */
export const MAX_CORRECTION_ATTEMPTS = 3;

export interface ApplyDeps {
  /** The signed-in user's id; null when the session is no longer valid. */
  currentUserId: () => Promise<string | null>;
  /** Pulls the rows the edit is built from afresh (B4). */
  loadContext: () => Promise<BulkContext>;
  build: (context: BulkContext) => BulkResult;
  push: (changes: readonly ClientChange[]) => Promise<PushOutcome>;
  /** Pulls the firearms afresh for a correction. */
  loadFirearms: () => Promise<ReadonlyMap<string, Payload>>;
  correct: (
    plan: CounterPlan,
    refused: Refused,
    firearms: ReadonlyMap<string, Payload>,
  ) => ClientChange[];
  /** Whether the tag is still live on the server. */
  tagLive: (tagId: string) => Promise<boolean>;
  /** Pulls the account again; false when that failed. */
  refresh: () => Promise<boolean>;
}

/** A lost response may have landed, so Retry resends the very same request. */
const HELD_ON: ReadonlySet<SyncErrorKey> = new Set(['network', 'unauthenticated']);

function failed(
  error: SyncErrorKey,
  stage: 'edit' | 'correction',
  held: Held | null,
  unconfirmed?: true,
): ApplyState {
  return {
    status: unconfirmed
      ? { kind: 'failed', error, stage, unconfirmed }
      : { kind: 'failed', error, stage },
    held,
  };
}

async function finish(
  deps: ApplyDeps,
  built: Built,
  refused: Refused,
  corrected: boolean,
): Promise<ApplyState> {
  // An unanswered check is not evidence the tag went: say nothing then.
  const tagGone = built.tagId !== null && !(await deps.tagLive(built.tagId).catch(() => true));
  const refreshed = await deps.refresh();
  // A refused session row, or a refused new link, is a session that did not change.
  const summary = { ...built.summary, changed: built.summary.changed - refused.perSession };
  return {
    status: { kind: 'applied', summary, refused: refused.count, corrected, tagGone, refreshed },
    held: null,
  };
}

/**
 * The edit landed but some moved sessions were refused: take their rounds
 * back out of the counters (R5). Held at every failure, since the edit is
 * already on the server; once built, the correction is held before it is
 * sent (R18), so Retry only ever resends the identical one.
 */
async function correctCounters(
  deps: ApplyDeps,
  held: Extract<Held, { stage: 'correction' }>,
): Promise<ApplyState> {
  let changes = held.changes;
  if (changes === null) {
    let firearms: ReadonlyMap<string, Payload>;
    try {
      firearms = await deps.loadFirearms();
    } catch (error: unknown) {
      return failed(classifySyncError(error), 'correction', held);
    }
    try {
      changes = deps.correct(held.built.counters!, held.refused, firearms);
    } catch {
      const attempts = held.attempts + 1;
      if (attempts >= MAX_CORRECTION_ATTEMPTS) {
        return { status: { kind: 'correctionAbandoned' }, held: null };
      }
      return failed('unknown', 'correction', { ...held, attempts });
    }
    if (changes.length === 0) return finish(deps, held.built, held.refused, false);
  }
  const holding = { ...held, changes };
  let outcome: PushOutcome;
  try {
    outcome = await deps.push(changes);
  } catch {
    return failed('unknown', 'correction', holding);
  }
  if (outcome.kind === 'failed') {
    return failed(outcome.error, 'correction', holding, outcome.unconfirmed);
  }
  return finish(deps, held.built, held.refused, true);
}

async function applyEdit(deps: ApplyDeps, built: Built): Promise<ApplyState> {
  const outcome = await deps.push(built.changes);
  if (outcome.kind === 'failed') {
    // A lost response, or an answer that does not match, may mean it landed.
    const mayHaveLanded = HELD_ON.has(outcome.error) || outcome.unconfirmed === true;
    const held: Held | null = mayHaveLanded ? { stage: 'edit', built } : null;
    return failed(outcome.error, 'edit', held, outcome.unconfirmed);
  }
  const rejected = outcome.kind === 'partlyRejected' ? outcome.rejected : [];
  const of = (table: string) =>
    new Set(rejected.filter((r) => r.tableName === table).map((r) => r.rowId));
  const refused: Refused = {
    sessions: of('sessions'),
    firearms: of('firearms'),
    perSession: rejected.filter((r) => r.tableName === 'sessions' || r.tableName === 'session_tags')
      .length,
    count: rejected.length,
  };
  if (built.counters !== null && refused.sessions.size > 0) {
    return correctCounters(deps, {
      stage: 'correction',
      built,
      refused,
      changes: null,
      attempts: 0,
    });
  }
  return finish(deps, built, refused, false);
}

/**
 * What a submit sends: the held request while there is one, so no key or
 * button builds a second request beside one that may have landed (R12, as
 * #669's R13). Kept as a function: it is the seam the tests reach the page's
 * submit wiring through (the page itself has no React tests).
 */
export function submitRequest(state: ApplyState): Held | null {
  return state.held;
}

/** The status when a held request meets another account (R12, R15). */
export function accountChanged(held: Held | null, userId: string): ApplyState {
  return {
    status: {
      kind: 'accountChanged',
      userId,
      correctionDropped: held?.stage === 'correction',
    },
    held: null,
  };
}

/** Apply with `held` null builds a fresh request; Retry passes the held one. */
export async function apply(deps: ApplyDeps, held: Held | null): Promise<ApplyState> {
  let userId: string | null;
  try {
    userId = await deps.currentUserId();
  } catch (error: unknown) {
    return failed(classifySyncError(error), held?.stage ?? 'edit', held);
  }
  if (userId === null) return failed('unauthenticated', held?.stage ?? 'edit', held);
  // Another account: its rows are not this one's to resend (as #669's R14).
  if (held !== null && held.built.userId !== userId) return accountChanged(held, userId);
  if (held?.stage === 'correction') return correctCounters(deps, held);
  if (held?.stage === 'edit') return applyEdit(deps, held.built);

  let context: BulkContext;
  try {
    context = await deps.loadContext();
  } catch (error: unknown) {
    return failed(classifySyncError(error), 'edit', null);
  }
  let result: BulkResult;
  try {
    result = deps.build(context);
  } catch {
    // A row the builder cannot read (R7): report it, never hang in "applying".
    return failed('unknown', 'edit', null);
  }
  if (!result.ok) return { status: { kind: 'invalid', errors: result.errors }, held: null };
  const { changes, summary, counters, tagId } = result;
  return applyEdit(deps, { changes, summary, counters, tagId, userId });
}

/** An edit makes a held request stale; a pending correction is never dropped. */
export function afterEdit(state: ApplyState): ApplyState {
  if (state.status.kind === 'applying' || state.held?.stage === 'correction') return state;
  return IDLE;
}

export function applyBlocked(online: boolean, state: ApplyState): 'offline' | 'applying' | null {
  if (!online) return 'offline';
  return state.status.kind === 'applying' ? 'applying' : null;
}
