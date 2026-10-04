// Contract tests I8+: the REAL client (shared/src/sync-client) against the
// REAL Worker in process, for the paths I1–I7 (sync-client.spec.ts) do not
// reach — pagination, push batching, the version handshake and photos.
// Harness copied from sync-client.spec.ts; `app.fetch` is the transport.
import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  APPLY_ORDER,
  applyPhotoTaskOutcome,
  classifySyncError,
  createAccountApi,
  createHttpSyncTransport,
  createPhotoApi,
  isLocalPhotoUri,
  MAX_PAYLOAD_BYTES,
  MAX_PHOTO_ATTEMPTS,
  parseSyncPhotoUri,
  PhotoHttpError,
  photoFailureForStatus,
  PROTOCOL_VERSION_UNSUPPORTED,
  PULL_PAGE_SIZE,
  PUSH_BATCH_MAX,
  rowKey,
  runSyncCycle,
  selectNextPhotoTask,
  SyncHttpError,
  toSyncPhotoUri,
  type ChangeRow,
  type FetchLike,
  type LocalRowSnapshot,
  type LocalStore,
  type OutboxEntry,
  type PhotoQueueAction,
  type PhotoQueueEntry,
  type PhotoTaskOutcome,
  type PullRequest,
  type PushRequest,
  type SyncTableName,
  type SyncTransport,
} from '@shotledger/shared';

import { ALL_MIGRATIONS } from '../src/db/migrations';
import app from '../src/index';

const BASE_URL = 'https://example.com';

