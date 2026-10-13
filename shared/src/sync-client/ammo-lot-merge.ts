// A web ammo-lot merge → the changes one push carries
// (docs/specs/ammo-lot-merge-spec.md §3.2). Pure: ids, change ids and the
// clock are injected. It writes what the phone's mergeAmmoLots writes (M1).
import { PUSH_BATCH_MAX, type ClientChange } from '../sync/protocol';
import type { Payload } from './rows';
import type { EntryDeps } from './session-entry';
import { isLiveRow as isLive, liveRowsIn as liveRows } from './volume-rows';

/** Freshly pulled rows by id, payloads as the wire carries them. */
export interface MergeContext {
  sessions: ReadonlyMap<string, Payload>;
  ammoLots: ReadonlyMap<string, Payload>;
}

export type MergeError =
  | { kind: 'sameLot' }
  | { kind: 'unknownLot' }
  | { kind: 'tooManyChanges'; max: number; needed: number };

export type MergeResult =
  { ok: true; changes: ClientChange[]; moved: number } | { ok: false; errors: MergeError[] };

export function buildAmmoLotMerge(
  duplicateId: string,
  keptId: string,
  context: MergeContext,
  deps: EntryDeps,
): MergeResult {
  if (duplicateId === keptId) return { ok: false, errors: [{ kind: 'sameLot' }] };
  if (!isLive(context.ammoLots.get(duplicateId)) || !isLive(context.ammoLots.get(keptId))) {
    return { ok: false, errors: [{ kind: 'unknownLot' }] };
  }
  // Deleted sessions keep their lot: a tombstone is terminal (M3).
  const moved = liveRows(context.sessions).filter((s) => s.ammo_lot_id === duplicateId);
  const needed = moved.length + 1;
  if (needed > PUSH_BATCH_MAX) {
    return { ok: false, errors: [{ kind: 'tooManyChanges', max: PUSH_BATCH_MAX, needed }] };
  }

  const now = deps.now();
  // APPLY_ORDER: ammo_lots before sessions. One push is one transaction, so
  // the order is not observable (spec §3.2).
  const tombstone: ClientChange = {
    clientChangeId: deps.newChangeId(),
    tableName: 'ammo_lots',
    rowId: duplicateId,
    payload: null,
    deletedAt: now,
    updatedAt: now,
  };
  const repoints: ClientChange[] = moved.map((s) => ({
    clientChangeId: deps.newChangeId(),
    tableName: 'sessions',
    rowId: s.id as string,
    payload: { ...s, ammo_lot_id: keptId, updated_at: now },
    deletedAt: null,
    updatedAt: now,
  }));
  return { ok: true, changes: [tombstone, ...repoints], moved: moved.length };
}
