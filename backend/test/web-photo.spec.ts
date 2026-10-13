// A photo on a web-entered series end to end (docs/specs/web-entry-photo-spec.md
// W5–W7): the shared builder, the shared photo client and pushChanges, the
// real HTTP transport, the real Worker, real D1, R2 and better-auth, in
// process. One account, a "web" token and a "device B" token.
import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  buildSessionEntry,
  createAccountApi,
  createHttpSyncTransport,
  createPhotoApi,
  parseSyncPhotoUri,
  PhotoHttpError,
  pushChanges,
  PROTOCOL_VERSION,
  type ClientChange,
  type SeriesPhoto,
} from '@shotledger/shared';

import { ALL_MIGRATIONS } from '../src/db/migrations';
import app from '../src/index';

const BASE_URL = 'https://localhost';
const PASSWORD = 'correct horse battery staple';
const NOW = '2026-10-07T10:00:00.000Z';

async function fetchApp(input: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(new Request(input, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

const client = (getToken: () => string | null) => {
  const config = { fetchImpl: fetchApp, baseUrl: BASE_URL, getToken };
  return {
    account: createAccountApi(config),
    transport: createHttpSyncTransport(config),
    photos: createPhotoApi(config),
  };
};

let counter = 0;
const uuid = (version: 4 | 7) => () =>
  `00000000-0000-${version}000-8000-${(counter += 1).toString(16).padStart(12, '0')}`;

/** A stand-in for the browser's re-encoded JPEG: the SOI marker, then filler. */
const jpeg = (fill: number, size = 2048) => {
  const bytes = new Uint8Array(size).fill(fill);
  bytes.set([0xff, 0xd8, 0xff, 0xdb]);
  return bytes;
};
const asBuffer = (bytes: Uint8Array) => bytes.slice().buffer;

/** A web entry with a photo on rows 1 and 3. */
function webEntry(): { changes: ClientChange[]; photos: SeriesPhoto[] } {
  const result = buildSessionEntry(
    {
      type: 'training',
      disciplineId: 'spsf-precision',
      programId: null,
      startedAt: '2026-10-06T16:00:00.000Z',
      name: '',
      defaultName: 'Training — 6 Oct 2026',
      location: '',
      competitionLevel: null,
      isChampionship: false,
      competitionName: '',
      weaponGroup: null,
      shooterClass: null,
      eventId: null,
      firearmId: null,
      ammoLotId: null,
      decimalScoring: false,
      seriesLength: null,
      series: [
        { text: '10 9 X 10 9', isSighter: false, hasPhoto: true },
        { text: '8 7 6 5 4', isSighter: false },
        { text: '', isSighter: false, hasPhoto: true },
      ],
    },
    { firearms: new Map(), firearmGroups: [], ammoLots: new Map() },
    { newId: uuid(7), newChangeId: uuid(4), now: () => NOW },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return { changes: result.changes, photos: result.photos };
}

async function seriesOf(transport: ReturnType<typeof client>['transport']) {
  const response = await transport.pull({
    protocolVersion: PROTOCOL_VERSION,
    tables: [{ tableName: 'series', cursor: 0 }],
  });
  return response.changes;
}

async function photoRows(): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM photos').first<{ n: number }>();
  return row!.n;
}

let web: ReturnType<typeof client>;
let deviceB: ReturnType<typeof client>;
let tokenB: string;
let accountSeq = 0;

beforeAll(async () => {
  await applyD1Migrations(env.DB, ALL_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.exec('DELETE FROM photos');
  await env.DB.exec('DELETE FROM quota');
  await env.DB.exec('DELETE FROM rate_limit_windows');
  accountSeq += 1;
  // Synthetic address on a reserved TLD — never a real inbox.
  const email = `web-photo-${accountSeq}@example.invalid`;
  tokenB = (await client(() => null).account.signUp(email, PASSWORD, 'Test Shooter')).token;
  deviceB = client(() => tokenB);
  const webToken = (await client(() => null).account.signIn(email, PASSWORD)).token;
  web = client(() => webToken);
});

describe('a web entry with photos', () => {
  it('W5 upload then push: device B pulls the marker and downloads the exact uploaded bytes', async () => {
    const { changes, photos } = webEntry();
    const bytes = new Map(photos.map((photo, i) => [photo.photoId, jpeg(i + 1)]));
    for (const { photoId } of photos) {
      await web.photos.upload(photoId, asBuffer(bytes.get(photoId)!), 'image/jpeg');
    }
    await expect(pushChanges(web.transport, PROTOCOL_VERSION, changes)).resolves.toEqual({
      kind: 'saved',
    });

    const pulled = await seriesOf(deviceB.transport);
    const named = pulled
      .map((row) => parseSyncPhotoUri((row.payload as { photo_uri: string | null }).photo_uri))
      .filter((id) => id !== null);
    expect(named.sort()).toEqual(photos.map((p) => p.photoId).sort());
    // Each marker names its own series.
    for (const row of pulled) {
      const id = parseSyncPhotoUri((row.payload as { photo_uri: string | null }).photo_uri);
      if (id !== null) expect(id).toBe(row.rowId);
    }
    for (const { photoId } of photos) {
      const downloaded = new Uint8Array(await deviceB.photos.download(photoId));
      expect(downloaded).toEqual(bytes.get(photoId));
    }
    // Stored as the JPEG the phone writes to <photoId>.jpg.
    const response = await fetchApp(`${BASE_URL}/photos/${photos[0]!.photoId}`, {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    await response.arrayBuffer();
  });

  it('W6 Retry after a lost push: the same uploads and push again answer duplicate, and the quota counts each photo once', async () => {
    const { changes, photos } = webEntry();
    const upload = async () => {
      for (const [i, { photoId }] of photos.entries()) {
        await web.photos.upload(photoId, asBuffer(jpeg(i + 1)), 'image/jpeg');
      }
    };
    await upload();
    await pushChanges(web.transport, PROTOCOL_VERSION, changes);
    const once = await web.photos.usage();
    expect(once.usedBytes).toBe(2 * 2048);

    // The response was lost: Retry repeats every step.
    await upload();
    const replay = await web.transport.push({ protocolVersion: PROTOCOL_VERSION, changes });
    expect(replay.acks.map((ack) => ack.status)).toEqual(changes.map(() => 'duplicate'));
    expect((await web.photos.usage()).usedBytes).toBe(once.usedBytes);
    expect(await photoRows()).toBe(2);
    expect(await seriesOf(deviceB.transport)).toHaveLength(3);
  });

  it('W7 an upload answered 413 quota_exceeded stores no object and no photo row, and leaves the usage', async () => {
    const { photos } = webEntry();
    const me = await web.account.currentUser();
    await env.DB.prepare('INSERT INTO quota (user_id, used_bytes, limit_bytes) VALUES (?, 0, 100)')
      .bind(me!.userId)
      .run();

    const error = await web.photos
      .upload(photos[0]!.photoId, asBuffer(jpeg(1)), 'image/jpeg')
      .then(() => null)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PhotoHttpError);
    expect((error as PhotoHttpError).status).toBe(413);
    // The body the web reads as photoQuota (photo-upload.ts); that the web then
    // pushes nothing is V3's, not this test's (verification F4).
    expect(JSON.parse((error as PhotoHttpError).message)).toEqual({ error: 'quota_exceeded' });
    expect(await photoRows()).toBe(0);
    const stored = (await env.PHOTOS.list()).objects.map((object) => object.key);
    expect(stored.filter((key) => key.includes(photos[0]!.photoId))).toEqual([]);
    expect((await web.photos.usage()).usedBytes).toBe(0);
  });

  it('W8 near the limit, re-uploading a photo already stored nets its size; a new photo is refused (F2)', async () => {
    const { photos } = webEntry();
    const me = await web.account.currentUser();
    await env.DB.prepare('INSERT INTO quota (user_id, used_bytes, limit_bytes) VALUES (?, 0, ?)')
      .bind(me!.userId, 2 * 2048 + 100)
      .run();
    for (const [i, { photoId }] of photos.entries()) {
      await web.photos.upload(photoId, asBuffer(jpeg(i + 1)), 'image/jpeg');
    }
    expect((await web.photos.usage()).usedBytes).toBe(2 * 2048);

    // A Retry whose 201 was lost sends the same id again: it replaces, so it fits.
    await web.photos.upload(photos[1]!.photoId, asBuffer(jpeg(2)), 'image/jpeg');
    expect((await web.photos.usage()).usedBytes).toBe(2 * 2048);
    expect(await photoRows()).toBe(2);

    const error = await web.photos
      .upload('0199c000-0000-7000-8000-0000000000ff', asBuffer(jpeg(3)), 'image/jpeg')
      .then(() => null)
      .catch((e: unknown) => e);
    expect((error as PhotoHttpError).status).toBe(413);
    expect(JSON.parse((error as PhotoHttpError).message)).toEqual({ error: 'quota_exceeded' });
  });
});
