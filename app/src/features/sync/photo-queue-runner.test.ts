// The photo queue runner (docs/specs/sync-app-spec.md §9) against an
// in-memory queue: what a pass attempts, what each failure costs, and when
// the pass stops. The decisions are shared/src/sync-client/photo-queue.ts's;
// these tests pin that the runner classifies failures and obeys them.
import {
  MAX_PHOTO_ATTEMPTS,
  PhotoHttpError,
  toSyncPhotoUri,
  type PhotoQueueEntry,
} from '@shotledger/shared';

import { runPhotoQueue } from './photo-queue-runner';

const mockClient: { db: object } = { db: { tag: 'drizzle-db' } };
jest.mock('@/db/client', () => ({
  get db() {
    return mockClient.db;
  },
}));

const mockQueue: PhotoQueueEntry[] = [];
const mockReconcile = jest.fn();
jest.mock('@/db/queries/photo-queue', () => ({
  listPhotoQueue: () => mockQueue.map((e) => ({ ...e })),
  reconcilePhotoQueue: () => mockReconcile(),
  removePhotoTask: (_db: unknown, id: string) => {
    mockQueue.splice(
      mockQueue.findIndex((e) => e.id === id),
      1,
    );
  },
  recordPhotoAttempt: (_db: unknown, id: string, attempts: number, lastError: string) => {
    const row = mockQueue.find((e) => e.id === id);
    if (row) Object.assign(row, { attempts, lastError });
  },
}));

const mockUpdateSeries = jest.fn();
jest.mock('@/db/queries/series', () => ({
  updateSeries: (...args: unknown[]) => mockUpdateSeries(...args),
}));

const mockPrepare = jest.fn<Promise<Uint8Array>, [string]>();
const mockWrite = jest.fn();
jest.mock('@/platform/sync-photos', () => ({
  hasLocalSyncPhoto: () => true,
  prepareSyncPhotoBytes: (uri: string) => mockPrepare(uri),
  writeSyncPhoto: (...args: unknown[]) => mockWrite(...args),
}));

const mockToken: { value: string | null } = { value: 'session-token' };
const mockUpload = jest.fn<Promise<void>, unknown[]>();
const mockDownload = jest.fn<Promise<ArrayBuffer>, [string]>();
jest.mock('./client', () => ({
  getSessionTokenCache: () => mockToken.value,
  getPhotoApi: () => ({ upload: mockUpload, download: mockDownload }),
}));

function enqueue(id: string, over: Partial<PhotoQueueEntry> = {}): void {
  mockQueue.push({
    id,
    kind: 'upload',
    photoId: `photo-${id}`,
    localUri: `file:///${id}.jpg`,
    attempts: 0,
    lastError: null,
    createdAt: `2026-10-0${mockQueue.length + 1}T08:00:00.000Z`,
    ...over,
  });
}

function row(id: string): PhotoQueueEntry | undefined {
  return mockQueue.find((e) => e.id === id);
}

/** What fetch does with no network: rejects without a response. */
const noResponse = (): Promise<never> => Promise.reject(new TypeError('Network request failed'));
const status = (code: number) => (): Promise<never> =>
  Promise.reject(new PhotoHttpError(code, 'nope'));

beforeEach(() => {
  // reset, not clear: a test's mockImplementation must not leak into the next.
  jest.resetAllMocks();
  mockPrepare.mockResolvedValue(new Uint8Array([1, 2, 3]));
  mockUpload.mockResolvedValue(undefined);
  mockDownload.mockResolvedValue(new ArrayBuffer(3));
  mockQueue.length = 0;
  mockClient.db = { tag: 'drizzle-db' };
  mockToken.value = 'session-token';
});

it('carries on to the next entry after a success, within the same pass', async () => {
  enqueue('a');
  enqueue('b', { kind: 'download', localUri: null });

  await runPhotoQueue();

  expect(mockUpload).toHaveBeenCalledTimes(1);
  expect(mockDownload).toHaveBeenCalledWith('photo-b');
  expect(mockWrite).toHaveBeenCalledTimes(1);
  expect(mockUpdateSeries).toHaveBeenCalledWith(mockClient.db, 'photo-a', {
    photoUri: toSyncPhotoUri('photo-a'),
  });
  expect(mockQueue).toEqual([]);
});

it('ends the pass on a network failure without spending an attempt', async () => {
  enqueue('a', { attempts: 2 });
  enqueue('b');
  mockUpload.mockImplementationOnce(noResponse);

  await runPhotoQueue();

  expect(mockUpload).toHaveBeenCalledTimes(1);
  expect(row('a')).toMatchObject({ attempts: 2, lastError: 'network' });
  expect(row('b')).toMatchObject({ attempts: 0, lastError: null });
});

