// Photos sit behind the bearer header, so an <img> cannot fetch them itself:
// each is downloaded into a blob URL, shared while anything shows it and
// revoked when the last viewer lets go.
import { PhotoHttpError } from '@shotledger/shared/src/sync-client/http';

export interface PhotoLease {
  url: Promise<string>;
  /** Call once, when the viewer no longer shows the photo. */
  release(): void;
}

export type PhotoUrls = (photoId: string) => PhotoLease;

/** Why a photo did not load: gone from the server, or anything worth retrying. */
export type PhotoFailure = 'missing' | 'error';

export function photoFailure(error: unknown): PhotoFailure {
  return error instanceof PhotoHttpError && error.status === 404 ? 'missing' : 'error';
}

interface Entry {
  users: number;
  url: Promise<string>;
  abort: AbortController;
}

export function createPhotoUrls(
  download: (photoId: string, signal: AbortSignal) => Promise<Blob>,
  createUrl: (blob: Blob) => string = (blob) => URL.createObjectURL(blob),
  revokeUrl: (url: string) => void = (url) => URL.revokeObjectURL(url),
  graceMs = 2000,
): PhotoUrls {
  const entries = new Map<string, Entry>();

  return (photoId) => {
    let entry = entries.get(photoId);
    if (!entry) {
      const abort = new AbortController();
      const url = download(photoId, abort.signal).then(createUrl);
      const created: Entry = { users: 0, url, abort };
      // A failed download is not kept, so the next viewer tries again.
      url.catch(() => {
        if (entries.get(photoId) === created) entries.delete(photoId);
      });
      entry = created;
      entries.set(photoId, entry);
    }
    const leased = entry;
    leased.users += 1;

    let released = false;
    return {
      url: leased.url,
      release() {
        if (released) return;
        released = true;
        leased.users -= 1;
        // Kept a moment, so the next view (detail to compare) takes the photo
        // over without a refetch once its lazy load fires.
        setTimeout(() => {
          if (leased.users > 0 || entries.get(photoId) !== leased) return;
          entries.delete(photoId);
          leased.abort.abort(); // a no-op once the download has finished
          leased.url.then(revokeUrl, () => undefined);
        }, graceMs);
      },
    };
  };
}
