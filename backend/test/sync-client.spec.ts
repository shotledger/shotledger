// End-to-end: the REAL client sync engine (shared/src/sync-client) against
// the REAL Worker, in-process on the Workers pool — real D1, real R2, real
// better-auth. Two simulated devices on one account, per
// docs/specs/sync-app-spec.md §9 (I1–I7).
//
// Nothing is deployed and no network is touched: `app.fetch` is the transport.
import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  APPLY_ORDER,
  canonicalTags,
  createAccountApi,
  createHttpSyncTransport,
  liveSessionTags,
  rowKey,
  runSyncCycle,
  type ChangeRow,
  type LocalRowSnapshot,
  type LocalStore,
  type OutboxEntry,
  type RowRef,
  type SyncTableName,
} from '@shotledger/shared';

import { ALL_MIGRATIONS } from '../src/db/migrations';
import app from '../src/index';
import { row } from './rows';

const BASE_URL = 'https://localhost';

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

/**
 * The device. An in-memory stand-in for app/src/db/queries/sync-store.ts —
 * same LocalStore contract, same outbox semantics (rev-matched clear, id
 * reset on re-queue), no SQLite.
 */
class Device {
  readonly rows = new Map<string, Record<string, unknown>>();
  readonly outbox = new Map<string, OutboxEntry>();
  readonly cursors = new Map<SyncTableName, number>();
  /** sync_outbox.held and sync_refused (sync-family-refusal-spec.md §2.3). */
  readonly held = new Set<string>();
  readonly refused = new Map<string, RowRef>();
  private lastRev = 0;
  private token: string | null = null;

  private key(tableName: SyncTableName, rowId: string) {
    return `${tableName}:${rowId}`;
  }

  setToken(token: string | null) {
    this.token = token;
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
    // As the trigger: an edit keeps `held`, a soft delete releases it (C3).
    if (row.deleted_at != null) this.held.delete(this.key(tableName, rowId));
  }

  softDelete(tableName: SyncTableName, rowId: string, at: string): void {
    const existing = this.rows.get(this.key(tableName, rowId));
    if (!existing) throw new Error(`no local row ${tableName}/${rowId}`);
    this.write(tableName, { ...existing, deleted_at: at, updated_at: at });
  }

  get(tableName: SyncTableName, rowId: string) {
    return this.rows.get(this.key(tableName, rowId));
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
            // Same rule as the SQLite adapter: a tombstone for an unknown
            // row is a no-op, not a shell insert.
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
        [...this.outbox.values()]
          .filter((e) => !this.held.has(this.key(e.tableName, e.rowId)))
          .sort((a, b) => a.rev - b.rev)
          .slice(0, limit),
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
        if (current && current.rev === entry.rev) {
          this.outbox.delete(key);
          this.held.delete(key);
        }
      },
      readRefused: async () => [...this.refused.values()],
      addRefused: async (ref) => {
        this.refused.set(this.key(ref.tableName, ref.rowId), ref);
      },
      removeRefused: async (refs) => {
        for (const ref of refs) this.refused.delete(this.key(ref.tableName, ref.rowId));
      },
      holdOutboxEntry: async (entry, resetClientChangeId) => {
        const key = this.key(entry.tableName, entry.rowId);
        const current = this.outbox.get(key);
        if (!current || current.rev !== entry.rev) return;
        this.held.add(key);
        if (resetClientChangeId) current.clientChangeId = null;
      },
      releaseHeld: async (refs) => {
        for (const ref of refs) this.held.delete(this.key(ref.tableName, ref.rowId));
      },
      heldCount: async () => [...this.outbox.keys()].filter((key) => this.held.has(key)).length,
      readHeld: async () =>
        [...this.outbox.entries()].filter(([key]) => this.held.has(key)).map(([, e]) => e),
      pendingRowKeys: async () =>
        new Set([...this.outbox.values()].map((e) => rowKey(e.tableName, e.rowId))),
      pendingCount: async () => this.outbox.size,
    };
  }

  transport() {
    return createHttpSyncTransport({
      fetchImpl: fetchApp,
      baseUrl: BASE_URL,
      getToken: () => this.token,
    });
  }

  sync() {
    return runSyncCycle({ store: this.store(), transport: this.transport(), newId: uuid });
  }
}

function accountApi(getToken: () => string | null) {
  return createAccountApi({ fetchImpl: fetchApp, baseUrl: BASE_URL, getToken });
}

function sessionRow(id: string, name: string, updatedAt: string) {
  return row('sessions', id, updatedAt, {
    created_at: updatedAt,
    name,
    type: 'training',
    discipline_id: 'spsf:precision',
    started_at: updatedAt,
    is_championship: 0,
    decimal_scoring: 0,
  });
}

function seriesRow(id: string, sessionId: string, position: number, updatedAt: string) {
  return row('series', id, updatedAt, {
    created_at: updatedAt,
    session_id: sessionId,
    position,
    is_sighter: 0,
    is_final: 0,
    is_total_override: 0,
  });
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, ALL_MIGRATIONS);
});

let deviceA: Device;
let deviceB: Device;
let accountEmail: string;
let accountSeq = 0;

