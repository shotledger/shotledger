import {
  PROTOCOL_VERSION,
  PUSH_BATCH_MAX,
  type ClientChange,
  type PullRequest,
  type SyncTableName,
} from '../sync/protocol';
import { familyKind, familyRoot, ownerOf, type RowRef } from '../sync/family';
import { REJECTED_FAMILY, REJECTED_INVALID_PAYLOAD, REJECTED_TOMBSTONED } from '../sync/merge';
import { APPLY_ORDER, sortChangesForApply } from './order';
import { buildClientChange } from './outbox';
import { filterShadowedChanges, rowKey, tombstoneFromRejection } from './shadow';
import type { LocalStore, OutboxEntry, SyncTransport } from './ports';

/**
 * One strict pull -> apply -> push -> ack cycle (docs/specs/sync-app-spec.md
 * §5). ADR 0003's "no concurrent independent loops" is the caller's job to
 * uphold; this function makes it easy by doing exactly one cycle per call.
 */

/**
 * Page caps. A server that always answers `hasMore: true` (or a push that
 * never drains) ends the cycle as `partial` instead of spinning forever.
 */
export const MAX_PULL_ITERATIONS = 100;
export const MAX_PUSH_ITERATIONS = 100;

export interface SyncCycleDeps {
  store: LocalStore;
  transport: SyncTransport;
  /** Injected so no module in `shared/` generates ids or reads a clock. */
  newId: () => string;
  pushBatchMax?: number;
  /**
   * Called once per `invalid_payload` refusal, as its outbox entry clears.
   * The entry is gone at that point, so a batch that fails later in the
   * cycle must not take the refusal with it (spec §2.3, C3).
   */
  onRefused?: () => void;
}

export interface SyncCycleResult {
  status: 'ok' | 'partial';
  pulled: number;
  /** Pulled rows dropped because a local edit was still queued (shadow.ts). */
  shadowed: number;
  pushed: number;
  rejected: number;
  /**
   * Changes the server refused as malformed (`invalid_payload`). The row
   * stays on this device, unsynced, until it is edited again or a pull of
   * the same row replaces it (docs/specs/sync-payload-validation-spec.md
   * §2.3).
   */
  invalid: number;
  /**
   * Entries held back this cycle because a row of their family was refused:
   * `family_refused` acks and entries never sent
   * (docs/specs/sync-family-refusal-spec.md §2.3). They stay queued.
   */
  held: number;
  duplicates: number;
}

/**
 * Drops from the refused set every refused row whose key is in `keys` (a
 * local write re-queued it, or a pull replaced it); if any left, every held
 * entry is released, to be judged again (§2.3 steps 1 and Pulls).
 */
async function releaseRefusals(store: LocalStore, keys: ReadonlySet<string>): Promise<void> {
  const fixed = (await store.readRefused()).filter((ref) =>
    keys.has(rowKey(ref.tableName, ref.rowId)),
  );
  if (fixed.length === 0) return;
  await store.removeRefused(fixed);
  await store.releaseHeld();
}

/**
 * What a refused row blocks: the root session of every refused session-family
 * row, and every refused firearm (§2.3 step 2). A refused row of a firearm
 * blocks only itself, and it is not queued.
 */
async function readBlocked(
  store: LocalStore,
): Promise<{ sessions: Set<string>; firearms: Set<string> }> {
  const sessions = new Set<string>();
  const firearms = new Set<string>();
  for (const ref of await store.readRefused()) {
    if (ref.tableName === 'firearms') firearms.add(ref.rowId);
    if (familyKind(ref.tableName) !== 'session') continue;
    const row = await store.readRow(ref.tableName, ref.rowId);
    const root = await familyRoot(ref, row?.payload, (parent) => readPayload(store, parent));
    sessions.add(rowKey(root.tableName, root.rowId));
  }
  return { sessions, firearms };
}

async function readPayload(store: LocalStore, ref: RowRef): Promise<unknown> {
  return (await store.readRow(ref.tableName, ref.rowId))?.payload;
}

async function isBlocked(
  store: LocalStore,
  entry: OutboxEntry,
  payload: unknown,
  blocked: { sessions: ReadonlySet<string>; firearms: ReadonlySet<string> },
): Promise<boolean> {
  if (familyKind(entry.tableName) === 'firearm') {
    const firearmId =
      entry.tableName === 'firearms' ? entry.rowId : ownerOf(entry.tableName, payload)?.rowId;
    return blocked.firearms.has(firearmId ?? '');
  }
  // No walk at all while nothing is refused, the common case (N4). A table
  // with no family is its own root, which no session root equals.
  if (blocked.sessions.size === 0) return false;
  const root = await familyRoot(entry, payload, (parent) => readPayload(store, parent));
  return blocked.sessions.has(rowKey(root.tableName, root.rowId));
}

