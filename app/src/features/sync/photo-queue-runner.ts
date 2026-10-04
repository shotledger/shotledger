// Drains the photo queue (docs/specs/sync-app-spec.md §9). The runner is
// I/O only — which entry moves next, and whether a failure is worth another
// attempt, are decided by shared/src/sync-client/photo-queue.ts.
import {
  applyPhotoTaskOutcome,
  fitsPhotoSizeCap,
  PhotoHttpError,
  photoFailureForStatus,
  selectNextPhotoTask,
  toSyncPhotoUri,
  type PhotoQueueEntry,
  type PhotoTaskOutcome,
} from '@shotledger/shared';

import { db } from '@/db/client';
import {
  listPhotoQueue,
  recordPhotoAttempt,
  reconcilePhotoQueue,
  removePhotoTask,
} from '@/db/queries/photo-queue';
import { updateSeries } from '@/db/queries/series';
import { hasLocalSyncPhoto, prepareSyncPhotoBytes, writeSyncPhoto } from '@/platform/sync-photos';
import { getPhotoApi, getSessionTokenCache } from './client';

/** One pass costs at most this many network round trips, so a big backlog cannot hang a cycle. */
const MAX_TASKS_PER_PASS = 10;

/** A request that got no response at all, as opposed to a local file error. */
class NoResponseError extends Error {}

/** Runs a photo API call, marking any throw that carries no HTTP status as no response. */
async function request<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw error instanceof PhotoHttpError ? error : new NoResponseError(String(error));
  }
}

function outcomeFor(error: unknown): PhotoTaskOutcome {
  if (error instanceof PhotoHttpError) {
    return {
      type: 'failed',
      failure: photoFailureForStatus(error.status),
      error: `http_${error.status}`,
    };
  }
  if (error instanceof NoResponseError) {
    return { type: 'failed', failure: 'unreachable', error: 'network' };
  }
  // Reading or writing the file on this device failed. It must cost an
  // attempt, or a broken file at the head of the queue would block it forever.
  return { type: 'failed', failure: 'transient', error: 'local_io' };
}

async function runUpload(entry: PhotoQueueEntry): Promise<PhotoTaskOutcome> {
  if (entry.localUri === null) {
    return { type: 'failed', failure: 'permanent', error: 'no_local_file' };
  }

  const bytes = await prepareSyncPhotoBytes(entry.localUri);
  if (!fitsPhotoSizeCap(bytes.byteLength)) {
    // The server would answer 413; failing here saves the round trip and
    // records a reason the user can actually read.
    return { type: 'failed', failure: 'permanent', error: 'photo_too_large' };
  }

  await request(() =>
    getPhotoApi().upload(
      entry.photoId,
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      'image/jpeg',
    ),
  );

  // Swap the device-local path for the device-independent marker. This is a
  // normal local write, so the outbox trigger queues it and the other device
  // learns the photo exists.
  if (db) updateSeries(db, entry.photoId, { photoUri: toSyncPhotoUri(entry.photoId) });
  return { type: 'succeeded' };
}

async function runDownload(entry: PhotoQueueEntry): Promise<PhotoTaskOutcome> {
  const bytes = await request(() => getPhotoApi().download(entry.photoId));
  writeSyncPhoto(entry.photoId, new Uint8Array(bytes));
  return { type: 'succeeded' };
}

/** Fire-and-forget; never throws, so a photo failure can never fail a sync cycle. */
export async function runPhotoQueue(): Promise<void> {
  if (!db || getSessionTokenCache() === null) return;

  try {
    reconcilePhotoQueue(db, hasLocalSyncPhoto);
  } catch {
    // A filesystem hiccup must not stop the rows from syncing.
    return;
  }

  for (let i = 0; i < MAX_TASKS_PER_PASS; i += 1) {
    const entry = selectNextPhotoTask(listPhotoQueue(db));
    if (entry === null) return;

    let outcome: PhotoTaskOutcome;
    try {
      outcome = entry.kind === 'upload' ? await runUpload(entry) : await runDownload(entry);
    } catch (error) {
      outcome = outcomeFor(error);
    }

    const action = applyPhotoTaskOutcome(entry, outcome);
    if (action.type === 'remove') removePhotoTask(db, action.id);
    else recordPhotoAttempt(db, action.id, action.attempts, action.lastError);
    if (action.endPass) return;
  }
}
