// Two phones on the real SQLite adapters (sync-store.ts, the capture triggers,
// the tag and settings queries) and the real client engine, against the
// server's merge rules held in memory. The Worker itself is exercised by
// backend/test/sync-client.spec.ts; this covers the device side, where the
// tag-name wedge lived. docs/specs/sync-tags-settings-spec.md E10–E12.
import {
  mergeChange,
  PROTOCOL_VERSION,
  runSyncCycle,
  type ChangeRow,
  type PullRequest,
  type PushRequest,
  type StoredRow,
  type SyncTransport,
} from '@shotledger/shared';
import { describe, expect, it } from 'vitest';

import { createSession } from './queries/sessions';
import { getSetting, SETTINGS_KEYS, setSetting } from './queries/settings';
import { createSyncStore } from './queries/sync-store';
import {
  addSessionTag,
  createTag,
  getOrCreateTag,
  listTags,
  listTagsBySession,
  removeSessionTag,
} from './queries/tags';
import { createTestDb } from './test-db';
import type { Database } from './types';

/** The server's merge rules over an in-memory store (the Worker runs the same rules in SQL). */
function memoryServer(): SyncTransport & {
  rows: Map<string, StoredRow>;
  seed(tableName: StoredRow['tableName'], payload: Record<string, unknown>): void;
} {
  const stored = new Map<string, StoredRow>();
  let seq = 0;
  return {
    rows: stored,
    seed(tableName, payload) {
      seq += 1;
      const rowId = payload.id as string;
      stored.set(`${tableName}:${rowId}`, {
        tableName,
        rowId,
        seq,
        payload,
        updatedAt: payload.updated_at as string,
        deletedAt: null,
      });
    },
    async push(request: PushRequest) {
      return {
        protocolVersion: PROTOCOL_VERSION,
        acks: request.changes.map((change) => {
          const key = `${change.tableName}:${change.rowId}`;
          const result = mergeChange(stored.get(key), change, seq + 1);
          if (result.status === 'rejected') {
            return {
              clientChangeId: change.clientChangeId,
              status: 'rejected' as const,
              reason: result.reason,
            };
          }
          seq += 1;
          stored.set(key, result.row);
          return { clientChangeId: change.clientChangeId, status: 'applied' as const, seq };
        }),
      };
    },
    async pull(request: PullRequest) {
      const changes: ChangeRow[] = [...stored.values()]
        .filter((row) =>
          request.tables.some((t) => t.tableName === row.tableName && row.seq > t.cursor),
        )
        .sort((a, b) => a.seq - b.seq);
      return {
        protocolVersion: PROTOCOL_VERSION,
        changes,
        nextCursors: request.tables.map(({ tableName, cursor }) => ({
          tableName,
          cursor: Math.max(
            cursor,
            ...changes.filter((c) => c.tableName === tableName).map((c) => c.seq),
          ),
          hasMore: false,
        })),
      };
    },
  };
}

let n = 0;
const newId = () => `00000000-0000-4000-8000-${(n += 1).toString(16).padStart(12, '0')}`;

function sync(db: Database, server: SyncTransport) {
  return runSyncCycle({ store: createSyncStore(db), transport: server, newId });
}

function session(db: Database, name: string) {
  return createSession(db, {
    name,
    type: 'training',
    disciplineId: 'spsf-precision',
    startedAt: '2026-10-01T10:00:00.000Z',
  }).id;
}

describe('tags and account settings between two phones', () => {
  it('E10 tags and allowlisted settings reach the second phone; device-local ones do not', async () => {
    const server = memoryServer();
    const a = createTestDb();
    const b = createTestDb();
    const s1 = session(a, 'One');
    const s2 = session(a, 'Two');
    addSessionTag(a, s1, getOrCreateTag(a, 'KM').id);
    addSessionTag(a, s1, getOrCreateTag(a, 'Cup').id);
    addSessionTag(a, s2, getOrCreateTag(a, 'KM').id);
    setSetting(a, SETTINGS_KEYS.birthYear, 1958);
    setSetting(a, SETTINGS_KEYS.complianceProfile, 'se');
    setSetting(a, SETTINGS_KEYS.theme, 'dark');
    setSetting(a, 'backupFolder', 'content://a');

    await expect(sync(a, server)).resolves.toMatchObject({ status: 'ok', rejected: 0 });
    await sync(b, server);

    expect(listTagsBySession(b)).toEqual(
      new Map([
        [s1, ['Cup', 'KM']],
        [s2, ['KM']],
      ]),
    );
    expect(getSetting(b, SETTINGS_KEYS.birthYear, null)).toBe(1958);
    expect(getSetting(b, SETTINGS_KEYS.complianceProfile, null)).toBe('se');
    expect(getSetting(b, SETTINGS_KEYS.theme, null)).toBeNull();
    expect(getSetting(b, 'backupFolder', null)).toBeNull();
    expect([...server.rows.keys()].filter((key) => key.startsWith('settings:')).sort()).toEqual([
      'settings:birthYear',
      'settings:complianceProfile',
    ]);
  });

  it('E11 an untag and a settings edit on the second phone come back to the first', async () => {
    const server = memoryServer();
    const a = createTestDb();
    const b = createTestDb();
    const s1 = session(a, 'One');
    addSessionTag(a, s1, getOrCreateTag(a, 'KM').id);
    setSetting(a, SETTINGS_KEYS.skillClass, 1);
    await sync(a, server);
    await sync(b, server);

    removeSessionTag(b, s1, listTags(b)[0]!.id);
    setSetting(b, SETTINGS_KEYS.skillClass, 2);
    await sync(b, server);
    await sync(a, server);

    expect(listTagsBySession(a)).toEqual(new Map());
    expect(getSetting(a, SETTINGS_KEYS.skillClass, null)).toBe(2);
  });

  it('E12 both phones create tag KM offline: neither sync fails, and each shows one KM on both sessions', async () => {
    const server = memoryServer();
    const a = createTestDb();
    const b = createTestDb();
    const s1 = session(a, 'One');
    const s2 = session(a, 'Two');
    await sync(a, server);
    await sync(b, server);

    addSessionTag(a, s1, createTag(a, 'KM').id);
    addSessionTag(b, s2, createTag(b, 'KM').id);
    await expect(sync(a, server)).resolves.toMatchObject({ status: 'ok' });
    await expect(sync(b, server)).resolves.toMatchObject({ status: 'ok' });
    await expect(sync(a, server)).resolves.toMatchObject({ status: 'ok' });

    for (const db of [a, b]) {
      expect(listTags(db).map((tag) => tag.name)).toEqual(['KM']);
      expect(listTagsBySession(db)).toEqual(
        new Map([
          [s1, ['KM']],
          [s2, ['KM']],
        ]),
      );
    }
    expect(listTags(a)[0]!.id).toBe(listTags(b)[0]!.id);
  });
});
