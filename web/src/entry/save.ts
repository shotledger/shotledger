// What one Save (or Retry) does and what the page then shows
// (docs/specs/web-series-entry-spec.md C2, §3.5). Pure apart from the
// injected I/O; the built request is held in memory only, for Retry.
import type { ClientChange } from '@shotledger/shared/src/sync';
import type { SyncErrorKey } from '@shotledger/shared/src/sync-client/backoff';
import type { PushOutcome } from '@shotledger/shared/src/sync-client/direct-push';
import { classifySyncError } from '@shotledger/shared/src/sync-client/http';
import type {
  EntryContext,
  EntryError,
  EntryResult,
  SeriesPhoto,
} from '@shotledger/shared/src/sync-client/session-entry';

import { uploadPhotos, type HeldPhotos, type PhotoError, type UploadPhoto } from './photo-upload';

export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'invalid'; errors: EntryError[] }
  | { kind: 'saved'; refreshed: boolean; firearmRejected: boolean }
  /** `unconfirmed`: the server answered, but not with an ack per change sent. */
  | { kind: 'failed'; error: SyncErrorKey; unconfirmed?: true; photo?: PhotoError }
  /** The held request belongs to another account than the one signed in now. */
  | { kind: 'accountChanged' };

/** A request that may have landed, and the account it was built for (R14). */
export interface HeldRequest {
  changes: readonly ClientChange[];
  userId: string;
  /** The photos its series name, uploaded before the push (web-entry-photo-spec C1). */
  photos?: HeldPhotos;
}

export interface SaveState {
  status: SaveStatus;
  held: HeldRequest | null;
  /**
   * Photos the server confirmed for a save whose push was never sent, or was
   * refused outright, by id (web-entry-photo-spec R7). No series names them,
   * so the next build reuses an id for the same picked bytes instead of
   * uploading them again. Absent: none.
   */
  spare?: SparePhotos;
}

export type SparePhotos = ReadonlyMap<string, Blob>;

export const IDLE: SaveState = { status: { kind: 'idle' }, held: null };

/** `spare` plus every photo of `photos` the server confirmed. */
function withConfirmed(spare: SparePhotos, photos: HeldPhotos): SparePhotos {
  const next = new Map(spare);
  for (const id of photos.confirmed) next.set(id, photos.blobs.get(id)!);
  return next;
}

/** `spare` without the photos of a request that may have landed. */
function without(spare: SparePhotos, photos: HeldPhotos | undefined): SparePhotos {
  const next = new Map(spare);
  for (const id of photos?.ids ?? []) next.delete(id);
  return next;
}

/** Marks confirmed each photo whose id and bytes are already spare: it is on the server. */
function confirmSpare(photos: HeldPhotos, spare: SparePhotos): HeldPhotos {
  const confirmed = new Set(photos.confirmed);
  for (const id of photos.ids) {
    if (spare.has(id) && spare.get(id) === photos.blobs.get(id)) confirmed.add(id);
  }
  return { ...photos, confirmed };
}

/** The spare photo id of each picked blob, by row key, for the next build (R7). */
export function reusablePhotoIds(
  picks: ReadonlyMap<number, Blob>,
  spare: SparePhotos | undefined,
): Map<number, string> {
  const idOf = new Map([...(spare ?? [])].map(([id, blob]) => [blob, id]));
  const ids = new Map<number, string>();
  for (const [key, blob] of picks) {
    const id = idOf.get(blob);
    if (id !== undefined) ids.set(key, id);
  }
  return ids;
}

/** A state with the spare photos attached when there are any. */
const withSpare = (state: SaveState, spare: SparePhotos): SaveState =>
  spare.size > 0 ? { ...state, spare } : state;

/** `C`: what loadContext pulls and build reads; the page adds the tags to it. */
export interface SaveDeps<C extends EntryContext = EntryContext> {
  /** The signed-in user's id; null when the session is no longer valid. */
  currentUserId: () => Promise<string | null>;
  /** Pulls the firearms, their groups and the ammo lots afresh (C1). */
  loadContext: () => Promise<C>;
  build: (context: C) => EntryResult;
  push: (changes: readonly ClientChange[]) => Promise<PushOutcome>;
  /** Pulls the account again; false when that failed. */
  refresh: () => Promise<boolean>;
  /** The picked bytes for the built photos, and their upload. */
  photos?: { heldFor: (photos: readonly SeriesPhoto[]) => HeldPhotos; upload: UploadPhoto };
}

/** A lost response may have landed, so Retry resends the very same request. */
const HELD_ON: ReadonlySet<SyncErrorKey> = new Set(['network', 'unauthenticated']);

