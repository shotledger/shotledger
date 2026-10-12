// One photo as a typed Blob, abortable. The shared client's `download` keeps
// its ArrayBuffer contract for the phone and the account zip; this is the
// web's viewer path, which also needs the type and a signal.
import { PhotoHttpError, type FetchLike } from '@shotledger/shared/src/sync-client/http';

/** The response's type when it is an image type, else '' (left to the browser). */
export function imageType(contentType: string | null): string {
  const essence = contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
  return /^image\/[a-z0-9.+-]+$/.test(essence) ? essence : '';
}

/**
 * A photo id the web will fetch or name a file after: letters, digits, `-`
 * and `_`, as every id the apps make (UUIDs). Another one, crafted into a
 * row, could leave its folder in a zip or ask for another path (QA #747).
 */
export function isSafePhotoId(photoId: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(photoId);
}

export type FetchPhoto = (photoId: string, signal?: AbortSignal) => Promise<Blob>;

export function createFetchPhoto(
  fetchImpl: FetchLike,
  baseUrl: string,
  getToken: () => string | null,
): FetchPhoto {
  return async (photoId, signal) => {
    // Refused as a missing photo would be: nothing is requested.
    if (!isSafePhotoId(photoId)) throw new PhotoHttpError(404, 'unsafe photo id');
    const token = getToken();
    const response = await fetchImpl(`${baseUrl}/photos/${encodeURIComponent(photoId)}`, {
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
      signal,
    });
    if (!response.ok) {
      throw new PhotoHttpError(response.status, await response.text().catch(() => ''));
    }
    return new Blob([await response.arrayBuffer()], {
      type: imageType(response.headers.get('content-type')),
    });
  };
}
