import {
  PROTOCOL_VERSION,
  PUSH_BATCH_MAX,
  type ClientChange,
  type PullRequest,
  type SyncTableName,
} from '../sync/protocol';
import { APPLY_ORDER, sortChangesForApply } from './order';
import { buildClientChange } from './outbox';
import type { LocalStore, SyncTransport } from './ports';

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
}

export interface SyncCycleResult {
  status: 'ok' | 'partial';
  pulled: number;
  pushed: number;
  rejected: number;
  duplicates: number;
}

async function runPull(deps: SyncCycleDeps): Promise<{ pulled: number; drained: boolean }> {
  const cursors = await deps.store.readCursors();
  let pending: SyncTableName[] = [...APPLY_ORDER];
  let pulled = 0;

  for (let iteration = 0; iteration < MAX_PULL_ITERATIONS; iteration += 1) {
    const request: PullRequest = {
      protocolVersion: PROTOCOL_VERSION,
      // readCursors' Record is total over SyncTableName — a table never
      // synced reads as 0, so no fallback is needed here.
      tables: pending.map((tableName) => ({ tableName, cursor: cursors[tableName] })),
    };
    const response = await deps.transport.pull(request);

    // Apply BEFORE advancing any cursor: a throw here leaves the cursor
    // where it was, so the next cycle re-pulls the page. Applying is an
    // upsert, so at-least-once delivery is safe; at-most-once would not be.
    await deps.store.applyChanges(sortChangesForApply(response.changes));
    pulled += response.changes.length;

    const stillPending: SyncTableName[] = [];
    for (const next of response.nextCursors) {
      cursors[next.tableName] = next.cursor;
      await deps.store.setCursor(next.tableName, next.cursor);
      if (next.hasMore) stillPending.push(next.tableName);
    }

    pending = stillPending;
    if (pending.length === 0) return { pulled, drained: true };
  }

  return { pulled, drained: false };
}

async function runPush(
  deps: SyncCycleDeps,
): Promise<{ pushed: number; rejected: number; duplicates: number; drained: boolean }> {
  const batchMax = deps.pushBatchMax ?? PUSH_BATCH_MAX;
  let pushed = 0;
  let rejected = 0;
  let duplicates = 0;

  for (let iteration = 0; iteration < MAX_PUSH_ITERATIONS; iteration += 1) {
    const entries = await deps.store.readOutbox(batchMax);
    if (entries.length === 0) return { pushed, rejected, duplicates, drained: true };

    const changes: ClientChange[] = [];
    const byChangeId = new Map<string, (typeof entries)[number]>();

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
      if (entry.clientChangeId === null) {
        await deps.store.assignClientChangeId(entry, clientChangeId);
      }
      changes.push(change);
      byChangeId.set(clientChangeId, { ...entry, clientChangeId });
    }

    if (changes.length === 0) continue;

    const response = await deps.transport.push({
      protocolVersion: PROTOCOL_VERSION,
      changes,
    });

    for (const ack of response.acks) {
      const entry = byChangeId.get(ack.clientChangeId);
      if (entry === undefined) continue;
      if (ack.status === 'rejected') rejected += 1;
      else if (ack.status === 'duplicate') duplicates += 1;
      else pushed += 1;
      // Every ack the protocol defines clears the entry. `rejected` means the
      // server holds a tombstone for that row and no re-push could ever be
      // accepted; the tombstone reaches this device on the next pull.
      await deps.store.clearOutboxEntry(entry);
    }
  }

  return { pushed, rejected, duplicates, drained: false };
}

export async function runSyncCycle(deps: SyncCycleDeps): Promise<SyncCycleResult> {
  const pull = await runPull(deps);
  const push = await runPush(deps);

  return {
    status: pull.drained && push.drained ? 'ok' : 'partial',
    pulled: pull.pulled,
    pushed: push.pushed,
    rejected: push.rejected,
    duplicates: push.duplicates,
  };
}
