import type { ClientChange } from '../sync/protocol';
import type { LocalRowSnapshot, OutboxEntry } from './ports';

/**
 * Turning a queued outbox entry into a wire `ClientChange`
 * (docs/specs/sync-app-spec.md §6). Pure — the row snapshot is read by the
 * caller through the LocalStore port.
 */

/**
 * `null` when the row no longer exists locally (a hard delete): there is no
 * payload to send, so the caller drops the entry instead of pushing it.
 *
 * A tombstoned row sends `payload: null` — the protocol's ClientChangeSchema
 * refines that payload is null exactly when deletedAt is set, and a violation
 * would 400 the whole batch, not just this change.
 */
export function buildClientChange(
  entry: OutboxEntry,
  row: LocalRowSnapshot | undefined,
  clientChangeId: string,
): ClientChange | null {
  if (row === undefined) return null;

  const deleted = row.deletedAt !== null;
  return {
    clientChangeId,
    tableName: entry.tableName,
    rowId: entry.rowId,
    payload: deleted ? null : row.payload,
    deletedAt: row.deletedAt,
    updatedAt: row.updatedAt,
  };
}
