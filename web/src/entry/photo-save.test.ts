// Save with photos (docs/specs/web-entry-photo-spec.md V1–V7): the uploads
// come first, and the push only after every one is confirmed.
import type { ClientChange } from '@shotledger/shared/src/sync';
import type { PushOutcome } from '@shotledger/shared/src/sync-client/direct-push';
import { PhotoHttpError } from '@shotledger/shared/src/sync-client/http';
import type { EntryContext, EntryResult } from '@shotledger/shared/src/sync-client/session-entry';
import { describe, expect, it, vi } from 'vitest';

import { afterEdit, IDLE, reusablePhotoIds, save, type SaveDeps } from './save';

const CHANGES: ClientChange[] = [
  {
    clientChangeId: '00000000-0000-4000-8000-000000000001',
    tableName: 'series',
    rowId: 'p1',
    payload: { id: 'p1', photo_uri: 'shotledger-photo:p1' },
    deletedAt: null,
    updatedAt: '2026-10-07T10:00:00.000Z',
  },
];
const CONTEXT: EntryContext = { firearms: new Map(), firearmGroups: [], ammoLots: new Map() };
const A = new Blob(['a'], { type: 'image/jpeg' });
const B = new Blob(['b'], { type: 'image/jpeg' });
const SAVED: PushOutcome = { kind: 'saved' };
const LOST: PushOutcome = { kind: 'failed', error: 'network' };

function setup(
  options: {
    upload?: (photoId: string, blob: Blob) => Promise<void>;
    push?: PushOutcome[];
    users?: (string | null)[];
  } = {},
) {
  const log: string[] = [];
  const built: EntryResult = {
    ok: true,
    sessionId: 's1',
    changes: CHANGES,
    photos: [
      { row: 1, photoId: 'p1' },
      { row: 2, photoId: 'p2' },
    ],
  };
  const pushes = [...(options.push ?? [SAVED])];
  const users = [...(options.users ?? ['user-a'])];
  const upload = vi.fn(async (photoId: string, blob: Blob) => {
    log.push(`upload ${photoId}`);
    await (options.upload ?? (() => Promise.resolve()))(photoId, blob);
  });
  const deps = {
    currentUserId: vi.fn(() => Promise.resolve(users.length > 1 ? users.shift()! : users[0]!)),
    loadContext: vi.fn(() => Promise.resolve(CONTEXT)),
    build: vi.fn(() => built),
    push: vi.fn((changes: readonly ClientChange[]) => {
      log.push(`push ${changes.length}`);
      return Promise.resolve(pushes.length > 1 ? pushes.shift()! : pushes[0]!);
    }),
    refresh: vi.fn(() => Promise.resolve(true)),
    photos: {
      heldFor: vi.fn(() => ({
        ids: ['p1', 'p2'],
        blobs: new Map([
          ['p1', A],
          ['p2', B],
        ]),
        confirmed: new Set<string>(),
      })),
      upload,
    },
  } satisfies SaveDeps;
  return { deps, log, upload, built };
}