it('never wears out an entry while the device stays offline', async () => {
  enqueue('a');
  mockUpload.mockImplementation(noResponse);

  for (let pass = 0; pass < MAX_PHOTO_ATTEMPTS * 2; pass += 1) await runPhotoQueue();

  expect(mockUpload).toHaveBeenCalledTimes(MAX_PHOTO_ATTEMPTS * 2);
  expect(row('a')?.attempts).toBe(0);
});

it('ends the pass on a 5xx and spends one attempt', async () => {
  enqueue('a');
  enqueue('b');
  mockUpload.mockImplementationOnce(status(503));

  await runPhotoQueue();

  expect(mockUpload).toHaveBeenCalledTimes(1);
  expect(row('a')).toMatchObject({ attempts: 1, lastError: 'http_503' });
  expect(row('b')?.attempts).toBe(0);
});

it('reaches the cap on a repeated 5xx only across passes, then stops trying', async () => {
  enqueue('a');
  mockUpload.mockImplementation(status(500));

  for (let pass = 1; pass <= MAX_PHOTO_ATTEMPTS; pass += 1) {
    await runPhotoQueue();
    expect(mockUpload).toHaveBeenCalledTimes(pass);
    expect(row('a')?.attempts).toBe(pass);
  }
  await runPhotoQueue();

  expect(mockUpload).toHaveBeenCalledTimes(MAX_PHOTO_ATTEMPTS);
});

it('spends no attempt on a 401, so the next pass retries it', async () => {
  enqueue('a');
  enqueue('b');
  mockUpload.mockImplementationOnce(status(401));

  await runPhotoQueue();

  expect(mockUpload).toHaveBeenCalledTimes(1);
  expect(row('a')).toMatchObject({ attempts: 0, lastError: 'http_401' });

  await runPhotoQueue();

  expect(mockQueue).toEqual([]);
});

it('gives up on a 404 at once and carries on with the pass', async () => {
  enqueue('gone', { kind: 'download', localUri: null });
  enqueue('b');
  mockDownload.mockImplementationOnce(status(404));

  await runPhotoQueue();
  await runPhotoQueue();

  expect(mockDownload).toHaveBeenCalledTimes(1);
  expect(row('gone')).toMatchObject({ attempts: MAX_PHOTO_ATTEMPTS, lastError: 'http_404' });
  expect(row('b')).toBeUndefined();
});

it('gives up on an upload with no local file without a request', async () => {
  enqueue('a', { localUri: null });

  await runPhotoQueue();

  expect(mockUpload).not.toHaveBeenCalled();
  expect(row('a')).toMatchObject({ attempts: MAX_PHOTO_ATTEMPTS, lastError: 'no_local_file' });
});

it('gives up on a photo over the size cap without a request', async () => {
  enqueue('a');
  mockPrepare.mockResolvedValueOnce(new Uint8Array(1_500_001));

  await runPhotoQueue();

  expect(mockUpload).not.toHaveBeenCalled();
  expect(row('a')).toMatchObject({ attempts: MAX_PHOTO_ATTEMPTS, lastError: 'photo_too_large' });
});

it('spends an attempt when the device cannot read the photo, so a broken file cannot block the queue', async () => {
  enqueue('a');
  mockPrepare.mockRejectedValueOnce(new Error('ENOENT'));

  await runPhotoQueue();

  expect(mockUpload).not.toHaveBeenCalled();
  expect(row('a')).toMatchObject({ attempts: 1, lastError: 'local_io' });
});

it('spends an attempt when the device cannot write a download', async () => {
  enqueue('a', { kind: 'download', localUri: null });
  mockWrite.mockImplementationOnce(() => {
    throw new Error('ENOSPC');
  });

  await runPhotoQueue();

  expect(row('a')).toMatchObject({ attempts: 1, lastError: 'local_io' });
});

it('does nothing while signed out', async () => {
  enqueue('a');
  mockToken.value = null;

  await runPhotoQueue();

  expect(mockReconcile).not.toHaveBeenCalled();
  expect(mockUpload).not.toHaveBeenCalled();
});

it('does nothing when reconciling the queue fails', async () => {
  enqueue('a');
  mockReconcile.mockImplementationOnce(() => {
    throw new Error('fs');
  });

  await runPhotoQueue();

  expect(mockUpload).not.toHaveBeenCalled();
});
