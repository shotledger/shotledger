import { PhotoHttpError } from '@shotledger/shared/src/sync-client/http';
import { describe, expect, it, vi } from 'vitest';

import { createFetchPhoto, imageType } from './photo-fetch';

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
    const blob = await fetchPhoto('a/b', signal);
    expect(fetchImpl).toHaveBeenCalledWith('https://x.test/photos/a%2Fb', {
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
