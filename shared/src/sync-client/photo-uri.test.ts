import { describe, expect, it } from 'vitest';

import { isLocalPhotoUri, parseSyncPhotoUri, toSyncPhotoUri } from './photo-uri';

describe('sync photo markers', () => {
  it('round-trips a photo id', () => {
    expect(parseSyncPhotoUri(toSyncPhotoUri('abc'))).toBe('abc');
  });

  it('rejects anything that is not a marker', () => {
    expect(parseSyncPhotoUri('file:///data/photo.jpg')).toBeNull();
    expect(parseSyncPhotoUri(null)).toBeNull();
    expect(parseSyncPhotoUri(undefined)).toBeNull();
    expect(parseSyncPhotoUri('')).toBeNull();
  });

  it('rejects a marker with no id', () => {
    expect(parseSyncPhotoUri('shotledger-photo:')).toBeNull();
  });

  it('recognises a not-yet-uploaded local path', () => {
    expect(isLocalPhotoUri('file:///data/photo.jpg')).toBe(true);
    expect(isLocalPhotoUri(toSyncPhotoUri('abc'))).toBe(false);
    expect(isLocalPhotoUri(null)).toBe(false);
    expect(isLocalPhotoUri('')).toBe(false);
  });
});
