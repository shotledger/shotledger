// Discard a refused change (docs/specs/sync-discard-refused-spec.md §2.1):
// push one tombstone of the bad row. Both clients call this one function, so
// the change sent and the verdict read are the same on both (rule 11).
//
// It calls the transport directly, not `pushChanges`: `pushChanges`' `saved`
// carries no ack, and the phone needs the ack's `arrival` to drop the row's
// mark only up to it. The answer is read by `pushChanges`' rule all the same.
import type { RowRef } from '../sync/family';
import { REJECTED_TOMBSTONED } from '../sync/merge';
import { PROTOCOL_VERSION, type ClientChange, type PushAck } from '../sync/protocol';
import type { SyncErrorKey } from './backoff';
import { classifySyncError } from './http';
import type { SyncTransport } from './ports';

export type DiscardOutcome =
  { kind: 'discarded'; arrival: number } | { kind: 'failed'; error: SyncErrorKey };

/** A rejection, or a duplicate replaying one (as in direct-push.ts). */
const isRejection = (ack: PushAck): boolean =>
  ack.status === 'rejected' || (ack.status === 'duplicate' && ack.reason !== undefined);

export async function discardRefused(
  transport: Pick<SyncTransport, 'push'>,
  ref: RowRef,
  now: string,
  newId: () => string,
): Promise<DiscardOutcome> {
  const change: ClientChange = {
    clientChangeId: newId(),
    tableName: ref.tableName,
    rowId: ref.rowId,
    payload: null,
    deletedAt: now,
    updatedAt: now,
  };
  let acks: PushAck[];
  try {
    ({ acks } = await transport.push({ protocolVersion: PROTOCOL_VERSION, changes: [change] }));
  } catch (error: unknown) {
    return { kind: 'failed', error: classifySyncError(error) };
  }
  // Exactly one ack, for the one change sent, or the answer is unconfirmed.
  const ack = acks.length === 1 ? acks[0] : undefined;
  if (ack === undefined || ack.clientChangeId !== change.clientChangeId) {
    return { kind: 'failed', error: 'unknown' };
  }
  // A tombstoned rejection: the row is already deleted, which is what was asked.
  if (isRejection(ack) && ack.reason !== REJECTED_TOMBSTONED) {
    return { kind: 'failed', error: 'unknown' };
  }
  return { kind: 'discarded', arrival: ack.arrival };
}