async function fetchApp(input: string, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const ctx = createExecutionContext();
  const response = await app.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

let uuidCounter = 0;
function uuid(): string {
  uuidCounter += 1;
  const hex = uuidCounter.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

/** Records every request the engine sends, then forwards it unchanged. */
class RecordingTransport implements SyncTransport {
  readonly pulls: PullRequest[] = [];
  readonly pushes: PushRequest[] = [];

  constructor(private readonly inner: SyncTransport) {}

  pull(request: PullRequest) {
    this.pulls.push(structuredClone(request));
    return this.inner.pull(request);
  }

  push(request: PushRequest) {
    this.pushes.push(structuredClone(request));
    return this.inner.push(request);
  }
}

/**
 * The device. An in-memory stand-in for app/src/db/queries/sync-store.ts —
 * same LocalStore contract, same outbox semantics (rev-matched clear, id
 * reset on re-queue), no SQLite.
 */
class Device {
  readonly rows = new Map<string, Record<string, unknown>>();
  readonly outbox = new Map<string, OutboxEntry>();
  readonly cursors = new Map<SyncTableName, number>();
  private lastRev = 0;
  token: string | null = null;
  fetchImpl: FetchLike = fetchApp;

  private key(tableName: SyncTableName, rowId: string) {
    return `${tableName}:${rowId}`;
  }

  /** A local write: the row plus the outbox enqueue, as one step. */
  write(tableName: SyncTableName, row: Record<string, unknown>): void {
    const rowId = row.id as string;
    this.rows.set(this.key(tableName, rowId), row);
    this.lastRev += 1;
    this.outbox.set(this.key(tableName, rowId), {
      tableName,
      rowId,
      rev: this.lastRev,
      clientChangeId: null,
    });
  }

  get(tableName: SyncTableName, rowId: string) {
    return this.rows.get(this.key(tableName, rowId));
  }

  rowsOf(tableName: SyncTableName) {
    return [...this.rows.entries()]
      .filter(([key]) => key.startsWith(`${tableName}:`))
      .map(([, row]) => row);
  }

  store(): LocalStore {
    return {
      readCursors: async () =>
        Object.fromEntries(APPLY_ORDER.map((t) => [t, this.cursors.get(t) ?? 0])) as Record<
          SyncTableName,
          number
        >,
      setCursor: async (tableName, cursor) => {
        this.cursors.set(tableName, cursor);
      },
      applyChanges: async (changes: ChangeRow[]) => {
        for (const change of changes) {
          const key = this.key(change.tableName, change.rowId);
          if (change.deletedAt !== null) {
            const existing = this.rows.get(key);
            if (existing) {
              this.rows.set(key, {
                ...existing,
                deleted_at: change.deletedAt,
                updated_at: change.updatedAt,
              });
            }
            continue;
          }
          this.rows.set(key, change.payload as Record<string, unknown>);
        }
      },
      readOutbox: async (limit) =>
        [...this.outbox.values()].sort((a, b) => a.rev - b.rev).slice(0, limit),
      readRow: async (tableName, rowId): Promise<LocalRowSnapshot | undefined> => {
        const row = this.rows.get(this.key(tableName, rowId));
        if (!row) return undefined;
        return {
          payload: row,
          updatedAt: row.updated_at as string,
          deletedAt: (row.deleted_at as string | null) ?? null,
        };
      },
      assignClientChangeId: async (entry, clientChangeId) => {
        const current = this.outbox.get(this.key(entry.tableName, entry.rowId));
        if (current && current.rev === entry.rev) current.clientChangeId = clientChangeId;
      },
      clearOutboxEntry: async (entry) => {
        const key = this.key(entry.tableName, entry.rowId);
        const current = this.outbox.get(key);
        if (current && current.rev === entry.rev) this.outbox.delete(key);
      },
      pendingRowKeys: async () =>
        new Set([...this.outbox.values()].map((e) => rowKey(e.tableName, e.rowId))),
      pendingCount: async () => this.outbox.size,
    };
  }

  private httpConfig() {
    return {
      fetchImpl: (input: string, init?: RequestInit) => this.fetchImpl(input, init),
      baseUrl: BASE_URL,
      getToken: () => this.token,
    };
  }

  transport() {
    return new RecordingTransport(createHttpSyncTransport(this.httpConfig()));
  }

  photoApi() {
    return createPhotoApi(this.httpConfig());
  }

  async sync(transport: SyncTransport = this.transport()) {
    return runSyncCycle({ store: this.store(), transport, newId: uuid });
  }
}

/**
 * The device's photo side: the queue rows and the local photo cache. A
 * stand-in for app/src/features/sync/photo-queue-runner.ts and
 * app/src/db/queries/photo-queue.ts (which need Expo), making the same
 * calls into shared/src/sync-client in the same order.
 */
class PhotoDevice {
  readonly queue = new Map<string, PhotoQueueEntry>();
  readonly cache = new Map<string, Uint8Array>();
  readonly files = new Map<string, Uint8Array>();
  readonly actions: PhotoQueueAction[] = [];
  private queueSeq = 0;

  constructor(private readonly device: Device) {}

  private enqueue(kind: PhotoQueueEntry['kind'], photoId: string, localUri: string | null) {
    const exists = [...this.queue.values()].some((e) => e.kind === kind && e.photoId === photoId);
    if (exists) return;
    this.queueSeq += 1;
    const id = `q-${this.queueSeq}`;
    this.queue.set(id, {
      id,
      kind,
      photoId,
      localUri,
      attempts: 0,
      lastError: null,
      createdAt: `2026-09-02T10:00:${String(this.queueSeq).padStart(2, '0')}.000Z`,
    });
  }

  /** Mirrors reconcilePhotoQueue: upload a local path, download an unseen marker. */
  reconcile() {
    for (const row of this.device.rowsOf('series')) {
      if (row.deleted_at !== null) continue;
      const photoUri = row.photo_uri as string | null;
      if (isLocalPhotoUri(photoUri)) {
        this.enqueue('upload', row.id as string, photoUri);
        continue;
      }
      const photoId = parseSyncPhotoUri(photoUri);
      if (photoId !== null && !this.cache.has(photoId)) this.enqueue('download', photoId, null);
    }
  }

  private async runOne(entry: PhotoQueueEntry): Promise<PhotoTaskOutcome> {
    try {
      if (entry.kind === 'upload') {
        const bytes = this.files.get(entry.localUri!)!;
        await this.device
          .photoApi()
          .upload(entry.photoId, bytes.slice().buffer as ArrayBuffer, 'image/jpeg');
        // The marker swap is a local write, so it syncs like any other edit.
        const row = this.device.get('series', entry.photoId)!;
        this.device.write('series', {
          ...row,
          photo_uri: toSyncPhotoUri(entry.photoId),
          updated_at: '2026-09-02T12:00:00.000Z',
        });
        this.cache.set(entry.photoId, bytes);
      } else {
        this.cache.set(
          entry.photoId,
          new Uint8Array(await this.device.photoApi().download(entry.photoId)),
        );
      }
      return { type: 'succeeded' };
    } catch (error) {
      if (error instanceof PhotoHttpError) {
        return {
          type: 'failed',
          failure: photoFailureForStatus(error.status),
          error: `http_${error.status}`,
        };
      }
      return { type: 'failed', failure: 'unreachable', error: 'network' };
    }
  }

  /** Mirrors runPhotoQueue's drain loop. */
  async drain(maxTasks = 10) {
    this.reconcile();
    for (let i = 0; i < maxTasks; i += 1) {
      const entry = selectNextPhotoTask([...this.queue.values()]);
      if (entry === null) return;
      const action = applyPhotoTaskOutcome(entry, await this.runOne(entry));
      this.actions.push(action);
      if (action.type === 'remove') this.queue.delete(action.id);
      else
        this.queue.set(entry.id, {
          ...entry,
          attempts: action.attempts,
          lastError: action.lastError,
        });
      if (action.endPass) return;
    }
  }
}

function accountApi(getToken: () => string | null) {
  return createAccountApi({ fetchImpl: fetchApp, baseUrl: BASE_URL, getToken });
}

function sessionRow(id: string, name: string, updatedAt: string) {
  return {
    id,
    created_at: updatedAt,
    updated_at: updatedAt,
    deleted_at: null,
    name,
    type: 'training',
    discipline_id: 'spsf:precision',
    started_at: updatedAt,
    is_championship: 0,
    decimal_scoring: 0,
  };
}

function seriesRow(id: string, sessionId: string, position: number, updatedAt: string) {
  return {
    id,
    created_at: updatedAt,
    updated_at: updatedAt,
    deleted_at: null,
    session_id: sessionId,
    position,
    is_sighter: 0,
    is_final: 0,
    is_total_override: 0,
    photo_uri: null as string | null,
  };
}

const T0 = '2026-09-02T10:00:00.000Z';

beforeAll(async () => {
  await applyD1Migrations(env.DB, ALL_MIGRATIONS);
});

let deviceA: Device;
let deviceB: Device;
let accountSeq = 0;

beforeEach(async () => {
  deviceA = new Device();
  deviceB = new Device();
  accountSeq += 1;
  // Synthetic address on a reserved TLD — never a real inbox.
  const email = `contract-${accountSeq}@example.invalid`;
  const session = await accountApi(() => null).signUp(email, 'correct horse battery staple', 'T');
  deviceA.token = session.token;
  const second = await accountApi(() => null).signIn(email, 'correct horse battery staple');
  deviceB.token = second.token;
});

describe('I8 a pull longer than one page', () => {
  it('device B follows hasMore until every table is drained', async () => {
    const sessionCount = PULL_PAGE_SIZE + 5;
    for (let i = 0; i < sessionCount; i += 1) {
      deviceA.write('sessions', sessionRow(`s-${i}`, `Session ${i}`, T0));
    }
    deviceA.write('series', seriesRow('ser-1', 's-0', 1, T0));
    expect(await deviceA.sync()).toMatchObject({ status: 'ok', pushed: sessionCount + 1 });

    const transport = deviceB.transport();
    const result = await deviceB.sync(transport);

    expect(result).toMatchObject({ status: 'ok', pulled: sessionCount + 1 });
    expect(deviceB.rowsOf('sessions')).toHaveLength(sessionCount);
    expect(deviceB.get('sessions', `s-${sessionCount - 1}`)).toMatchObject({
      name: `Session ${sessionCount - 1}`,
    });
    expect(deviceB.get('series', 'ser-1')).toMatchObject({ session_id: 's-0' });

    // Page one asks for every table; page two only for the one with more.
    expect(transport.pulls).toHaveLength(2);
    expect(transport.pulls[0]!.tables).toHaveLength(APPLY_ORDER.length);
    expect(transport.pulls[1]!.tables).toEqual([
      { tableName: 'sessions', cursor: deviceB.cursors.get('sessions')! - 5 },
    ]);

    // Caught up: the next cycle pulls nothing.
    expect(await deviceB.sync()).toMatchObject({ status: 'ok', pulled: 0, pushed: 0 });
  });
});

describe('I9 more outbox entries than one push batch', () => {
  it('device A pushes PUSH_BATCH_MAX + 1 entries in two batches and B receives all', async () => {
    const count = PUSH_BATCH_MAX + 1;
    for (let i = 0; i < count; i += 1) {
      deviceA.write('sessions', sessionRow(`b-${i}`, `Batch ${i}`, T0));
    }

    const transport = deviceA.transport();
    const result = await deviceA.sync(transport);

    expect(result).toMatchObject({ status: 'ok', pushed: count, rejected: 0, duplicates: 0 });
    expect(transport.pushes.map((p) => p.changes.length)).toEqual([PUSH_BATCH_MAX, 1]);
    expect(deviceA.outbox.size).toBe(0);

    const pulled = await deviceB.sync();
    expect(pulled).toMatchObject({ status: 'ok', pulled: count });
    expect(deviceB.rowsOf('sessions')).toHaveLength(count);
  });
});

describe('I10 a server that refuses the protocol version', () => {
  /** A client build that still speaks protocol 0, below the server's minimum. */
  function speakVersion(device: Device, version: number, path: '/sync/pull' | '/sync/push') {
    device.fetchImpl = async (input, init) => {
      if (input.endsWith(path) && typeof init?.body === 'string') {
        const body = JSON.parse(init.body) as { protocolVersion: number };
        return fetchApp(input, {
          ...init,
          body: JSON.stringify({ ...body, protocolVersion: version }),
        });
      }
      return fetchApp(input, init);
    };
  }

  async function syncError(device: Device): Promise<SyncHttpError> {
    const error = await device.sync().then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(SyncHttpError);
    return error as SyncHttpError;
  }

  it('a 409 on pull surfaces as versionUnsupported and writes nothing locally', async () => {
    deviceA.write('sessions', sessionRow('v-1', 'Before', T0));
    await deviceA.sync();
    speakVersion(deviceB, 0, '/sync/pull');

    const error = await syncError(deviceB);
    expect(error.status).toBe(409);
    expect(error.errorKey).toBe('versionUnsupported');
    expect(classifySyncError(error)).toBe('versionUnsupported');
    expect(error.message).toContain(PROTOCOL_VERSION_UNSUPPORTED);
    expect(deviceB.rows.size).toBe(0);
    expect(deviceB.cursors.size).toBe(0);
  });

  it('a 409 on push surfaces as versionUnsupported and keeps the outbox', async () => {
    deviceA.write('sessions', sessionRow('v-2', 'Unsent', T0));
    speakVersion(deviceA, 0, '/sync/push');

    const error = await syncError(deviceA);
    expect(error.status).toBe(409);
    expect(classifySyncError(error)).toBe('versionUnsupported');
    // Nothing was acked, so the change is still queued for an upgraded build.
    expect(deviceA.outbox.size).toBe(1);
    expect(await deviceB.sync()).toMatchObject({ pulled: 0 });
  });
});

describe('I12 a row over the payload cap', () => {
  it('a 413 on push surfaces as payloadTooLarge and keeps the outbox', async () => {
    const row = { ...sessionRow('big-1', 'Long', T0), notes: 'x'.repeat(MAX_PAYLOAD_BYTES) };
    deviceA.write('sessions', row);

    const error = await deviceA.sync().then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(SyncHttpError);
    expect((error as SyncHttpError).status).toBe(413);
    expect(classifySyncError(error)).toBe('payloadTooLarge');
    expect(deviceA.outbox.size).toBe(1);

    // Shortened, the same row goes through on the next cycle.
    deviceA.write('sessions', { ...row, notes: 'short' });
    await deviceA.sync();
    expect(deviceA.outbox.size).toBe(0);
  });
});

describe('I11 photos end to end through the photo queue', () => {
  const JPEG = new Uint8Array(2048).map((_, i) => (i * 31) % 256);

  it('device A uploads, device B downloads the same bytes, usage counts them once', async () => {
    const photosA = new PhotoDevice(deviceA);
    const photosB = new PhotoDevice(deviceB);

    deviceA.write('sessions', sessionRow('p-s', 'Photo session', T0));
    const series = seriesRow('p-ser', 'p-s', 1, T0);
    series.photo_uri = 'file:///data/photos/p-ser.jpg';
    deviceA.write('series', series);
    photosA.files.set(series.photo_uri, JPEG);

    await photosA.drain();
    expect(photosA.queue.size).toBe(0);
    // The upload swapped the local path for the device-independent marker.
    expect(deviceA.get('series', 'p-ser')!.photo_uri).toBe(toSyncPhotoUri('p-ser'));

    await deviceA.sync();
    await deviceB.sync();
    expect(deviceB.get('series', 'p-ser')!.photo_uri).toBe(toSyncPhotoUri('p-ser'));

    await photosB.drain();
    expect(photosB.queue.size).toBe(0);
    expect(photosB.cache.get('p-ser')).toEqual(JPEG);

    // Same account: both devices see one photo's worth of usage.
    const usageA = await deviceA.photoApi().usage();
    expect(usageA.usedBytes).toBe(JPEG.byteLength);
    expect(usageA.remainingBytes).toBe(usageA.limitBytes - JPEG.byteLength);
    expect(await deviceB.photoApi().usage()).toEqual(usageA);

    // Nothing left to move on a second pass.
    await photosB.drain();
    expect(photosB.queue.size).toBe(0);
  });

  it("the server's 404 for a missing photo is classified as permanent", async () => {
    const photosB = new PhotoDevice(deviceB);
    const series = seriesRow('gone-ser', 'p-s', 1, T0);
    series.photo_uri = toSyncPhotoUri('never-uploaded');
    deviceB.write('series', series);

    await photosB.drain(1);

    expect(photosB.actions).toEqual([
      {
        type: 'giveUp',
        id: expect.any(String),
        attempts: MAX_PHOTO_ATTEMPTS,
        lastError: 'http_404',
        endPass: false,
      },
    ]);
    expect([...photosB.queue.values()]).toMatchObject([
      { kind: 'download', photoId: 'never-uploaded', lastError: 'http_404' },
    ]);
  });

  it('another account cannot download the photo', async () => {
    const photosA = new PhotoDevice(deviceA);
    const series = seriesRow('own-ser', 'p-s', 1, T0);
    series.photo_uri = 'file:///data/photos/own-ser.jpg';
    deviceA.write('series', series);
    photosA.files.set(series.photo_uri, JPEG);
    await photosA.drain();

    const stranger = new Device();
    stranger.token = (
      await accountApi(() => null).signUp(
        `stranger-${accountSeq}@example.invalid`,
        'correct horse battery staple',
        'S',
      )
    ).token;
    await expect(stranger.photoApi().download('own-ser')).rejects.toMatchObject({ status: 404 });
    expect(await stranger.photoApi().usage()).toMatchObject({ usedBytes: 0 });
  });
});
