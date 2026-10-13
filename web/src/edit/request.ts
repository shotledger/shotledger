// What Save and Delete send: the builders over freshly pulled tables, and
// the I/O save.ts runs them with. Kept out of the components so every piece
// is tested.
import type { ClientChange } from '@shotledger/shared/src/sync';
import type { PushOutcome } from '@shotledger/shared/src/sync-client/direct-push';
import {
  buildSessionDelete,
  buildSessionEdit,
  type OpenedSession,
  type SessionEditDraft,
} from '@shotledger/shared/src/sync-client/session-edit';
import { isLiveRow, volumeIndex } from '@shotledger/shared/src/sync-client/volume-rows';

import type { PulledTables, WebTable } from '../pull';
import { EDIT_TABLES, editContext } from './model';
import type { EditDeps } from './save';

export interface EditIo {
  currentUserId: () => Promise<string | null>;
  loadTables: (only: readonly WebTable[]) => Promise<PulledTables>;
  push: (changes: readonly ClientChange[]) => Promise<PushOutcome>;
  refresh: () => Promise<boolean>;
  newId: () => string;
  newChangeId: () => string;
  now: () => string;
}

function deps(io: EditIo, build: EditDeps['build']): EditDeps {
  return {
    currentUserId: io.currentUserId,
    loadContext: async () => editContext(await io.loadTables(EDIT_TABLES)),
    build,
    push: io.push,
    refresh: io.refresh,
  };
}

const ids = (io: EditIo) => ({ newId: io.newId, newChangeId: io.newChangeId, now: io.now });

export function saveDeps(io: EditIo, opened: OpenedSession, draft: SessionEditDraft): EditDeps {
  return deps(io, (fresh) => buildSessionEdit(draft, opened, fresh, ids(io)));
}

/** `opened` is the session as the page showed it: Delete refuses what changed since (R10). */
export function deleteDeps(io: EditIo, opened: OpenedSession): EditDeps {
  return deps(io, (fresh) => buildSessionDelete(opened, fresh, ids(io)));
}

/** What Delete's confirmation names (§3.2): the rounds the firearm's count loses. */
export interface DeletePreview {
  /** The live firearm whose count goes down; null when none does. */
  firearmId: string | null;
  rounds: number;
}

export function deletePreview(tables: PulledTables, sessionId: string): DeletePreview | null {
  const session = tables.sessions.get(sessionId);
  if (!isLiveRow(session)) return null;
  const rounds = volumeIndex(editContext(tables))(session);
  const firearm = tables.firearms.get(session.firearm_id as string);
  return isLiveRow(firearm) && rounds > 0
    ? { firearmId: firearm.id as string, rounds }
    : { firearmId: null, rounds };
}
