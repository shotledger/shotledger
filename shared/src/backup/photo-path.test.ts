import { describe, expect, it } from 'vitest';

import {
  extensionFromUri,
  isPhotoEntryName,
  isSafeEntryName,
  isSyncPhotoEntryName,
  photoEntryFilename,
  photoEntryName,
  syncPhotoEntryId,
  syncPhotoEntryName,
} from './photo-path';

describe('photoEntryName', () => {
  it('joins the photos prefix, id and a dotted extension', () => {
    expect(photoEntryName('abc-123', '.jpg')).toBe('photos/abc-123.jpg');
  });

  it('adds the leading dot when the extension omits it', () => {
    expect(photoEntryName('abc-123', 'png')).toBe('photos/abc-123.png');
  });
});

describe('extensionFromUri', () => {
  it('extracts a lowercase extension from a plain file URI', () => {
    expect(extensionFromUri('file:///data/user/0/app/photo.JPG')).toBe('.jpg');
  });

  it('keeps a non-jpg extension from a URI without a query string', () => {
    expect(extensionFromUri('file:///data/user/0/app/target.png')).toBe('.png');
  });

  it('strips a query string before extracting the extension', () => {
    expect(extensionFromUri('https://example.com/photo.png?x=1')).toBe('.png');
  });

  it('falls back to .jpg for a URI with no extension (e.g. an opaque content:// URI)', () => {
    expect(extensionFromUri('content://media/external/images/media/123')).toBe('.jpg');
  });
});

describe('isPhotoEntryName / photoEntryFilename', () => {
  it('recognizes photo entries and rejects everything else', () => {
    expect(isPhotoEntryName('photos/abc.jpg')).toBe(true);
    expect(isPhotoEntryName('database.sqlite3')).toBe(false);
    expect(isPhotoEntryName('manifest.json')).toBe(false);
    expect(isPhotoEntryName('photos/')).toBe(false);
  });

  it('strips the photos/ prefix to get the bare filename', () => {
    expect(photoEntryFilename('photos/abc-123.jpg')).toBe('abc-123.jpg');
  });
});

describe('sync photo entries', () => {
  it('names a synced photo by its sync photo id', () => {
    expect(syncPhotoEntryName('01930000-abc')).toBe('sync-photos/01930000-abc.jpg');
  });

  it('round-trips the id', () => {
    expect(syncPhotoEntryId(syncPhotoEntryName('photo-id'))).toBe('photo-id');
  });

  it('keeps the two photo namespaces disjoint, so restore never rewrites a sync marker', () => {
    expect(isSyncPhotoEntryName(syncPhotoEntryName('a'))).toBe(true);
    expect(isPhotoEntryName(syncPhotoEntryName('a'))).toBe(false);
    expect(isSyncPhotoEntryName(photoEntryName('a', '.jpg'))).toBe(false);
    expect(isSyncPhotoEntryName('database.sqlite3')).toBe(false);
    expect(isSyncPhotoEntryName('sync-photos/a.png')).toBe(false);
  });
});

// Restore turns a photo entry's name into a file path, so the name has to be
// exactly what export writes: `<id>.<ext>` with no separator or dot in the id.
describe('photo entry names are whitelisted, not trusted', () => {
  it('accepts every character an id and extension may hold', () => {
    expect(isPhotoEntryName('photos/AZaz09_-.jpg')).toBe(true);
    expect(isPhotoEntryName('photos/a.z09')).toBe(true);
    expect(isPhotoEntryName(photoEntryName('0192f3a4-7b1c-7def-8a12-3456789abcde', '.png'))).toBe(
      true,
    );
    expect(isSyncPhotoEntryName('sync-photos/AZaz09_-.jpg')).toBe(true);
  });

  it.each([
    'photos/../x.jpg',
    'photos/a/b.jpg',
    'photos/',
    '',
    'photos/.jpg',
    'photos/abc',
    'photos/abc.',
    'photos/a.b.jpg',
    'photos/abc.JPG',
    'photos/a b.jpg',
    'photos/a.jpg/x',
    'evil/photos/a.jpg',
    'photos\\..\\x.jpg',
  ])('rejects %j as a photo entry', (name) => {
    expect(isPhotoEntryName(name)).toBe(false);
  });

  it.each([
    'sync-photos/../x.jpg',
    'sync-photos/a/b.jpg',
    'sync-photos/.jpg',
    'sync-photos/',
    'sync-photos/a.jpg/x',
    'evil/sync-photos/a.jpg',
    'sync-photos/a.png',
  ])('rejects %j as a sync photo entry', (name) => {
    expect(isSyncPhotoEntryName(name)).toBe(false);
  });
});

describe('isSafeEntryName', () => {
  it('passes the fixed entries and names restore never writes to disk', () => {
    expect(isSafeEntryName('manifest.json')).toBe(true);
    expect(isSafeEntryName('database.sqlite3')).toBe(true);
    expect(isSafeEntryName('vault/payload.enc')).toBe(true);
  });

  it('passes well-formed photo entries in both namespaces', () => {
    expect(isSafeEntryName(photoEntryName('series-1', '.jpg'))).toBe(true);
    expect(isSafeEntryName(syncPhotoEntryName('photo-9'))).toBe(true);
  });

  it.each(['photos/../x.jpg', 'photos/a/b.jpg', 'photos/', 'sync-photos/../x.jpg', 'sync-photos/'])(
    'fails %j, a malformed name under a photo prefix',
    (name) => {
      expect(isSafeEntryName(name)).toBe(false);
    },
  );

  it('holds a sync-photos/ name to the sync rule, which allows only .jpg', () => {
    expect(isSafeEntryName('sync-photos/a.png')).toBe(false);
  });
});