beforeEach(async () => {
  deviceA = new Device();
  deviceB = new Device();
  accountSeq += 1;
  // Synthetic address on a reserved TLD — never a real inbox (spec N3).
  accountEmail = `device-${accountSeq}@example.invalid`;

  const session = await accountApi(() => null).signUp(
    accountEmail,
    'correct horse battery staple',
    'Test Shooter',
  );
  // Both devices share one account, which is the whole point of sync.
  deviceA.setToken(session.token);
  const second = await accountApi(() => null).signIn(accountEmail, 'correct horse battery staple');
  deviceB.setToken(second.token);
});

describe('I1 authentication', () => {
  it('a signed-in device syncs and a signed-out one is refused', async () => {
    await expect(deviceA.sync()).resolves.toMatchObject({ status: 'ok' });

    const anonymous = new Device();
    anonymous.setToken(null);
    await expect(anonymous.sync()).rejects.toThrow(/401/);
  });

  it('rejects a made-up bearer token — the dev stub is not mounted', async () => {
    const impostor = new Device();
    impostor.setToken('some-other-users-id');
    await expect(impostor.sync()).rejects.toThrow(/401/);
  });
});

describe('I2 two devices converge', () => {
  it('device A creates a session with two series; device B ends up with both', async () => {
    const sessionId = 's-1';
    deviceA.write('sessions', sessionRow(sessionId, 'Träning', '2026-09-02T10:00:00.000Z'));
    deviceA.write('series', seriesRow('ser-1', sessionId, 1, '2026-09-02T10:00:00.000Z'));
    deviceA.write('series', seriesRow('ser-2', sessionId, 2, '2026-09-02T10:00:00.000Z'));

    const pushResult = await deviceA.sync();
    expect(pushResult.pushed).toBe(3);
    expect(deviceA.outbox.size).toBe(0);

    const pullResult = await deviceB.sync();
    expect(pullResult.pulled).toBe(3);
    expect(deviceB.get('sessions', sessionId)).toMatchObject({ name: 'Träning' });
    expect(deviceB.get('series', 'ser-1')).toMatchObject({ position: 1 });
    expect(deviceB.get('series', 'ser-2')).toMatchObject({ position: 2 });
    // A pull leaves nothing queued — applying must not re-enqueue.
    expect(deviceB.outbox.size).toBe(0);
  });

  it('carries an edit made on B back to A (last write wins through the server)', async () => {
    deviceA.write('sessions', sessionRow('s-2', 'First', '2026-09-02T10:00:00.000Z'));
    await deviceA.sync();
    await deviceB.sync();

    deviceB.write('sessions', sessionRow('s-2', 'Renamed on B', '2026-09-02T11:00:00.000Z'));
    await deviceB.sync();
    await deviceA.sync();

    expect(deviceA.get('sessions', 's-2')).toMatchObject({ name: 'Renamed on B' });
  });
});

describe('I3/I4 deletes travel in both directions', () => {
  it('A deletes a series, B sees it; B deletes the session, A sees it', async () => {
    deviceA.write('sessions', sessionRow('s-3', 'Träning', '2026-09-02T10:00:00.000Z'));
    deviceA.write('series', seriesRow('ser-3', 's-3', 1, '2026-09-02T10:00:00.000Z'));
    await deviceA.sync();
    await deviceB.sync();

    deviceA.softDelete('series', 'ser-3', '2026-09-02T12:00:00.000Z');
    await deviceA.sync();
    await deviceB.sync();
    expect(deviceB.get('series', 'ser-3')).toMatchObject({
      deleted_at: '2026-09-02T12:00:00.000Z',
    });

    deviceB.softDelete('sessions', 's-3', '2026-09-02T13:00:00.000Z');
    await deviceB.sync();
    await deviceA.sync();
    expect(deviceA.get('sessions', 's-3')).toMatchObject({
      deleted_at: '2026-09-02T13:00:00.000Z',
    });
  });
});

describe('I5 tombstone wins over an offline edit', () => {
  it('B edits a row A already deleted: the push is rejected and B learns the tombstone', async () => {
    deviceA.write('sessions', sessionRow('s-4', 'Doomed', '2026-09-02T10:00:00.000Z'));
    await deviceA.sync();
    await deviceB.sync();

    // B goes offline and edits; A deletes and syncs first.
    deviceB.write('sessions', sessionRow('s-4', 'Edited offline', '2026-09-02T14:00:00.000Z'));
    deviceA.softDelete('sessions', 's-4', '2026-09-02T13:00:00.000Z');
    await deviceA.sync();

    const result = await deviceB.sync();
    expect(result.rejected).toBe(1);
    expect(deviceB.outbox.size).toBe(0);

    // The rejection itself tombstones the row on B. The timestamp is B's own
    // edit time, not the server's 13:00 — a local marker that never travels
    // (the outbox entry is cleared), so the two devices still agree on the
    // fact that matters: the row is deleted.
    expect(deviceB.get('sessions', 's-4')!.deleted_at).not.toBeNull();
    const after = await deviceB.sync();
    expect(after.pushed).toBe(0);
    expect(deviceB.outbox.size).toBe(0);
  });
});

