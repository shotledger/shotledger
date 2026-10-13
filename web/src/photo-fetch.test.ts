import { PhotoHttpError } from '@shotledger/shared/src/sync-client/http';
import { describe, expect, it, vi } from 'vitest';

import { createFetchPhoto, imageType, isSafePhotoId } from './photo-fetch';

describe('imageType', () => {
  it.each([
    ['image/jpeg', 'image/jpeg'],
    ['IMAGE/PNG; charset=binary', 'image/png'],
    ['image/svg+xml', 'image/svg+xml'],
    ['application/octet-stream', ''],
    ['text/html', ''],
    ['image/', ''],
    ['', ''],
    [null, ''],
  ])('%s', (header, type) => {
    expect(imageType(header)).toBe(type);
  });
});

describe('createFetchPhoto', () => {
  const response = (status: number, type: string | null) =>
    new Response(status === 200 ? new Uint8Array([1, 2, 3]) : 'nope', {
      status,
      headers: type === null ? {} : { 'content-type': type },
    });

  it('sends the bearer header and the signal, and types the blob as the response', async () => {
    const fetchImpl = vi.fn(async () => response(200, 'image/png'));
    const fetchPhoto = createFetchPhoto(fetchImpl, 'https://x.test', () => 'tok');
    const signal = new AbortController().signal;
    // An id with a slash is refused before any fetch (QA #747; below).
    const blob = await fetchPhoto('p-1', signal);
    expect(fetchImpl).toHaveBeenCalledWith('https://x.test/photos/p-1', {
      headers: { authorization: 'Bearer tok' },
      signal,
    });
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(3);
  });

  it('leaves a non-image type out', async () => {
    const fetchPhoto = createFetchPhoto(
      async () => response(200, 'application/octet-stream'),
      '',
      () => null,
    );
    expect((await fetchPhoto('p')).type).toBe('');
  });

  it('throws the status, so a 404 can be told from other failures', async () => {
    const fetchPhoto = createFetchPhoto(
      async () => response(404, null),
      '',
      () => 't',
    );
    const error = await fetchPhoto('p').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PhotoHttpError);
    expect((error as PhotoHttpError).status).toBe(404);
  });
});

describe('isSafePhotoId (QA #747)', () => {
  it('accepts the ids the apps make and nothing that could leave a path', () => {
    expect(isSafePhotoId('0199b000-0000-7000-8000-000000000001')).toBe(true);
    expect(isSafePhotoId('p_1')).toBe(true);
    for (const id of ['', '../x', 'a/b', 'a%2Fb', 'a b', 'x'.repeat(129), 'é']) {
      expect(isSafePhotoId(id)).toBe(false);
    }
  });

  it('fetches nothing for an unsafe id, and fails as a missing photo', async () => {
    const fetchImpl = vi.fn(async () => new Response('x'));
    const error = await createFetchPhoto(
      fetchImpl,
      'https://x.test',
      () => 'tok',
    )('a%2Fb').catch((e: unknown) => e);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((error as PhotoHttpError).status).toBe(404);
  });
});
