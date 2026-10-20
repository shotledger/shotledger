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