describe('I6 accounts are isolated', () => {
  it('a second account sees none of the first account rows', async () => {
    deviceA.write('sessions', sessionRow('s-5', 'Private', '2026-09-02T10:00:00.000Z'));
    await deviceA.sync();

    const stranger = new Device();
    const strangerSession = await accountApi(() => null).signUp(
      `stranger-${accountSeq}@example.invalid`,
      'correct horse battery staple',
      'Stranger',
    );
    stranger.setToken(strangerSession.token);

    const result = await stranger.sync();
    expect(result.pulled).toBe(0);
    expect(stranger.rows.size).toBe(0);
  });
});

// docs/specs/sync-payload-validation-spec.md P7.
describe('P7 a refused row is counted and cleared, and stays on the phone', () => {
  const firearm = (make: string | null, updatedAt: string) =>
    row('firearms', 'f-p7', updatedAt, { make, model: 'P7', is_own: true });

  it('counts the refusal, clears the entry, keeps the row; an edit sends it again', async () => {
    const broken = firearm(null, '2026-09-02T10:00:00.000Z');
    deviceA.write('firearms', broken);

    await expect(deviceA.sync()).resolves.toMatchObject({ invalid: 1, rejected: 0, pushed: 0 });
    expect(deviceA.outbox.size).toBe(0);
    expect(deviceA.get('firearms', 'f-p7')).toEqual(broken);

    await deviceB.sync();
    expect(deviceB.get('firearms', 'f-p7')).toBeUndefined();

    const fixed = firearm('Anschutz', '2026-09-02T11:00:00.000Z');
    deviceA.write('firearms', fixed);
    await expect(deviceA.sync()).resolves.toMatchObject({ invalid: 0, pushed: 1, duplicates: 0 });

    await deviceB.sync();
    expect(deviceB.get('firearms', 'f-p7')).toEqual(fixed);
  });
});

describe('I7 a replayed push is idempotent', () => {
  it('the same clientChangeId acks duplicate and creates no second row', async () => {
    deviceA.write('sessions', sessionRow('s-6', 'Once', '2026-09-02T10:00:00.000Z'));

    // Simulate a dropped response: push through the transport directly, then
    // let the engine retry the still-queued entry with the same id.
    const store = deviceA.store();
    const entry = (await store.readOutbox(10))[0]!;
    const clientChangeId = uuid();
    await store.assignClientChangeId(entry, clientChangeId);
    const row = (await store.readRow('sessions', 's-6'))!;
    await deviceA.transport().push({
      protocolVersion: 1,
      changes: [
        {
          clientChangeId,
          tableName: 'sessions',
          rowId: 's-6',
          payload: row.payload,
          deletedAt: null,
          updatedAt: row.updatedAt,
        },
      ],
    });

    const result = await deviceA.sync();
    expect(result.duplicates).toBe(1);
    expect(result.pushed).toBe(0);

    const pulled = await deviceB.sync();
    expect(pulled.pulled).toBe(1);
  });
});

describe('account deletion', () => {
  it('dry run reports counts without deleting; the real delete revokes the session', async () => {
    deviceA.write('sessions', sessionRow('s-7', 'Doomed account', '2026-09-02T10:00:00.000Z'));
    await deviceA.sync();

    const dry = await accountApi(() => tokenOf(deviceA)).deleteAccount(true);
    expect(dry.syncRows).toBe(1);

    await accountApi(() => tokenOf(deviceA)).deleteAccount(false);
    await expect(deviceA.sync()).rejects.toThrow(/401/);
  });
});

/** The device's bearer token, without widening Device's public surface. */
function tokenOf(device: Device): string | null {
  return (device as unknown as { token: string | null }).token;
}

