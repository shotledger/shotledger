import { PhotoHttpError } from '@shotledger/shared/src/sync-client/http';
import { describe, expect, it, vi } from 'vitest';

import { createPhotoUrls, photoFailure } from './photo-urls';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(fail: Set<string> = new Set(), graceMs = 0) {
  const download = vi.fn(async (photoId: string, _signal: AbortSignal) => {
    if (fail.has(photoId)) throw new Error('404');
    return new Blob([photoId], { type: 'image/png' });
  });
  let next = 0;
  const createUrl = vi.fn(() => `blob:${++next}`);
  const revokeUrl = vi.fn();
  return {
    download,
    createUrl,
    revokeUrl,
    lease: createPhotoUrls(download, createUrl, revokeUrl, graceMs),
  };
}

describe('createPhotoUrls', () => {
  it('downloads once for every viewer and revokes after the last lets go', async () => {
    const { download, revokeUrl, lease } = setup();
    const a = lease('p1');
    const b = lease('p1');
    expect(await a.url).toBe('blob:1');
    expect(await b.url).toBe('blob:1');
    expect(download).toHaveBeenCalledTimes(1);

    a.release();
    a.release(); // a second release by the same viewer counts once
    await tick();
    expect(revokeUrl).not.toHaveBeenCalled();

    b.release();
    await tick();
    expect(revokeUrl).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledWith('blob:1');
  });

  it('revokes once when every viewer lets go in the same render', async () => {
    const { revokeUrl, lease } = setup();
    const a = lease('p1');
    const b = lease('p1');
    await a.url;
    a.release();
    b.release();
    await tick();
    expect(revokeUrl).toHaveBeenCalledTimes(1);
  });

  it('hands the photo to the next view within the grace period', async () => {
    const { download, revokeUrl, lease } = setup();
    const detail = lease('p1');
    await detail.url;
    detail.release();
    const compare = lease('p1');
    expect(await compare.url).toBe('blob:1');
    await tick();
    expect(download).toHaveBeenCalledTimes(1);
    expect(revokeUrl).not.toHaveBeenCalled();
  });

  it('keeps the URL for the grace period, then revokes it', async () => {
    vi.useFakeTimers();
    try {
      const { revokeUrl, lease } = setup(new Set(), 2000);
      const detail = lease('p1');
      await detail.url;
      detail.release();
      await vi.advanceTimersByTimeAsync(1999);
      expect(revokeUrl).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(revokeUrl).toHaveBeenCalledWith('blob:1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('downloads again once the last viewer has gone', async () => {
    const { download, lease } = setup();
    const first = lease('p1');
    await first.url;
    first.release();
    await tick();
    expect(await lease('p1').url).toBe('blob:2');
    expect(download).toHaveBeenCalledTimes(2);
  });

  it('revokes a URL whose download finishes after its viewer left', async () => {
    const { revokeUrl, lease } = setup();
    const early = lease('p1');
    early.release();
    await early.url;
    await tick();
    expect(revokeUrl).toHaveBeenCalledWith('blob:1');
  });

  it('forgets a failed download, and a late release leaves the retry alone', async () => {
    const fail = new Set(['p1']);
    const { download, revokeUrl, lease } = setup(fail);
    const failed = lease('p1');
    await expect(failed.url).rejects.toThrow('404');
    await tick();

    fail.clear();
    const retry = lease('p1');
    expect(await retry.url).toBe('blob:1');
    expect(download).toHaveBeenCalledTimes(2);

    failed.release();
    await tick();
    expect(revokeUrl).not.toHaveBeenCalled();
  });

  it("uses the browser's object URLs by default", async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:default');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    try {
      const lease = createPhotoUrls(async () => new Blob(['p1']), undefined, undefined, 0)('p1');
      expect(await lease.url).toBe('blob:default');
      lease.release();
      await tick();
      expect(revoke).toHaveBeenCalledWith('blob:default');
    } finally {
      create.mockRestore();
      revoke.mockRestore();
    }
  });

  it('passes the blob through as downloaded', async () => {
    const { createUrl, lease } = setup();
    await lease('p1').url;
    expect((createUrl.mock.calls[0] as unknown as [Blob])[0].type).toBe('image/png');
  });

  it('aborts a download nothing waits for once the grace period ends', async () => {
    let signal: AbortSignal | undefined;
    const lease = createPhotoUrls(
      (_id, s) => {
        signal = s;
        return new Promise<Blob>((_, reject) =>
          s.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
        );
      },
      () => 'blob:x',
      () => undefined,
      0,
    );
    const viewer = lease('p1');
    viewer.url.catch(() => undefined);
    expect(signal!.aborted).toBe(false);
    viewer.release();
    await tick();
    expect(signal!.aborted).toBe(true);
  });

  it('does not abort while another viewer still waits', async () => {
    let signal: AbortSignal | undefined;
    const lease = createPhotoUrls(
      (_id, s) => {
        signal = s;
        return new Promise<Blob>(() => undefined);
      },
      () => 'blob:x',
      () => undefined,
      0,
    );
    const a = lease('p1');
    lease('p1');
    a.release();
    await tick();
    expect(signal!.aborted).toBe(false);
  });
});

describe('photoFailure', () => {
  it.each([
    [new PhotoHttpError(404, ''), 'missing'],
    [new PhotoHttpError(500, ''), 'error'],
    [new PhotoHttpError(401, ''), 'error'],
    [new TypeError('Failed to fetch'), 'error'],
    ['odd', 'error'],
  ])('%s', (error, failure) => {
    expect(photoFailure(error)).toBe(failure);
  });
});
