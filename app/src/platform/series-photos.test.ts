import { keepSeriesPhoto } from './series-photos';

const mockCopies: [string, string][] = [];
let mockCopyFails = false;

jest.mock('expo-file-system', () => {
  const uriOf = (base: { uri: string } | string, name?: string) => {
    const root = typeof base === 'string' ? base : base.uri;
    return name ? `${root.replace(/\/?$/, '/')}${name}` : root;
  };
  class Directory {
    readonly uri: string;
    exists = true;
    constructor(base: { uri: string } | string, name?: string) {
      this.uri = uriOf(base, name);
    }
    create() {}
  }
  class File {
    readonly uri: string;
    get exists() {
      return !this.uri.includes('gone');
    }
    constructor(base: { uri: string } | string, name?: string) {
      this.uri = uriOf(base, name);
    }
    get extension() {
      return /\.[a-z]+$/.exec(this.uri)?.[0] ?? '';
    }
    copySync(to: File) {
      if (mockCopyFails) throw new Error('disk full');
      mockCopies.push([this.uri, to.uri]);
    }
  }
  return { Directory, File, Paths: { document: new Directory('file:///data/app/files') } };
});

beforeEach(() => {
  mockCopies.length = 0;
  mockCopyFails = false;
});

it('copies a picked photo out of the cache into the documents directory', () => {
  const picked = 'file:///data/app/cache/ImagePicker/abc.jpeg';
  const kept = keepSeriesPhoto(picked);
  expect(kept).toMatch(/^file:\/\/\/data\/app\/files\/series-photos\/[0-9a-f-]+\.jpeg$/);
  expect(mockCopies).toEqual([[picked, kept]]);
});

it('leaves a photo already in the documents directory where it is', () => {
  for (const uri of [
    'file:///data/app/files/series-photos/kept.jpeg',
    'file:///data/app/files/backup-photos/restored.jpeg',
  ]) {
    expect(keepSeriesPhoto(uri)).toBe(uri);
  }
  expect(mockCopies).toEqual([]);
});

it('leaves a URI that is not a file alone', () => {
  expect(keepSeriesPhoto('shotledger-photo:0190')).toBe('shotledger-photo:0190');
  expect(mockCopies).toEqual([]);
});

it('keeps the picked URI when the copy fails', () => {
  mockCopyFails = true;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const picked = 'file:///data/app/cache/ImagePicker/abc.jpeg';
  expect(keepSeriesPhoto(picked)).toBe(picked);
});

it('leaves a photo whose file is gone as it is', () => {
  const gone = 'file:///data/app/cache/ImagePicker/gone.jpeg';
  expect(keepSeriesPhoto(gone)).toBe(gone);
  expect(mockCopies).toEqual([]);
});
