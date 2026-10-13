// The Merge Ammo Lots panel on Bulk Edit (docs/specs/ammo-lot-merge-spec.md
// M6, §3.3): its lot options, what one Merge (or Retry) does, and what the
// panel then says. Pure apart from the injected I/O; a built request is held
// in memory only, for Retry, and is never rebuilt once it may have been sent.
import type { ClientChange } from '@shotledger/shared/src/sync';
import {
  buildAmmoLotMerge,
  type AmmoLotMergeContext,
  type AmmoLotMergeError,
} from '@shotledger/shared/src/sync-client/ammo-lot-merge';
import type { SyncErrorKey } from '@shotledger/shared/src/sync-client/backoff';
import type { PushOutcome } from '@shotledger/shared/src/sync-client/direct-push';
import { classifySyncError } from '@shotledger/shared/src/sync-client/http';

import type { PulledTables, WebTable } from '../pull';
import type { Message } from './messages';

type Payload = Record<string, unknown>;

const isLive = (row: Payload | undefined): row is Payload =>
  row !== undefined && (row.deleted_at === null || row.deleted_at === undefined);

export interface LotOption {
  id: string;
  label: string;
  caliber: string | null;
  /** Live sessions on the lot: what a merge of it moves. */
  sessions: number;
}

/** Every live lot, by label, with its live session count (U1). */
export function lotOptions(tables: PulledTables): LotOption[] {
  const counts = new Map<string, number>();
  for (const s of tables.sessions.values()) {
    const lot = s.ammo_lot_id;
    if (isLive(s) && typeof lot === 'string') counts.set(lot, (counts.get(lot) ?? 0) + 1);
  }
  return [...tables.ammo_lots.values()]
    .filter(isLive)
    .map((row) => ({
      id: String(row.id),
      label: String(row.label),
      caliber: typeof row.caliber === 'string' ? row.caliber : null,
      sessions: counts.get(String(row.id)) ?? 0,
    }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

/** Keep offers every lot but the chosen Duplicate (U1). */
export const keepOptions = (options: readonly LotOption[], duplicateId: string) =>
  options.filter((o) => o.id !== duplicateId);

export const MERGE_TABLES: WebTable[] = ['sessions', 'ammo_lots'];

export interface MergeForm {
  duplicateId: string;
  keptId: string;
}

export const EMPTY_MERGE: MergeForm = { duplicateId: '', keptId: '' };

/** Both lots chosen and different; else nothing to ask about. */
export const mergeReady = (form: MergeForm) =>
  form.duplicateId !== '' && form.keptId !== '' && form.duplicateId !== form.keptId;

export interface Built {
  changes: readonly ClientChange[];
  moved: number;
  duplicateId: string;
  /** The account it was built for; a held request goes to no other. */
  userId: string;
}

export type MergeStatus =
  | { kind: 'idle' }
  | { kind: 'applying' }
  | { kind: 'invalid'; errors: AmmoLotMergeError[] }
  | {
      kind: 'applied';
      moved: number;
      /** Changes the server refused: rows deleted on another device. */
      refused: number;
      /** The duplicate was already deleted on another device. */
      duplicateGone: boolean;
      refreshed: boolean;
    }
  | { kind: 'failed'; error: SyncErrorKey; unconfirmed?: true }
  | { kind: 'accountChanged'; userId: string };

export interface MergeState {
  status: MergeStatus;
  /** What Retry resends, as built. */
  held: Built | null;
}

export const MERGE_IDLE: MergeState = { status: { kind: 'idle' }, held: null };

export interface MergeIo {
  currentUserId: () => Promise<string | null>;
  loadTables: (only: readonly WebTable[]) => Promise<PulledTables>;
  push: (changes: readonly ClientChange[]) => Promise<PushOutcome>;
  refresh: () => Promise<boolean>;
  newId: () => string;
  newChangeId: () => string;
  now: () => string;
}

/** A lost response may have landed, so Retry resends the very same request. */
const HELD_ON: ReadonlySet<SyncErrorKey> = new Set(['network', 'unauthenticated']);

function failed(error: SyncErrorKey, held: Built | null, unconfirmed?: true): MergeState {
  return {
    status: unconfirmed ? { kind: 'failed', error, unconfirmed } : { kind: 'failed', error },
    held,
  };
}

async function send(io: MergeIo, built: Built): Promise<MergeState> {
  const outcome = await io.push(built.changes);
  if (outcome.kind === 'failed') {
    const mayHaveLanded = HELD_ON.has(outcome.error) || outcome.unconfirmed === true;
    return failed(outcome.error, mayHaveLanded ? built : null, outcome.unconfirmed);
  }
  const rejected = outcome.kind === 'partlyRejected' ? outcome.rejected : [];
  const refusedSessions = rejected.filter((r) => r.tableName === 'sessions').length;
  const duplicateGone = rejected.some(
    (r) => r.tableName === 'ammo_lots' && r.rowId === built.duplicateId,
  );
  const refreshed = await io.refresh();
  return {
    status: {
      kind: 'applied',
      moved: built.moved - refusedSessions,
      refused: rejected.length,
      duplicateGone,
      refreshed,
    },
    held: null,
  };
}

const contextOf = (tables: PulledTables): AmmoLotMergeContext => ({
  sessions: tables.sessions,
  ammoLots: tables.ammo_lots,
});

/** Merge with `held` null pulls and builds afresh; Retry passes the held one (U2). */
export async function runMerge(
  io: MergeIo,
  form: MergeForm,
  held: Built | null,
): Promise<MergeState> {
  let userId: string | null;
  try {
    userId = await io.currentUserId();
  } catch (error: unknown) {
    return failed(classifySyncError(error), held);
  }
  if (userId === null) return failed('unauthenticated', held);
  if (held !== null && held.userId !== userId) {
    return { status: { kind: 'accountChanged', userId }, held: null };
  }
  if (held !== null) return send(io, held);

  let context: AmmoLotMergeContext;
  try {
    context = contextOf(await io.loadTables(MERGE_TABLES));
  } catch (error: unknown) {
    return failed(classifySyncError(error), null);
  }
  const result = buildAmmoLotMerge(form.duplicateId, form.keptId, context, {
    newId: io.newId,
    newChangeId: io.newChangeId,
    now: io.now,
  });
  if (!result.ok) return { status: { kind: 'invalid', errors: result.errors }, held: null };
  return send(io, {
    changes: result.changes,
    moved: result.moved,
    duplicateId: form.duplicateId,
    userId,
  });
}

/** Changing a lot makes a held request stale: the next Merge pulls afresh. */
export const afterMergeEdit = (state: MergeState): MergeState =>
  state.status.kind === 'applying' ? state : MERGE_IDLE;

function errorMessage(error: AmmoLotMergeError): Message {
  switch (error.kind) {
    case 'sameLot':
      return { key: 'web.bulk.mergeErrorSameLot' };
    case 'unknownLot':
      return { key: 'web.bulk.mergeErrorUnknownLot' };
    case 'tooManyChanges':
      return {
        key: 'web.bulk.mergeErrorTooMany',
        params: { needed: error.needed, max: error.max },
      };
  }
}

const FAILED: Record<string, string> = {
  network: 'web.bulk.mergeFailedNetwork',
  unauthenticated: 'web.bulk.failedSignedOut',
  versionUnsupported: 'web.bulk.failedOutdated',
};

/** What the panel says after a Merge (U3). */
export function mergeMessages(state: MergeState): Message[] {
  const { status } = state;
  switch (status.kind) {
    case 'applying':
      return [{ key: 'web.bulk.applying' }];
    case 'applied': {
      const lines: Message[] = [
        status.duplicateGone
          ? { key: 'web.bulk.mergeDuplicateGone' }
          : { key: 'web.bulk.merged', params: { count: status.moved } },
      ];
      if (status.refused > 0 && !status.duplicateGone) {
        lines.push({ key: 'web.bulk.refused', params: { count: status.refused } });
      }
      if (!status.refreshed) lines.push({ key: 'web.bulk.reload' });
      return lines;
    }
    case 'failed':
      return [
        {
          key: status.unconfirmed
            ? 'web.bulk.failedUnconfirmed'
            : (FAILED[status.error] ?? 'web.entry.failed'),
        },
      ];
    case 'accountChanged':
      return [{ key: 'web.bulk.mergeAccountChanged' }];
    case 'invalid':
      return status.errors.map(errorMessage);
    case 'idle':
      return [];
  }
}