// docs/specs/sync-tags-settings-spec.md, E1–E8. The devices hold rows, not
// SQLite, so tag names and links are read through the same shared resolver
// the app and the web use.
describe('session tags and account settings travel between devices', () => {
  const T0 = '2026-10-06T10:00:00.000Z';
  const tagRow = (id: string, name: string) => ({
    id,
    created_at: T0,
    updated_at: T0,
    deleted_at: null,
    name,
  });
  const linkRow = (id: string, sessionId: string, tagId: string) => ({
    id,
    created_at: T0,
    updated_at: T0,
    deleted_at: null,
    session_id: sessionId,
    tag_id: tagId,
  });
  const settingRow = (id: string, value: string, at = T0) => ({
    id,
    value,
    created_at: T0,
    updated_at: at,
    deleted_at: null,
  });

  function rowsOf(device: Device, table: SyncTableName) {
    return [...device.rows.entries()]
      .filter(([key]) => key.startsWith(`${table}:`))
      .map(([, row]) => row);
  }
  function tagsOn(device: Device) {
    return rowsOf(device, 'tags').map((row) => ({
      id: row.id as string,
      name: row.name as string,
      deletedAt: (row.deleted_at as string | null) ?? null,
    }));
  }
  /** `session -> tag names`, as every reader resolves it. */
  function taggedOn(device: Device) {
    const names = new Map(canonicalTags(tagsOn(device)).map((t) => [t.id, t.name]));
    const links = rowsOf(device, 'session_tags').map((row) => ({
      sessionId: row.session_id as string,
      tagId: row.tag_id as string,
      deletedAt: (row.deleted_at as string | null) ?? null,
    }));
    return liveSessionTags(tagsOn(device), links)
      .map(({ sessionId, tagId }) => `${sessionId}:${names.get(tagId)}`)
      .sort();
  }

  async function sharedSessionAndTag() {
    deviceA.write('sessions', sessionRow('s1', 'S1', T0));
    deviceA.write('tags', tagRow('t1', 'KM'));
    await deviceA.sync();
    await deviceB.sync();
  }

  it('E1/E2 a tag added on A appears on B, and its removal follows', async () => {
    await sharedSessionAndTag();
    deviceA.write('session_tags', linkRow('l1', 's1', 't1'));
    await deviceA.sync();
    await deviceB.sync();
    expect(taggedOn(deviceB)).toEqual(['s1:KM']);

    deviceA.softDelete('session_tags', 'l1', '2026-10-06T11:00:00.000Z');
    await deviceA.sync();
    await deviceB.sync();
    expect(taggedOn(deviceB)).toEqual([]);
  });

  it('E3 both devices tag the same session offline: each shows it once', async () => {
    await sharedSessionAndTag();
    deviceA.write('session_tags', linkRow('la', 's1', 't1'));
    deviceB.write('session_tags', linkRow('lb', 's1', 't1'));
    await deviceA.sync();
    await deviceB.sync();
    await deviceA.sync();
    expect(rowsOf(deviceA, 'session_tags')).toHaveLength(2);
    expect(taggedOn(deviceA)).toEqual(['s1:KM']);
    expect(taggedOn(deviceB)).toEqual(['s1:KM']);
  });

  it('E4 add wins over a concurrent remove it never saw', async () => {
    await sharedSessionAndTag();
    deviceA.write('session_tags', linkRow('l1', 's1', 't1'));
    await deviceA.sync();
    // B is offline from here and links the same pair itself.
    deviceB.write('session_tags', linkRow('l2', 's1', 't1'));
    deviceA.softDelete('session_tags', 'l1', '2026-10-06T11:00:00.000Z');
    await deviceA.sync();
    await deviceB.sync();
    await deviceA.sync();
    expect(taggedOn(deviceA)).toEqual(['s1:KM']);
    expect(taggedOn(deviceB)).toEqual(['s1:KM']);
  });

  it('E5 birth year set on A reaches B; of two later edits the later push wins', async () => {
    deviceA.write('settings', settingRow('birthYear', '1980'));
    await deviceA.sync();
    await deviceB.sync();
    expect(deviceB.get('settings', 'birthYear')).toMatchObject({ value: '1980' });

    deviceA.write('settings', settingRow('birthYear', '1985', '2026-10-06T12:00:00.000Z'));
    deviceB.write('settings', settingRow('birthYear', '1990', '2026-10-06T11:00:00.000Z'));
    await deviceA.sync();
    await deviceB.sync();
    await deviceA.sync();
    // Server order, not the clock: B pushed last, with the older updated_at.
    expect(deviceA.get('settings', 'birthYear')).toMatchObject({ value: '1990' });
    expect(deviceB.get('settings', 'birthYear')).toMatchObject({ value: '1990' });
  });

  it('E6 a device-local setting pushed by a client without the trigger guard never reaches B', async () => {
    deviceA.write('settings', settingRow('backupFolder', '"content://mine"'));
    await expect(deviceA.sync()).rejects.toThrow(/400/);
    await deviceB.sync();
    expect(rowsOf(deviceB, 'settings')).toEqual([]);
  });

  it('E7 both devices create tag KM offline: both sync, and each shows one KM over both sessions', async () => {
    deviceA.write('sessions', sessionRow('s1', 'S1', T0));
    deviceA.write('sessions', sessionRow('s2', 'S2', T0));
    await deviceA.sync();
    await deviceB.sync();

    deviceA.write('tags', tagRow('t-a', 'KM'));
    deviceA.write('session_tags', linkRow('la', 's1', 't-a'));
    deviceB.write('tags', tagRow('t-b', 'KM'));
    deviceB.write('session_tags', linkRow('lb', 's2', 't-b'));
    await expect(deviceA.sync()).resolves.toMatchObject({ status: 'ok' });
    await expect(deviceB.sync()).resolves.toMatchObject({ status: 'ok' });
    await expect(deviceA.sync()).resolves.toMatchObject({ status: 'ok' });

    for (const device of [deviceA, deviceB]) {
      expect(canonicalTags(tagsOn(device))).toEqual([{ id: 't-a', name: 'KM' }]);
      expect(taggedOn(device)).toEqual(['s1:KM', 's2:KM']);
    }
  });

  it('E8 a tag deleted on A and re-created by name syncs to B', async () => {
    await sharedSessionAndTag();
    deviceA.softDelete('tags', 't1', '2026-10-06T11:00:00.000Z');
    deviceA.write('tags', tagRow('t2', 'KM'));
    deviceA.write('session_tags', linkRow('l1', 's1', 't2'));
    await deviceA.sync();
    await deviceB.sync();
    expect(canonicalTags(tagsOn(deviceB))).toEqual([{ id: 't2', name: 'KM' }]);
    expect(taggedOn(deviceB)).toEqual(['s1:KM']);
  });
});