describe('save with photos', () => {
  it('V1 photos upload before the push, and the push is sent only after every upload', async () => {
    const { deps, log, upload, built } = setup();
    const state = await save(deps, null);
    expect(log).toEqual(['upload p1', 'upload p2', 'push 1']);
    expect(upload.mock.calls).toEqual([
      ['p1', A],
      ['p2', B],
    ]);
    expect(deps.photos.heldFor).toHaveBeenCalledWith(built.photos);
    expect(deps.push).toHaveBeenCalledWith(CHANGES);
    expect(state).toEqual({
      status: { kind: 'saved', refreshed: true, firearmRejected: false },
      held: null,
    });
  });

  it('V2 an upload failure sends no push; Retry uploads the rest and pushes the identical request', async () => {
    let fail = true;
    const { deps, log } = setup({
      upload: (photoId) =>
        photoId === 'p2' && fail ? Promise.reject(new TypeError('offline')) : Promise.resolve(),
    });
    const first = await save(deps, null);
    expect(log).toEqual(['upload p1', 'upload p2']);
    expect(deps.push).not.toHaveBeenCalled();
    expect(first.status).toEqual({ kind: 'failed', error: 'network' });
    expect(first.held?.changes).toBe(CHANGES);
    expect(first.held?.userId).toBe('user-a');
    expect([...first.held!.photos!.confirmed]).toEqual(['p1']);

    fail = false;
    log.length = 0;
    const retry = await save(deps, first.held);
    // The confirmed photo is not sent again; the build is not run again.
    expect(log).toEqual(['upload p2', 'push 1']);
    expect(deps.build).toHaveBeenCalledTimes(1);
    expect(deps.push).toHaveBeenCalledWith(CHANGES);
    expect(retry.status).toMatchObject({ kind: 'saved' });
  });

  it('V2 a 401 and a 429 on upload hold the request, with their own status', async () => {
    const signedOut = setup({ upload: () => Promise.reject(new PhotoHttpError(401, '')) });
    const one = await save(signedOut.deps, null);
    expect(one.status).toEqual({ kind: 'failed', error: 'unauthenticated' });
    expect(one.held).not.toBeNull();

    const limited = setup({ upload: () => Promise.reject(new PhotoHttpError(429, '')) });
    const two = await save(limited.deps, null);
    expect(two.status).toEqual({ kind: 'failed', error: 'unknown', photo: 'photoRateLimited' });
    expect(two.held).not.toBeNull();
    expect(limited.deps.push).not.toHaveBeenCalled();
  });

  it('V3 a dropped upload failure (photoQuota) holds nothing and sends no push', async () => {
    const { deps } = setup({
      upload: () => Promise.reject(new PhotoHttpError(413, '{"error":"quota_exceeded"}')),
    });
    const state = await save(deps, null);
    expect(state).toEqual({
      status: { kind: 'failed', error: 'unknown', photo: 'photoQuota' },
      held: null,
    });
    expect(deps.push).not.toHaveBeenCalled();
  });

  it('V4 a push lost after the uploads holds the request; Retry uploads nothing again and resends the push', async () => {
    const { deps, log } = setup({ push: [LOST, SAVED] });
    const first = await save(deps, null);
    expect(first.status).toEqual({ kind: 'failed', error: 'network' });
    expect([...first.held!.photos!.confirmed]).toEqual(['p1', 'p2']);

    log.length = 0;
    const retry = await save(deps, first.held);
    expect(log).toEqual(['push 1']);
    expect(deps.push.mock.calls[1]![0]).toBe(CHANGES);
    expect(retry.status).toMatchObject({ kind: 'saved' });
  });

  it('V4 a push failure that cannot have landed drops the request; its photos stay spare (R7)', async () => {
    const { deps } = setup({ push: [{ kind: 'failed', error: 'payloadTooLarge' }] });
    expect(await save(deps, null)).toEqual({
      status: { kind: 'failed', error: 'payloadTooLarge' },
      held: null,
      spare: new Map([
        ['p1', A],
        ['p2', B],
      ]),
    });
  });

  it('V5 another account signed in before Retry → accountChanged; no upload, no push', async () => {
    const { deps, upload } = setup({
      upload: () => Promise.reject(new TypeError('offline')),
      users: ['user-a', 'user-b'],
    });
    const first = await save(deps, null);
    upload.mockClear();
    const retry = await save(deps, first.held);
    expect(retry).toEqual({ status: { kind: 'accountChanged' }, held: null });
    expect(upload).not.toHaveBeenCalled();
    expect(deps.push).not.toHaveBeenCalled();
  });

  it('V6 an entry without photos never calls the photo step', async () => {
    const { deps, built } = setup();
    deps.build.mockReturnValue({ ...built, photos: [] });
    const state = await save(deps, null);
    expect(deps.photos.heldFor).not.toHaveBeenCalled();
    expect(deps.photos.upload).not.toHaveBeenCalled();
    expect(state.status).toMatchObject({ kind: 'saved' });
  });

  it('V6 a request with photos and no photo step fails closed: no push, nothing held', async () => {
    const { deps } = setup();
    const { photos: _ignored, ...withoutPhotos } = deps;
    const state = await save(withoutPhotos, null);
    expect(state).toEqual({ status: { kind: 'failed', error: 'unknown' }, held: null });
    expect(deps.push).not.toHaveBeenCalled();
  });

  it('V7 a photo step that throws ends the save as failed: unknown, nothing held', async () => {
    const { deps } = setup();
    deps.photos.heldFor.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(await save(deps, null)).toEqual({
      status: { kind: 'failed', error: 'unknown' },
      held: null,
    });
    expect(deps.push).not.toHaveBeenCalled();
  });

  it('V8 after photo storage is full, the re-save reuses the photo that arrived: no second upload (R7, F1)', async () => {
    const C = new Blob(['c'], { type: 'image/jpeg' });
    const { deps, log } = setup({
      upload: (photoId) =>
        photoId === 'p2'
          ? Promise.reject(new PhotoHttpError(413, '{"error":"quota_exceeded"}'))
          : Promise.resolve(),
    });
    const full = await save(deps, null);
    expect(full).toEqual({
      status: { kind: 'failed', error: 'unknown', photo: 'photoQuota' },
      held: null,
      spare: new Map([['p1', A]]),
    });
    // The user removes photo 2 and picks a smaller one; the page builds row 1
    // on the spare id p1 (reusablePhotoIds) and row 2 on a new id.
    deps.build.mockReturnValue({
      ok: true,
      sessionId: 's2',
      changes: CHANGES,
      photos: [
        { row: 1, photoId: 'p1' },
        { row: 2, photoId: 'p3' },
      ],
    });
    deps.photos.heldFor.mockReturnValue({
      ids: ['p1', 'p3'],
      blobs: new Map([
        ['p1', A],
        ['p3', C],
      ]),
      confirmed: new Set<string>(),
    });
    log.length = 0;
    const again = await save(deps, null, afterEdit(full, { sendsTheSame: false }).spare);
    expect(log).toEqual(['upload p3', 'push 1']);
    // Saved: the spare photo is now named by a series, so none is left.
    expect(again).toEqual({
      status: { kind: 'saved', refreshed: true, firearmRejected: false },
      held: null,
    });
  });

  it('V9 a spare id is reused only with the same bytes; a re-picked photo is uploaded again', async () => {
    const { deps, log } = setup();
    await save(deps, null, new Map([['p1', new Blob(['old'], { type: 'image/jpeg' })]]));
    expect(log).toEqual(['upload p1', 'upload p2', 'push 1']);
  });

  it('V10 a push that may have landed takes its photos out of spare; another account drops them all', async () => {
    const other = new Blob(['x'], { type: 'image/jpeg' });
    const { deps } = setup({ push: [LOST] });
    const spare = new Map([
      ['p1', A],
      ['px', other],
    ]);
    const lost = await save(deps, null, spare);
    expect(lost.held).not.toBeNull();
    expect(lost.spare).toEqual(new Map([['px', other]]));

    const switched = setup({ users: ['user-b'] });
    const retry = await save(switched.deps, { changes: CHANGES, userId: 'user-a' }, spare);
    expect(retry).toEqual({ status: { kind: 'accountChanged' }, held: null });
  });

  it('V11 afterEdit keeps the spare photos and otherwise returns IDLE', () => {
    const spare = new Map([['p1', A]]);
    const status = { kind: 'failed' as const, error: 'unknown' as const };
    expect(afterEdit({ status, held: null, spare }, { sendsTheSame: false })).toEqual({
      ...IDLE,
      spare,
    });
    expect(afterEdit({ status, held: null }, { sendsTheSame: false })).toBe(IDLE);
  });

  it('V12 reusablePhotoIds maps a row to the spare id of the very bytes it picked', () => {
    const C = new Blob(['c'], { type: 'image/jpeg' });
    const spare = new Map([
      ['p1', A],
      ['p9', C],
    ]);
    const picks = new Map([
      [1, A],
      [2, B],
    ]);
    expect(reusablePhotoIds(picks, spare)).toEqual(new Map([[1, 'p1']]));
    expect(reusablePhotoIds(picks, undefined)).toEqual(new Map());
  });
});
