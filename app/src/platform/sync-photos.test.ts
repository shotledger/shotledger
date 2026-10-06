import { seriesPhotoGone } from './sync-photos';

jest.mock('expo-image-manipulator', () => ({}));
jest.mock('expo-file-system', () => {
  class File {
    readonly uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists() {
      if (this.uri.includes('unreadable')) throw new Error('no access');
      return !this.uri.includes('gone');
    }
  }
  return { File, Directory: class {}, Paths: {} };
});

it('reads a local file that is no longer there as gone', () => {
  expect(seriesPhotoGone('file:///data/app/cache/ImagePicker/gone.jpeg')).toBe(true);
  expect(seriesPhotoGone('file:///data/app/files/unreadable.jpeg')).toBe(true);
  expect(seriesPhotoGone('file:///data/app/files/series-photos/kept.jpeg')).toBe(false);
});

it('never reads a sync marker or no photo as gone', () => {
  expect(seriesPhotoGone('shotledger-photo:0190')).toBe(false);
  expect(seriesPhotoGone(null)).toBe(false);
});
