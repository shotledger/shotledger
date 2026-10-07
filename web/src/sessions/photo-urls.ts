// Photos sit behind the bearer header, so an <img> cannot fetch them itself:
// each is downloaded into a blob URL, shared while anything shows it and
// revoked when the last viewer lets go.

export interface PhotoLease {
  url: Promise<string>;
  /** Call once, when the viewer no longer shows the photo. */
  release(): void;
}

export type PhotoUrls = (photoId: string) => PhotoLease;

interface Entry {
  users: number;
  url: Promise<string>;
}

export function createPhotoUrls(
  download: (photoId: string) => Promise<ArrayBuffer>,
  createUrl: (blob: Blob) => string = (blob) => URL.createObjectURL(blob),
  revokeUrl: (url: string) => void = (url) => URL.revokeObjectURL(url),
  graceMs = 2000,
): PhotoUrls {
  const entries = new Map<string, Entry>();

  return (photoId) => {
    let entry = entries.get(photoId);
    if (!entry) {
      const url = download(photoId).then((bytes) => createUrl(new Blob([bytes])));
      const created: Entry = { users: 0, url };
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
          leased.url.then(revokeUrl, () => undefined);
        }, graceMs);
      },
    };
  };
}