// docs/specs/sync-family-refusal-spec.md H1–H10: the phone holds a refused
// row's family across pushes. H11 (restart) is the SQLite adapter's
// (app/src/db/queries/sync-store.test.ts); H12 is the web's
// (sync-family-refusal.spec.ts).
describe('the phone holds a refused row’s family across pushes', () => {
  const T0 = '2026-10-14T10:00:00.000Z';
  const T1 = '2026-10-14T11:00:00.000Z';
  const badSession = (id: string, at = T0) =>
    row('sessions', id, at, { ...sessionRow(id, 'x', at), name: null });
  const shotRow = (id: string, seriesId: string, value: number | null = 90, at = T0) =>
    row('shots', id, at, { created_at: at, series_id: seriesId, position: 1, value_tenths: value });
  const firearmRow = (id: string, make: string | null, at = T0) =>
    row('firearms', id, at, { make, model: 'M', is_own: true });
  const licenseRow = (id: string, firearmId: string, purpose: unknown = 'Målskjutning') =>
    row('licenses', id, T0, { firearm_id: firearmId, purpose });

  /** Runs one cycle on `device`, recording what each push carried. */
  async function syncRecording(device: Device) {
    const pushes: string[][] = [];
    const inner = device.transport();
    const result = await runSyncCycle({
      store: device.store(),
      transport: {
        pull: (request) => inner.pull(request),
        push: (request) => {
          pushes.push(request.changes.map((c) => `${c.tableName}:${c.rowId}`));
          return inner.push(request);
        },
      },
      newId: uuid,
    });
    return { result, pushes, sent: pushes.flat() };
  }

  const heldOn = (device: Device) => device.store().heldCount();

  /** H1's setup: s1 pushed alone and refused, then R1, T1, T2 entered. */
  async function refusedSessionWithFamily() {
    deviceA.write('sessions', badSession('s1'));
    await expect(deviceA.sync()).resolves.toMatchObject({ invalid: 1 });
    deviceA.write('series', seriesRow('r1', 's1', 1, T0));
    deviceA.write('shots', shotRow('t1', 'r1'));
    deviceA.write('shots', shotRow('t2', 'r1'));
  }

  it('H1 rows recorded after a refused session row are held', async () => {
    await refusedSessionWithFamily();

    const { result, sent } = await syncRecording(deviceA);

    expect(sent).toEqual([]);
    expect(result).toMatchObject({ status: 'ok', held: 3, pushed: 0 });
    expect(await heldOn(deviceA)).toBe(3);
    await expect(deviceB.sync()).resolves.toMatchObject({ pulled: 0 });
  });

  it('H2 fixing the refused row sends the family', async () => {
    await refusedSessionWithFamily();
    await deviceA.sync();

    deviceA.write('sessions', sessionRow('s1', 'Fixed', T1));
    const { result, pushes } = await syncRecording(deviceA);

    expect(pushes).toEqual([['series:r1', 'shots:t1', 'shots:t2', 'sessions:s1']]);
    expect(result).toMatchObject({ pushed: 4, held: 0, invalid: 0 });
    expect(await heldOn(deviceA)).toBe(0);
    await deviceB.sync();
    expect(deviceB.get('sessions', 's1')).toMatchObject({ name: 'Fixed' });
    expect(deviceB.get('shots', 't2')).toBeDefined();
  });

  it('H3 rows refused as family are held, not lost', async () => {
    deviceA.write('sessions', badSession('s1'));
    deviceA.write('series', seriesRow('r1', 's1', 1, T0));
    deviceA.write('shots', shotRow('t1', 'r1'));
    deviceA.write('shots', shotRow('t2', 'r1'));

    const first = await syncRecording(deviceA);
    expect(first.result).toMatchObject({ invalid: 1, held: 3, rejected: 0 });
    const queued = [...deviceA.outbox.values()];
    expect(queued.map((e) => e.rowId)).toEqual(['r1', 't1', 't2']);
    expect(queued.every((e) => e.clientChangeId === null)).toBe(true);
    expect(await heldOn(deviceA)).toBe(3);

    deviceA.write('sessions', sessionRow('s1', 'Fixed', T1));
    const second = await syncRecording(deviceA);
    expect(second.result).toMatchObject({ pushed: 4, duplicates: 0, held: 0 });
    await deviceB.sync();
    expect(deviceB.get('shots', 't1')).toBeDefined();
  });

  it('H4 a refused shot freezes the session on other devices', async () => {
    deviceA.write('sessions', sessionRow('s1', 'Before', T0));
    deviceA.write('series', seriesRow('r1', 's1', 1, T0));
    deviceA.write('shots', shotRow('t1', 'r1'));
    await deviceA.sync();
    await deviceB.sync();
    deviceA.write('shots', shotRow('t2', 'r1', null));
    await expect(deviceA.sync()).resolves.toMatchObject({ invalid: 1 });

    deviceA.write('shots', shotRow('t3', 'r1'));
    deviceA.write('sessions', sessionRow('s1', 'Renamed', T1));
    const { sent } = await syncRecording(deviceA);

    expect(sent).toEqual([]);
    await deviceB.sync();
    expect(deviceB.get('sessions', 's1')).toMatchObject({ name: 'Before' });
    expect(deviceB.get('shots', 't1')).toBeDefined();
    expect(deviceB.get('shots', 't3')).toBeUndefined();
  });

  it('H5 a refused firearm holds its rows; a session shot with it is pushed', async () => {
    deviceA.write('firearms', firearmRow('f1', null));
    await expect(deviceA.sync()).resolves.toMatchObject({ invalid: 1 });

    deviceA.write('licenses', licenseRow('l1', 'f1'));
    deviceA.write(
      'sessions',
      row('sessions', 's1', T0, { ...sessionRow('s1', 'S', T0), firearm_id: 'f1' }),
    );
    const { sent } = await syncRecording(deviceA);

    expect(sent).toEqual(['sessions:s1']);
    expect(await heldOn(deviceA)).toBe(1);
  });

  it('H6 a refused license holds only itself', async () => {
    deviceA.write('firearms', firearmRow('f1', 'Pardini'));
    await deviceA.sync();
    deviceA.write('licenses', licenseRow('l1', 'f1', 42));
    await expect(deviceA.sync()).resolves.toMatchObject({ invalid: 1 });

    deviceA.write('firearms', firearmRow('f1', 'Walther', T1));
    deviceA.write('firearm_groups', row('firearm_groups', 'g1', T0, { firearm_id: 'f1' }));
    const { sent, result } = await syncRecording(deviceA);

    expect(sent).toEqual(['firearms:f1', 'firearm_groups:g1']);
    expect(result).toMatchObject({ pushed: 2, held: 0 });
  });

  it('H7 deleting the refused row releases the family', async () => {
    await refusedSessionWithFamily();
    await deviceA.sync();

    deviceA.softDelete('sessions', 's1', T1);
    const { result, sent } = await syncRecording(deviceA);

    expect(sent).toContain('sessions:s1');
    expect(result).toMatchObject({ held: 0, invalid: 0, rejected: 0 });
    expect(await heldOn(deviceA)).toBe(0);
    expect(deviceA.outbox.size).toBe(0);
  });

  it('H8 a pull that replaces the refused row releases the family', async () => {
    deviceA.write('sessions', sessionRow('s1', 'S', T0));
    deviceA.write('series', seriesRow('r1', 's1', 1, T0));
    await deviceA.sync();
    await deviceB.sync();
    deviceA.write('shots', shotRow('t2', 'r1', null));
    await deviceA.sync();
    deviceA.write('shots', shotRow('t3', 'r1'));
    await deviceA.sync();
    expect(await heldOn(deviceA)).toBe(1);

    deviceB.write('shots', shotRow('t2', 'r1', 80, T1));
    await deviceB.sync();
    const { sent } = await syncRecording(deviceA);

    expect(deviceA.refused.size).toBe(0);
    expect(deviceA.get('shots', 't2')).toMatchObject({ value_tenths: 80 });
    expect(sent).toEqual(['shots:t3']);
    expect(await heldOn(deviceA)).toBe(0);
  });

  it('H9 held entries never stall the outbox', async () => {
    deviceA.write('sessions', badSession('s1'));
    await deviceA.sync();
    deviceA.write('series', seriesRow('r1', 's1', 1, T0));
    for (let i = 0; i < 599; i += 1) deviceA.write('shots', shotRow(`t${i}`, 'r1'));
    await expect(deviceA.sync()).resolves.toMatchObject({ status: 'ok', held: 600 });

    for (let i = 0; i < 10; i += 1) {
      deviceA.write('tags', row('tags', `g${i}`, T0, { name: `Tag ${i}` }));
    }
    const { result, pushes } = await syncRecording(deviceA);

    expect(pushes).toHaveLength(1);
    expect(pushes[0]).toHaveLength(10);
    expect(result).toMatchObject({ status: 'ok', pushed: 10 });
    expect(await heldOn(deviceA)).toBe(600);
  });

  it('H10 tombstones are never held', async () => {
    deviceA.write('sessions', sessionRow('s1', 'S', T0));
    deviceA.write('series', seriesRow('r1', 's1', 1, T0));
    deviceA.write('shots', shotRow('t1', 'r1'));
    await deviceA.sync();
    await deviceB.sync();
    deviceA.write('sessions', badSession('s1', T1));
    await expect(deviceA.sync()).resolves.toMatchObject({ invalid: 1 });

    deviceA.softDelete('shots', 't1', T1);
    const { sent, result } = await syncRecording(deviceA);

    expect(sent).toEqual(['shots:t1']);
    expect(result).toMatchObject({ pushed: 1, held: 0 });
    await deviceB.sync();
    expect(deviceB.get('shots', 't1')).toMatchObject({ deleted_at: T1 });
  });

  // Verifier round 1, B1: the deletion of a row that is already held.
  it('H10 a tombstone of an already-held row is pushed', async () => {
    deviceA.write('sessions', sessionRow('s1', 'S', T0));
    deviceA.write('series', seriesRow('r1', 's1', 1, T0));
    deviceA.write('shots', shotRow('t1', 'r1'));
    await deviceA.sync();
    await deviceB.sync();
    deviceA.write('sessions', badSession('s1', T1));
    await expect(deviceA.sync()).resolves.toMatchObject({ invalid: 1 });
    deviceA.write('shots', shotRow('t1', 'r1', 80, T1));
    await expect(deviceA.sync()).resolves.toMatchObject({ held: 1 });

    const T2 = '2026-10-14T12:00:00.000Z';
    deviceA.softDelete('shots', 't1', T2);
    const { sent, result } = await syncRecording(deviceA);

    expect(sent).toEqual(['shots:t1']);
    expect(result).toMatchObject({ pushed: 1, held: 0 });
    expect(await heldOn(deviceA)).toBe(0);
    expect(deviceA.outbox.size).toBe(0);
    await deviceB.sync();
    expect(deviceB.get('shots', 't1')).toMatchObject({ deleted_at: T2 });
  });

  // Revision 2 item 7 (verifier round 2, B-1): the invalid row is acked
  // `tombstoned` (C11 precedence), so it never enters the refused set, and
  // nothing refused is left to release its family_refused rows.
  it('H13 a held row whose blocker was acked tombstoned is released and sent', async () => {
    deviceA.write('sessions', sessionRow('s1', 'Before', T0));
    await deviceA.sync();
    await deviceB.sync();
    deviceB.softDelete('sessions', 's1', T1);
    await deviceB.sync();

    // A, before it syncs: an invalid edit of s1, then a new series and shot.
    const T2 = '2026-10-14T12:00:00.000Z';
    deviceA.write('sessions', badSession('s1', T2));
    deviceA.write('series', seriesRow('r1', 's1', 1, T2));
    deviceA.write('shots', shotRow('t1', 'r1', 90, T2));
    await expect(deviceA.sync()).resolves.toMatchObject({ rejected: 1, held: 2, invalid: 0 });
    expect(deviceA.refused.size).toBe(0);
    expect(deviceA.get('sessions', 's1')).toMatchObject({ deleted_at: T2 });

    const { result, pushes } = await syncRecording(deviceA);

    // They go out as they did before family refusal: the server has no
    // foreign-key check (N5), and the session is deleted everywhere.
    expect(pushes).toEqual([['series:r1', 'shots:t1']]);
    expect(result).toMatchObject({ pushed: 2, held: 0 });
    expect(await heldOn(deviceA)).toBe(0);
    expect(deviceA.outbox.size).toBe(0);
    await deviceB.sync();
    expect(deviceB.get('sessions', 's1')).toMatchObject({ deleted_at: T1 });
    expect(deviceB.get('shots', 't1')).toMatchObject({ value_tenths: 90 });
  });

  it('H13 a refused row whose session another device deleted holds nothing', async () => {
    deviceA.write('sessions', sessionRow('s1', 'S', T0));
    deviceA.write('series', seriesRow('r1', 's1', 1, T0));
    await deviceA.sync();
    await deviceB.sync();
    deviceA.write('shots', shotRow('t1', 'r1', null));
    await expect(deviceA.sync()).resolves.toMatchObject({ invalid: 1 });
    deviceA.write('shots', shotRow('t2', 'r1'));
    await expect(deviceA.sync()).resolves.toMatchObject({ held: 1 });

    deviceB.softDelete('sessions', 's1', T1);
    await deviceB.sync();
    const { result, sent } = await syncRecording(deviceA);

    expect(deviceA.get('sessions', 's1')).toMatchObject({ deleted_at: T1 });
    expect(sent).toEqual(['shots:t2']);
    expect(result).toMatchObject({ pushed: 1, held: 0 });
    expect(await heldOn(deviceA)).toBe(0);
  });

  // Revision 2 item 8 (verifier round 2, B-2): a held edit is not pushed in
  // the cycle that pulls, so it must not shadow another device's later
  // change, or it overwrites that change everywhere once released.
  describe('a held edit does not shadow a pull', () => {
    const T2 = '2026-10-14T12:00:00.000Z';
    const T3 = '2026-10-14T13:00:00.000Z';

    /** s1 with R1 and T1 on both devices; then A's T2 refused and A's rename of s1 held. */
    async function heldRenameOnA() {
      deviceA.write('sessions', sessionRow('s1', 'Before', T0));
      deviceA.write('series', seriesRow('r1', 's1', 1, T0));
      deviceA.write('shots', shotRow('t1', 'r1'));
      await deviceA.sync();
      await deviceB.sync();
      deviceA.write('shots', shotRow('t2', 'r1', null, T1));
      await expect(deviceA.sync()).resolves.toMatchObject({ invalid: 1 });
      deviceA.write('sessions', sessionRow('s1', 'A-name', T1));
      await expect(deviceA.sync()).resolves.toMatchObject({ held: 1 });
    }

    it('H14 another device’s later rename of a held row wins on both devices', async () => {
      await heldRenameOnA();
      deviceB.write('sessions', sessionRow('s1', 'B-name', T2));
      await deviceB.sync();

      await expect(deviceA.sync()).resolves.toMatchObject({ pulled: 1, shadowed: 0, held: 0 });
      expect(deviceA.get('sessions', 's1')).toMatchObject({ name: 'B-name' });
      expect(await heldOn(deviceA)).toBe(0);

      // A fixes T2: only T2 goes out, and B-name stays everywhere.
      deviceA.write('shots', shotRow('t2', 'r1', 80, T3));
      const { pushes } = await syncRecording(deviceA);
      expect(pushes).toEqual([['shots:t2']]);
      await deviceB.sync();
      await deviceA.sync();
      expect(deviceA.get('sessions', 's1')).toMatchObject({ name: 'B-name' });
      expect(deviceB.get('sessions', 's1')).toMatchObject({ name: 'B-name' });
      expect(deviceB.get('shots', 't2')).toMatchObject({ value_tenths: 80 });
    });

    it('H15 another device’s deletion of a held row arrives at once', async () => {
      await heldRenameOnA();
      deviceB.softDelete('sessions', 's1', T2);
      deviceB.softDelete('series', 'r1', T2);
      await deviceB.sync();

      await expect(deviceA.sync()).resolves.toMatchObject({ shadowed: 0, held: 0 });

      expect(deviceA.get('sessions', 's1')).toMatchObject({ deleted_at: T2 });
      expect(deviceA.get('series', 'r1')).toMatchObject({ deleted_at: T2 });
      expect(await heldOn(deviceA)).toBe(0);
      expect(deviceA.outbox.size).toBe(0);
    });

    // Revision 2 item 9 (verifier round 3, B-1): the pull returns this
    // device's own pushes too, so the echo of an older push must not drop
    // the edit held after it.
    async function heldEditAfterOwnPush(validT2: boolean) {
      deviceA.write('sessions', sessionRow('s1', 'Before', T0));
      deviceA.write('series', seriesRow('r1', 's1', 1, T0));
      deviceA.write('shots', shotRow('t1', 'r1'));
      await deviceA.sync();
      await deviceB.sync();
      await deviceA.sync();
      // One push: A1, and a shot T2 of r1 (r1 not in the push, so s1 lands).
      deviceA.write('sessions', sessionRow('s1', 'A1', T1));
      deviceA.write('shots', shotRow('t2', 'r1', validT2 ? 80 : null, T1));
      // The user renames s1 again while that push is in flight.
      const inner = deviceA.transport();
      let calls = 0;
      const first = await runSyncCycle({
        store: deviceA.store(),
        transport: {
          pull: (request) => inner.pull(request),
          push: (request) => {
            calls += 1;
            if (calls === 1) deviceA.write('sessions', sessionRow('s1', 'A2', T2));
            return inner.push(request);
          },
        },
        newId: uuid,
      });
      // The rerun the controller schedules for the mid-push write.
      const rerun = await deviceA.sync();
      await deviceB.sync();
      return { first, rerun };
    }

    it('H16 this device’s own older push, pulled back, does not drop its held edit', async () => {
      const { first, rerun } = await heldEditAfterOwnPush(false);
      expect(first).toMatchObject({ pushed: 1, invalid: 1, held: 1 });
      expect(rerun).toMatchObject({ pulled: 0, shadowed: 1, held: 1 });
      expect(deviceA.get('sessions', 's1')).toMatchObject({ name: 'A2' });
      expect(await heldOn(deviceA)).toBe(1);

      deviceA.write('shots', shotRow('t2', 'r1', 70, T3));
      const { pushes } = await syncRecording(deviceA);
      expect(pushes).toEqual([['sessions:s1', 'shots:t2']]);
      await deviceB.sync();
      expect(deviceA.get('sessions', 's1')).toMatchObject({ name: 'A2' });
      expect(deviceB.get('sessions', 's1')).toMatchObject({ name: 'A2' });
    });

    it('H16 control: without the refusal the later rename wins as well', async () => {
      await heldEditAfterOwnPush(true);
      await deviceA.sync();
      await deviceB.sync();
      expect(deviceA.get('sessions', 's1')).toMatchObject({ name: 'A2' });
      expect(deviceB.get('sessions', 's1')).toMatchObject({ name: 'A2' });
    });

    // Revision 2 item 10 (verifier round 3, B-2): a push that fails before
    // a held entry is read again must leave it held, or it shadows the next
    // pull. A batch of 1 or 2 stands in for more than 500 queued entries.
    it('H17 a held edit stays held through failed pushes, so a later edit elsewhere still wins', async () => {
      deviceA.write('sessions', sessionRow('s1', 'Before', T0));
      deviceA.write('series', seriesRow('r1', 's1', 1, T0));
      deviceA.write('shots', shotRow('t1', 'r1'));
      await deviceA.sync();
      await deviceB.sync();
      await deviceA.sync();
      deviceA.write('shots', shotRow('t2', 'r1', null, T1));
      await expect(deviceA.sync()).resolves.toMatchObject({ invalid: 1 });
      deviceA.write('tags', row('tags', 'g0', T1, { name: 'G' }));
      deviceA.write('sessions', sessionRow('s1', 'A-name', T1));

      const failing = (batch: number) => {
        const inner = deviceA.transport();
        return runSyncCycle({
          store: deviceA.store(),
          transport: {
            pull: (request) => inner.pull(request),
            push: async () => {
              throw new Error('network');
            },
          },
          newId: uuid,
          pushBatchMax: batch,
        });
      };
      await expect(failing(2)).rejects.toThrow('network');
      expect(await heldOn(deviceA)).toBe(1);
      await expect(failing(1)).rejects.toThrow('network');
      expect(await heldOn(deviceA)).toBe(1);

      deviceB.write('sessions', sessionRow('s1', 'B-name', T2));
      await deviceB.sync();
      await expect(deviceA.sync()).resolves.toMatchObject({ shadowed: 0, held: 0 });
      expect(deviceA.get('sessions', 's1')).toMatchObject({ name: 'B-name' });

      deviceA.write('shots', shotRow('t2', 'r1', 70, T3));
      await deviceA.sync();
      await deviceB.sync();
      expect(deviceA.get('sessions', 's1')).toMatchObject({ name: 'B-name' });
      expect(deviceB.get('sessions', 's1')).toMatchObject({ name: 'B-name' });
    });
  });
});