async function runPull(
  deps: SyncCycleDeps,
): Promise<{ pulled: number; shadowed: number; drained: boolean }> {
  const cursors = await deps.store.readCursors();
  let pending: SyncTableName[] = [...APPLY_ORDER];
  let pulled = 0;
  let shadowed = 0;

  for (let iteration = 0; iteration < MAX_PULL_ITERATIONS; iteration += 1) {
    const request: PullRequest = {
      protocolVersion: PROTOCOL_VERSION,
      // readCursors' Record is total over SyncTableName — a table never
      // synced reads as 0, so no fallback is needed here.
      tables: pending.map((tableName) => ({ tableName, cursor: cursors[tableName] })),
    };
    const response = await deps.transport.pull(request);

    // A row with an unsent local edit keeps that edit; the push later in
    // this cycle sends it and the server's LWW settles it (shadow.ts).
    const pendingKeys = await deps.store.pendingRowKeys();
    const applicable = filterShadowedChanges(response.changes, pendingKeys);
    shadowed += response.changes.length - applicable.length;

    // Apply BEFORE advancing any cursor: a throw here leaves the cursor
    // where it was, so the next cycle re-pulls the page. Applying is an
    // upsert, so at-least-once delivery is safe; at-most-once would not be.
    await deps.store.applyChanges(sortChangesForApply(applicable));
    pulled += applicable.length;
    // Another device's version replaced a refused row, and it is valid: the
    // server stored it. Its family is released (§2.3, Pulls).
    await releaseRefusals(
      deps.store,
      new Set(applicable.map((change) => rowKey(change.tableName, change.rowId))),
    );

    const stillPending: SyncTableName[] = [];
    for (const next of response.nextCursors) {
      cursors[next.tableName] = next.cursor;
      await deps.store.setCursor(next.tableName, next.cursor);
      if (next.hasMore) stillPending.push(next.tableName);
    }

    pending = stillPending;
    if (pending.length === 0) return { pulled, shadowed, drained: true };
  }

  return { pulled, shadowed, drained: false };
}

async function runPush(deps: SyncCycleDeps): Promise<{
  pushed: number;
  rejected: number;
  invalid: number;
  held: number;
  duplicates: number;
  drained: boolean;
}> {
  const batchMax = deps.pushBatchMax ?? PUSH_BATCH_MAX;
  let pushed = 0;
  let rejected = 0;
  let invalid = 0;
  let held = 0;
  let duplicates = 0;

  // Step 1: a refused row queued again (a local write since the refusal)
  // leaves the refused set, and its family is released.
  await releaseRefusals(deps.store, await deps.store.pendingRowKeys());

  for (let iteration = 0; iteration < MAX_PUSH_ITERATIONS; iteration += 1) {
    const entries = await deps.store.readOutbox(batchMax);
    if (entries.length === 0) {
      return { pushed, rejected, invalid, held, duplicates, drained: true };
    }
    const blocked = await readBlocked(deps.store);

    const changes: ClientChange[] = [];
    const sent = new Map<string, { entry: OutboxEntry; change: ClientChange }>();

    for (const entry of entries) {
      const row = await deps.store.readRow(entry.tableName, entry.rowId);
      const clientChangeId = entry.clientChangeId ?? deps.newId();
      const change = buildClientChange(entry, row, clientChangeId);
      if (change === null) {
        // Hard-deleted locally: nothing to send, and leaving it queued would
        // stall the outbox forever.
        await deps.store.clearOutboxEntry(entry);
        continue;
      }
      // Step 2: a live row of a blocked family stays queued, unsent. A
      // tombstone always goes (C3).
      if (
        change.deletedAt === null &&
        // The local row's payload, which a tombstone keeps: its family is
        // known, and the deletedAt check alone is what lets it through.
        (await isBlocked(deps.store, entry, row!.payload, blocked))
      ) {
        await deps.store.holdOutboxEntry(entry, false);
        held += 1;
        continue;
      }
      if (entry.clientChangeId === null) {
        await deps.store.assignClientChangeId(entry, clientChangeId);
      }
      changes.push(change);
      sent.set(clientChangeId, { entry: { ...entry, clientChangeId }, change });
    }

    if (changes.length === 0) continue;

    const response = await deps.transport.push({
      protocolVersion: PROTOCOL_VERSION,
      changes,
    });

    for (const ack of response.acks) {
      const record = sent.get(ack.clientChangeId);
      if (record === undefined) continue;
      const { entry, change } = record;
      // Step 4: refused with its family, so not lost. Held, and sent as a
      // new change once released: the server keeps the old id's refusal.
      if (ack.reason === REJECTED_FAMILY) {
        await deps.store.holdOutboxEntry(entry, true);
        held += 1;
        continue;
      }
      // A refusal or its replay: the user is told, whichever ack carried it.
      if (ack.reason === REJECTED_INVALID_PAYLOAD) invalid += 1;
      else if (ack.status === 'rejected') {
        rejected += 1;
        // The server holds a tombstone for this row, and the pull that
        // shadowed it has already moved the cursor past it — so the local
        // tombstone has to be written here or it never arrives (shadow.ts).
        if (ack.reason === REJECTED_TOMBSTONED) {
          await deps.store.applyChanges([tombstoneFromRejection(entry, change.updatedAt)]);
        }
      } else if (ack.status === 'duplicate') duplicates += 1;
      else pushed += 1;
      // Every ack the protocol defines clears the entry: applied and
      // duplicate are on the server, and a rejection can never be accepted.
      await deps.store.clearOutboxEntry(entry);
      if (ack.reason === REJECTED_INVALID_PAYLOAD) {
        // Step 3: remembered, so its family is held until it is fixed.
        await deps.store.addRefused({ tableName: entry.tableName, rowId: entry.rowId });
        deps.onRefused?.();
      }
    }
  }

  return { pushed, rejected, invalid, held, duplicates, drained: false };
}

export async function runSyncCycle(deps: SyncCycleDeps): Promise<SyncCycleResult> {
  const pull = await runPull(deps);
  const push = await runPush(deps);

  return {
    status: pull.drained && push.drained ? 'ok' : 'partial',
    pulled: pull.pulled,
    shadowed: pull.shadowed,
    pushed: push.pushed,
    rejected: push.rejected,
    invalid: push.invalid,
    held: push.held,
    duplicates: push.duplicates,
  };
}
