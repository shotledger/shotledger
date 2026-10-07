// One web Save → one /sync/push, read back into what the page says
// (docs/specs/web-series-entry-spec.md §3.4). No outbox and no retry here:
// the caller holds the changes and resends them only when the user asks (C2).
import type { ClientChange, PushAck, SyncTableName } from '../sync/protocol';
import type { SyncErrorKey } from './backoff';
import { classifySyncError } from './http';
import type { SyncTransport } from './ports';

export interface RejectedChange {
  tableName: SyncTableName;
  rowId: string;
  reason: string;
}

export type PushOutcome =
  | { kind: 'saved' }
  | { kind: 'partlyRejected'; rejected: RejectedChange[] }
  /** `unconfirmed`: the server answered with acks that do not match what was
   * sent, so the push may have landed; the caller should hold it for Retry. */
  | { kind: 'failed'; error: SyncErrorKey; unconfirmed?: true };

/** A duplicate carrying a reason replays a rejection; it is not a save. */
const isRejection = (ack: PushAck): boolean =>
  ack.status === 'rejected' || (ack.status === 'duplicate' && ack.reason !== undefined);

export async function pushChanges(
  transport: Pick<SyncTransport, 'push'>,
  protocolVersion: number,
  changes: readonly ClientChange[],
): Promise<PushOutcome> {
  let acks: PushAck[];
  try {
    ({ acks } = await transport.push({ protocolVersion, changes: [...changes] }));
  } catch (error: unknown) {
    return { kind: 'failed', error: classifySyncError(error) };
  }

  // Exactly one ack per sent change, or nothing is read as saved.
  // Equal counts and every sent id acked leave no room for a repeat.
  const byId = new Map(acks.map((ack) => [ack.clientChangeId, ack]));
  const unconfirmed = { kind: 'failed', error: 'unknown', unconfirmed: true } as const;
  if (acks.length !== changes.length) return unconfirmed;
  const rejected: RejectedChange[] = [];
  for (const change of changes) {
    const ack = byId.get(change.clientChangeId);
    if (ack === undefined) return unconfirmed;
    if (isRejection(ack)) {
      rejected.push({
        tableName: change.tableName,
        rowId: change.rowId,
        reason: ack.reason ?? 'rejected',
      });
    }
  }
  return rejected.length === 0 ? { kind: 'saved' } : { kind: 'partlyRejected', rejected };
}
