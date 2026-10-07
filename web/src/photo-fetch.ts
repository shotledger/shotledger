// One photo as a typed Blob, abortable. The shared client's `download` keeps
// its ArrayBuffer contract for the phone and the account zip; this is the
// web's viewer path, which also needs the type and a signal.
import { PhotoHttpError, type FetchLike } from '@shotledger/shared/src/sync-client/http';

/** The response's type when it is an image type, else '' (left to the browser). */
export function imageType(contentType: string | null): string {
  const essence = contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
  return /^image\/[a-z0-9.+-]+$/.test(essence) ? essence : '';
}

export type FetchPhoto = (photoId: string, signal?: AbortSignal) => Promise<Blob>;

export function createFetchPhoto(
  fetchImpl: FetchLike,
  baseUrl: string,
  getToken: () => string | null,
): FetchPhoto {
  return async (photoId, signal) => {
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
