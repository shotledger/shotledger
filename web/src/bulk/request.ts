// What the Bulk Edit page sends: the action from the form, the target
// sessions, the tables it re-pulls, and the I/O apply.ts runs it with (R8).
// Kept out of the component so every piece is tested.
import type { ClientChange } from '@shotledger/shared/src/sync';
import {
  buildBulkEdit,
  buildCounterCorrection,
  type BulkAction,
} from '@shotledger/shared/src/sync-client/bulk-edit';
import type { PushOutcome } from '@shotledger/shared/src/sync-client/direct-push';

import type { PulledTables, WebTable } from '../pull';
import type { ApplyDeps } from './apply';
import { bulkContext, targetIds, type BulkRow } from './model';

/** The firearm picker's "not chosen yet", distinct from None (''). */
export const UNCHOSEN = 'unchosen';

export interface BulkForm {
  kind: BulkAction['kind'];
  tagName: string;
  removeName: string;
  /** UNCHOSEN, '' for None, or a firearm id. */
  firearm: string;
  location: string;
}

export const INITIAL_FORM: BulkForm = {
  kind: 'addTag',
  tagName: '',
  removeName: '',
  firearm: UNCHOSEN,
  location: '',
};

/** The action the form asks for; null while a required choice is missing. */
export function actionOf(form: BulkForm): BulkAction | null {
  switch (form.kind) {
    case 'addTag':
      return { kind: 'addTag', name: form.tagName };
    case 'removeTag':
      return form.removeName === '' ? null : { kind: 'removeTag', name: form.removeName };
    case 'setFirearm':
      if (form.firearm === UNCHOSEN) return null;
      return { kind: 'setFirearm', firearmId: form.firearm === '' ? null : form.firearm };
    case 'setLocation':
      return { kind: 'setLocation', location: form.location };
  }
}

/** The rows an action is rebuilt from (B4); a firearm change counts rounds too. */
export function tablesFor(kind: BulkAction['kind']): WebTable[] {
  const base: WebTable[] = ['sessions', 'tags', 'session_tags', 'firearms'];
  return kind === 'setFirearm' ? [...base, 'series', 'shots', 'falt_stations'] : base;
}

export interface BulkRequest {
  action: BulkAction;
  /** The selected sessions that are shown (B9). */
  targets: string[];
  tables: WebTable[];
}

export function bulkRequest(
  form: BulkForm,
  selected: ReadonlySet<string>,
  shown: readonly BulkRow[],
): BulkRequest | null {
  const action = actionOf(form);
  const targets = targetIds(selected, shown);
  if (action === null || targets.length === 0) return null;
  return { action, targets, tables: tablesFor(form.kind) };
}

export interface BulkIo {
  loadTables: (only: readonly WebTable[]) => Promise<PulledTables>;
  push: (changes: readonly ClientChange[]) => Promise<PushOutcome>;
  refresh: () => Promise<boolean>;
  newId: () => string;
  newChangeId: () => string;
  now: () => string;
}

const isLive = (row: Record<string, unknown> | undefined) =>
  row !== undefined && (row.deleted_at === null || row.deleted_at === undefined);

/** The apply.ts dependencies for one request. */
export function applyDeps(request: BulkRequest | null, io: BulkIo): ApplyDeps {
  const ids = { newId: io.newId, newChangeId: io.newChangeId, now: io.now };
  return {
    loadContext: async () => bulkContext(await io.loadTables(request!.tables)),
    build: (context) => buildBulkEdit(request!.action, request!.targets, context, ids),
    push: io.push,
    loadFirearms: async () => (await io.loadTables(['firearms'])).firearms,
    correct: (plan, refused, firearms) => buildCounterCorrection(plan, refused, firearms, ids),
    tagLive: async (tagId) => isLive((await io.loadTables(['tags'])).tags.get(tagId)),
    refresh: io.refresh,
  };
}
