import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PhotoHttpError } from '@shotledger/shared/src/sync-client/http';
import { describe, expect, it, vi } from 'vitest';

import { heldPhotosFor, photoUploadFailure, uploadPhotos, type HeldPhotos } from './photo-upload';

const http = (status: number, body = '') => new PhotoHttpError(status, body);

describe('photoUploadFailure (docs/specs/web-entry-photo-spec.md C3)', () => {
  it('P1 no response → network, held; 500/503/408 → network, held', () => {
    expect(photoUploadFailure(new TypeError('Failed to fetch'))).toEqual({
      error: 'network',
      held: true,
    });
    expect(photoUploadFailure('anything thrown')).toEqual({ error: 'network', held: true });
    for (const status of [500, 503, 408]) {
      expect(photoUploadFailure(http(status))).toEqual({ error: 'network', held: true });
    }
  });

  it('P2 401 → unauthenticated, held; 429 → photoRateLimited, held', () => {
    expect(photoUploadFailure(http(401))).toEqual({ error: 'unauthenticated', held: true });
    expect(photoUploadFailure(http(429, '{"error":"rate_limited"}'))).toEqual({
      error: 'unknown',
      photo: 'photoRateLimited',
      held: true,
    });
  });

  it('P3 413 quota_exceeded → photoQuota, dropped; photo_too_large or an unreadable body → photoTooLarge, dropped', () => {
    expect(photoUploadFailure(http(413, '{"error":"quota_exceeded"}'))).toEqual({
      error: 'unknown',
      photo: 'photoQuota',
      held: false,
    });
    for (const body of [
      '{"error":"photo_too_large"}',
      '',
      'not json',
      '"quota_exceeded"',
      'null',
    ]) {
      expect(photoUploadFailure(http(413, body))).toEqual({
        error: 'unknown',
        photo: 'photoTooLarge',
        held: false,
      });
    }
  });

  it('P4 400/404/411/415 → unknown, dropped', () => {
    for (const status of [400, 404, 411, 415]) {
      expect(photoUploadFailure(http(status, '{"error":"quota_exceeded"}'))).toEqual({
        error: 'unknown',
        held: false,
      });
    }
  });
});

const blob = (text: string) => new Blob([text], { type: 'image/jpeg' });
const A = blob('a');
const B = blob('b');
const C = blob('c');

const held = (confirmed: string[] = []): HeldPhotos => ({
  ids: ['p1', 'p2', 'p3'],
  blobs: new Map([
    ['p1', A],
    ['p2', B],
    ['p3', C],
  ]),
  confirmed: new Set(confirmed),
});

describe('uploadPhotos', () => {
  it('P5 uploads each unconfirmed photo once, in order, to its id, and records it confirmed', async () => {
    const upload = vi.fn(() => Promise.resolve());
    const photos = held();
    const result = await uploadPhotos(upload, photos);
    expect(upload.mock.calls).toEqual([
      ['p1', A],
      ['p2', B],
      ['p3', C],
    ]);
    expect(result.failure).toBeNull();
    expect([...result.photos.confirmed]).toEqual(['p1', 'p2', 'p3']);
    expect(result.photos.ids).toEqual(photos.ids);
    expect(result.photos.blobs).toBe(photos.blobs);
    // The held value is not changed under the caller.
    expect([...photos.confirmed]).toEqual([]);
  });

  it('P6 skips a confirmed photo (Retry after a later failure)', async () => {
    const upload = vi.fn(() => Promise.resolve());
    const result = await uploadPhotos(upload, held(['p1', 'p3']));
    expect(upload.mock.calls).toEqual([['p2', B]]);
    expect(result.failure).toBeNull();
    expect([...result.photos.confirmed].sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('P6 nothing to send when every photo is confirmed', async () => {
    const upload = vi.fn(() => Promise.resolve());
    const result = await uploadPhotos(upload, held(['p1', 'p2', 'p3']));
    expect(upload).not.toHaveBeenCalled();
    expect(result.failure).toBeNull();
  });

  it('P7 stops at the first failure: later photos are not sent, earlier ones stay confirmed', async () => {
    const upload = vi.fn((photoId: string) =>
      photoId === 'p2' ? Promise.reject(http(503)) : Promise.resolve(),
    );
    const result = await uploadPhotos(upload, held());
    expect(upload.mock.calls.map(([id]) => id)).toEqual(['p1', 'p2']);
    expect(result.failure).toEqual({ error: 'network', held: true });
    expect([...result.photos.confirmed]).toEqual(['p1']);
  });

  it('P7 a dropped failure is reported as such', async () => {
    const upload = vi.fn(() => Promise.reject(http(413, '{"error":"quota_exceeded"}')));
    const result = await uploadPhotos(upload, held());
    expect(upload).toHaveBeenCalledTimes(1);
    expect(result.failure).toEqual({ error: 'unknown', photo: 'photoQuota', held: false });
    expect([...result.photos.confirmed]).toEqual([]);
  });

  it('P8 a photo id with no blob → unknown, dropped, nothing sent', async () => {
    const upload = vi.fn(() => Promise.resolve());
    const photos: HeldPhotos = { ...held(), blobs: new Map([['p1', A]]) };
    const result = await uploadPhotos(upload, photos);
    expect(upload).not.toHaveBeenCalled();
    expect(result.failure).toEqual({ error: 'unknown', held: false });
  });
});

describe('heldPhotosFor', () => {
  it('P9 pairs each photo with the blob picked on its form row', () => {
    const photos = heldPhotosFor(
      [
        { row: 1, photoId: 'p1' },
        { row: 3, photoId: 'p3' },
      ],
      [11, 12, 13],
      new Map([
        [13, C],
        [11, A],
        [12, B],
      ]),
    );
    expect(photos.ids).toEqual(['p1', 'p3']);
    expect([...photos.blobs]).toEqual([
      ['p1', A],
      ['p3', C],
    ]);
    expect([...photos.confirmed]).toEqual([]);
  });

  it('P9 a row with no pick (or past the rows) has no blob, so its upload fails closed', () => {
    const photos = heldPhotosFor(
      [
        { row: 1, photoId: 'p1' },
        { row: 4, photoId: 'p4' },
      ],
      [11, 12, 13],
      new Map([[12, B]]),
    );
    expect(photos.ids).toEqual(['p1', 'p4']);
    expect(photos.blobs.size).toBe(0);
  });
});

// Browser storage under every spelling the scans look for: the APIs by name, a
// computed `'…' + 'Storage'`, the Cache Storage API and cookies.
const BROWSER_STORAGE =
  /localStorage|sessionStorage|indexedDB|Storage['"`]|\bcaches\b|document\.cookie/i;

describe('P10 no photo bytes in browser storage', () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));

  it('the photo encoder never touches browser storage', () => {
    // web/src/entry/ itself is covered by save.test.ts's N1 scan.
    const source = readFileSync(path.join(dir, '..', 'photo-encode.ts'), 'utf8');
    expect(source).toContain('toBlob');
    expect(source).not.toMatch(BROWSER_STORAGE);
  });
});