/**
 * What a submit sends: the held request while there is one, so no key or
 * button can build a second copy of a session that may have landed (R13).
 * Null means build a fresh one. Kept as a function: it is the seam U7 tests
 * the page's submit wiring through (the page itself has no React tests).
 */
export function submitRequest(state: SaveState): HeldRequest | null {
  return state.held;
}

/** Save with `held` null builds a fresh request; Retry passes the held one. */
export async function save<C extends EntryContext>(
  deps: SaveDeps<C>,
  held: HeldRequest | null,
  spare: SparePhotos = new Map(),
): Promise<SaveState> {
  let userId: string | null;
  try {
    userId = await deps.currentUserId();
  } catch (error: unknown) {
    return withSpare({ status: { kind: 'failed', error: classifySyncError(error) }, held }, spare);
  }
  if (userId === null) {
    return withSpare({ status: { kind: 'failed', error: 'unauthenticated' }, held }, spare);
  }
  // The spare photos are the other account's: they are not reused here.
  if (held !== null && held.userId !== userId) {
    return { status: { kind: 'accountChanged' }, held: null };
  }

  let changes: readonly ClientChange[];
  let photos: HeldPhotos | undefined;
  let built: EntryResult | null = null;
  if (held !== null) {
    changes = held.changes;
    photos = held.photos;
  } else {
    let context: C;
    try {
      context = await deps.loadContext();
    } catch (error: unknown) {
      return withSpare(
        { status: { kind: 'failed', error: classifySyncError(error) }, held: null },
        spare,
      );
    }
    try {
      built = deps.build(context);
    } catch {
      // Nothing was sent, so there is nothing to hold (R18).
      return withSpare({ status: { kind: 'failed', error: 'unknown' }, held: null }, spare);
    }
    if (!built.ok) {
      return withSpare({ status: { kind: 'invalid', errors: built.errors }, held: null }, spare);
    }
    changes = built.changes;
  }

  // Every photo is on the server before a series names it (spec C1).
  const photoSeries = built?.ok ? built.photos : [];
  if (photos !== undefined || photoSeries.length > 0) {
    let uploaded: Awaited<ReturnType<typeof uploadPhotos>>;
    try {
      const step = deps.photos!;
      uploaded = await uploadPhotos(
        step.upload,
        photos ?? confirmSpare(step.heldFor(photoSeries), spare),
      );
    } catch {
      // No photo step, or it threw before sending: nothing was pushed (R18).
      return withSpare({ status: { kind: 'failed', error: 'unknown' }, held: null }, spare);
    }
    photos = uploaded.photos;
    const { failure } = uploaded;
    if (failure !== null) {
      // No push was sent: what arrived is spare until a push names it (R7).
      return withSpare(
        {
          status: { kind: 'failed', error: failure.error, photo: failure.photo },
          held: failure.held ? { changes, userId, photos } : null,
        },
        withConfirmed(spare, photos),
      );
    }
  }

  const outcome = await deps.push(changes);
  if (outcome.kind === 'failed') {
    // A lost response, or an answer that does not match, may mean it landed.
    const mayHaveLanded = HELD_ON.has(outcome.error) || outcome.unconfirmed === true;
    // A push that may have landed names its photos: they are no longer spare.
    // One refused outright named nothing, so its photos stay spare.
    const nextSpare = mayHaveLanded
      ? without(spare, photos)
      : photos
        ? withConfirmed(spare, photos)
        : spare;
    return withSpare(
      {
        status: outcome.unconfirmed
          ? { kind: 'failed', error: outcome.error, unconfirmed: true }
          : { kind: 'failed', error: outcome.error },
        held: mayHaveLanded ? { changes, userId, ...(photos && { photos }) } : null,
      },
      nextSpare,
    );
  }
  const firearmRejected =
    outcome.kind === 'partlyRejected' &&
    outcome.rejected.some((rejected) => rejected.tableName === 'firearms');
  const refreshed = await deps.refresh();
  return { status: { kind: 'saved', refreshed, firearmRejected }, held: null };
}

/** An edit makes the held request stale: the next Save builds a new one. */
export function afterEdit(
  state: SaveState,
  { sendsTheSame }: { sendsTheSame: boolean },
): SaveState {
  if (state.status.kind === 'saving' || sendsTheSame) return state;
  // The spare photos outlive an edit: that is when they are reused (R7).
  return state.spare === undefined ? IDLE : { ...IDLE, spare: state.spare };
}

export function saveBlocked(online: boolean, state: SaveState): 'offline' | 'saving' | null {
  if (!online) return 'offline';
  return state.status.kind === 'saving' ? 'saving' : null;
}
