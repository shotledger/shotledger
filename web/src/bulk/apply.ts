// What one Apply (or Retry) does and what the page then shows
// (docs/specs/web-bulk-edit-spec.md B3, §3.2, R5–R8), the bulk counterpart
// of entry/save.ts. Pure apart from the injected I/O; a built request is held
// in memory only, for Retry, and is never rebuilt once it may have been sent.
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
    };

/** A built request and what the page needs after it lands. */
export interface Built {
  changes: readonly ClientChange[];
  summary: BulkSummary;
  counters: CounterPlan | null;
  tagId: string | null;
}

export interface Refused {
  sessions: ReadonlySet<string>;
  firearms: ReadonlySet<string>;
  count: number;
}

/** What Retry resends. A correction is built once, then only resent. */
export type Held =
  | { stage: 'edit'; built: Built }
  | { stage: 'correction'; built: Built; refused: Refused; changes: ClientChange[] | null };

export interface ApplyState {
  status: ApplyStatus;
  held: Held | null;
}

export const IDLE: ApplyState = { status: { kind: 'idle' }, held: null };

export interface ApplyDeps {
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

const failed = (error: SyncErrorKey, stage: 'edit' | 'correction', held: Held | null) => ({
  status: { kind: 'failed' as const, error, stage },
  held,
});

async function finish(
  deps: ApplyDeps,
  built: Built,
  refused: number,
  corrected: boolean,
): Promise<ApplyState> {
  // An unanswered check is not evidence the tag went: say nothing then.
  const tagGone = built.tagId !== null && !(await deps.tagLive(built.tagId).catch(() => true));
  const refreshed = await deps.refresh();
  return {
    status: { kind: 'applied', summary: built.summary, refused, corrected, tagGone, refreshed },
    held: null,
  };
}

/**
 * The edit landed but some moved sessions were refused: take their rounds
 * back out of the counters (R5). Held at every failure, since the edit is
 * already on the server; once built, Retry resends the identical correction.
 */
async function correctCounters(
  deps: ApplyDeps,
  held: Extract<Held, { stage: 'correction' }>,
): Promise<ApplyState> {
  let changes = held.changes;
  if (changes === null) {
    try {
      changes = deps.correct(held.built.counters!, held.refused, await deps.loadFirearms());
    } catch (error: unknown) {
      return failed(classifySyncError(error), 'correction', held);
    }
    if (changes.length === 0) return finish(deps, held.built, held.refused.count, false);
  }
  const outcome = await deps.push(changes);
  if (outcome.kind === 'failed') {
    return failed(outcome.error, 'correction', { ...held, changes });
  }
  return finish(deps, held.built, held.refused.count, true);
}

async function applyEdit(deps: ApplyDeps, built: Built): Promise<ApplyState> {
  const outcome = await deps.push(built.changes);
  if (outcome.kind === 'failed') {
    const held: Held | null = HELD_ON.has(outcome.error) ? { stage: 'edit', built } : null;
    return failed(outcome.error, 'edit', held);
  }
  const rejected = outcome.kind === 'partlyRejected' ? outcome.rejected : [];
  const of = (table: string) =>
    new Set(rejected.filter((r) => r.tableName === table).map((r) => r.rowId));
  const refused: Refused = {
    sessions: of('sessions'),
    firearms: of('firearms'),
    count: rejected.length,
  };
  if (built.counters !== null && refused.sessions.size > 0) {
    return correctCounters(deps, { stage: 'correction', built, refused, changes: null });
  }
  return finish(deps, built, refused.count, false);
}

/** Apply with `held` null builds a fresh request; Retry passes the held one. */
export async function apply(deps: ApplyDeps, held: Held | null): Promise<ApplyState> {
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
  return applyEdit(deps, { changes, summary, counters, tagId });
}

/** An edit makes a held request stale; a pending correction is never dropped. */
export function afterEdit(state: ApplyState): ApplyState {
  if (state.status.kind === 'applying' || state.held?.stage === 'correction') return state;
  return IDLE;
}

export function applyBlocked(
  online: boolean,
  state: ApplyState,
): 'offline' | 'applying' | 'correcting' | null {
  if (!online) return 'offline';
  if (state.status.kind === 'applying') return 'applying';
  // A new edit would drop the pending correction: only Retry goes on.
  return state.held?.stage === 'correction' ? 'correcting' : null;
}
