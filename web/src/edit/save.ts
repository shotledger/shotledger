// What one Save, Delete or Retry does and what the page then shows
// (docs/specs/web-session-edit-spec.md E6–E9), the edit counterpart of
// entry/save.ts. Pure apart from the injected I/O; a built request is held in
// memory only, for Retry, and is never rebuilt once it may have been sent.
import type { ClientChange } from '@shotledger/shared/src/sync';
import type { SyncErrorKey } from '@shotledger/shared/src/sync-client/backoff';
import type { PushOutcome } from '@shotledger/shared/src/sync-client/direct-push';
import { classifySyncError } from '@shotledger/shared/src/sync-client/http';
import type {
  CounterMove,
  EditContext,
  EditError,
  EditResult,
} from '@shotledger/shared/src/sync-client/session-edit';

export type EditAction = 'save' | 'delete';

export type EditStatus =
  | { kind: 'idle' }
  | { kind: 'working'; action: EditAction }
  /** Nothing sent: a field or series error, or nothing to change. */
  | { kind: 'invalid'; errors: EditError[] }
  /** A row the action touches changed on another device; `fresh` refills the form (E6, R10). */
  | { kind: 'stale'; action: EditAction; fresh: EditContext }
  /** The session was deleted on another device; nothing sent (E6). */
  | { kind: 'gone'; refreshed: boolean }
  | {
      kind: 'done';
      action: EditAction;
      /** Changes the server refused: rows deleted on another device (E8). */
      refused: number;
      /** Firearms whose counters moved for a refused row, to check by hand (E8). */
      firearmsToCheck: string[];
      refreshed: boolean;
    }
  /** `unconfirmed`: the server answered, but not with an ack per change sent. */
  | { kind: 'failed'; error: SyncErrorKey; unconfirmed?: true }
  /** The held request belongs to another account than the one signed in now. */
  | { kind: 'accountChanged' };

/** A built request and what the page needs after it lands. */
export interface Built {
  action: EditAction;
  changes: readonly ClientChange[];
  moved: readonly CounterMove[];
  /** The account it was built for; a held request goes to no other. */
  userId: string;
}

export interface EditState {
  status: EditStatus;
  /** What Retry resends, as built. */
  held: Built | null;
}

export const IDLE: EditState = { status: { kind: 'idle' }, held: null };

export interface EditDeps {
  /** The signed-in user's id; null when the session is no longer valid. */
  currentUserId: () => Promise<string | null>;
  /** Pulls the rows the action is built from afresh (E6). */
  loadContext: () => Promise<EditContext>;
  build: (fresh: EditContext) => EditResult;
  push: (changes: readonly ClientChange[]) => Promise<PushOutcome>;
  /** Pulls the account again; false when that failed. */
  refresh: () => Promise<boolean>;
}

/** A lost response may have landed, so Retry resends the very same request. */
const HELD_ON: ReadonlySet<SyncErrorKey> = new Set(['network', 'unauthenticated']);

function failed(error: SyncErrorKey, held: Built | null, unconfirmed?: true): EditState {
  return {
    status: unconfirmed ? { kind: 'failed', error, unconfirmed } : { kind: 'failed', error },
    held,
  };
}

/** The firearms whose move was made for a row the server refused (E8). */
function firearmsToCheck(moved: readonly CounterMove[], refused: ReadonlySet<string>): string[] {
  return moved
    .filter((move) => move.rows.some((row) => refused.has(`${row.tableName}:${row.rowId}`)))
    .map((move) => move.firearmId);
}

async function send(deps: EditDeps, built: Built): Promise<EditState> {
  const outcome = await deps.push(built.changes);
  if (outcome.kind === 'failed') {
    // A lost response, or an answer that does not match, may mean it landed.
    const mayHaveLanded = HELD_ON.has(outcome.error) || outcome.unconfirmed === true;
    return failed(outcome.error, mayHaveLanded ? built : null, outcome.unconfirmed);
  }
  const rejected = outcome.kind === 'partlyRejected' ? outcome.rejected : [];
  const refused = new Set(rejected.map((r) => `${r.tableName}:${r.rowId}`));
  const refreshed = await deps.refresh();
  return {
    status: {
      kind: 'done',
      action: built.action,
      refused: rejected.length,
      firearmsToCheck: firearmsToCheck(built.moved, refused),
      refreshed,
    },
    held: null,
  };
}

/**
 * What a submit sends: the held request while there is one, so no key or
 * button builds a second request beside one that may have landed (#669 R13).
 */
export function submitRequest(state: EditState): Built | null {
  return state.held;
}

/** Save or Delete with `held` null builds a fresh request; Retry passes the held one. */
export async function run(
  deps: EditDeps,
  action: EditAction,
  held: Built | null,
): Promise<EditState> {
  let userId: string | null;
  try {
    userId = await deps.currentUserId();
  } catch (error: unknown) {
    return failed(classifySyncError(error), held);
  }
  if (userId === null) return failed('unauthenticated', held);
  // Another account: its rows are not this one's to resend (#669 R14).
  if (held !== null && held.userId !== userId) {
    return { status: { kind: 'accountChanged' }, held: null };
  }
  if (held !== null) return send(deps, held);

  let fresh: EditContext;
  try {
    fresh = await deps.loadContext();
  } catch (error: unknown) {
    return failed(classifySyncError(error), null);
  }
  let result: EditResult;
  try {
    result = deps.build(fresh);
  } catch {
    // Nothing was sent, so there is nothing to hold (#669 R18).
    return failed('unknown', null);
  }
  if (!result.ok) {
    // The builder reports stale and gone alone.
    const is = (kind: string) => result.errors.some((error) => error.kind === kind);
    if (is('stale')) return { status: { kind: 'stale', action, fresh }, held: null };
    if (is('gone')) {
      return { status: { kind: 'gone', refreshed: await deps.refresh() }, held: null };
    }
    return { status: { kind: 'invalid', errors: result.errors }, held: null };
  }
  return send(deps, { action, changes: result.changes, moved: result.moved, userId });
}

/** An edit makes a held request stale: the next Save pulls and builds afresh. */
export function afterEdit(state: EditState): EditState {
  return state.status.kind === 'working' ? state : IDLE;
}

export function editBlocked(online: boolean, state: EditState): 'offline' | 'working' | null {
  if (!online) return 'offline';
  return state.status.kind === 'working' ? 'working' : null;
}

/** Where the page goes once an action is through: the detail, or the list (E9). */
export function destination(sessionId: string, status: EditStatus): string | null {
  if (status.kind === 'gone') return '#sessions';
  if (status.kind !== 'done') return null;
  return status.action === 'delete' ? '#sessions' : `#sessions/${encodeURIComponent(sessionId)}`;
}

/** Delete asks first (§3.2): only a confirmation sends, and Cancel sends nothing (U8). */
export type DeleteStep = 'closed' | 'asking';

export function deleteStep(
  step: DeleteStep,
  event: 'ask' | 'cancel' | 'confirm',
): { step: DeleteStep; send: boolean } {
  if (event === 'ask') return { step: 'asking', send: false };
  return { step: 'closed', send: event === 'confirm' && step === 'asking' };
}
