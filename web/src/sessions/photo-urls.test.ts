import { describe, expect, it, vi } from 'vitest';

import { createPhotoUrls } from './photo-urls';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(fail: Set<string> = new Set(), graceMs = 0) {
  const download = vi.fn(async (photoId: string) => {
    if (fail.has(photoId)) throw new Error('404');
    return new TextEncoder().encode(photoId).buffer as ArrayBuffer;
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
});
