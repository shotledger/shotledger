import { describe, expect, it } from 'vitest';

import {
  extensionFromUri,
  isPhotoEntryName,
  photoEntryFilename,
  photoEntryName,
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
