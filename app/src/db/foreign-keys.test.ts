import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import {
  checkForeignKeysOff,
  pinForeignKeysOffAsync,
  pinForeignKeysOffSync,
  type AsyncPragmaConnection,
  type SyncPragmaConnection,
} from './foreign-keys';

const ON_ERROR =
  'SQLite foreign keys are on; sync needs them off (docs/specs/sync-family-refusal-spec.md §11.6)';

// better-sqlite3 turns foreign keys on by default, the case the pin exists for.
function syncConn(
  sqlite = new Database(':memory:'),
): SyncPragmaConnection & { sqlite: Database.Database } {
  return {
    sqlite,
    execSync: (source) => {
      sqlite.exec(source);
    },
    getFirstSync: <T>(source: string) => (sqlite.prepare(source).get() as T | undefined) ?? null,
  };
}

function asyncConn(
  sqlite = new Database(':memory:'),
): AsyncPragmaConnection & { sqlite: Database.Database } {
  const inner = syncConn(sqlite);
  return {
    sqlite,
    execAsync: async (source) => inner.execSync(source),
    getFirstAsync: async <T>(source: string) => inner.getFirstSync<T>(source),
  };
}

const foreignKeys = (sqlite: Database.Database) => sqlite.pragma('foreign_keys', { simple: true });

describe('FK1 checkForeignKeysOff', () => {
  it('passes foreign_keys = 0', () => {
    expect(() => checkForeignKeysOff({ foreign_keys: 0 })).not.toThrow();
  });

  it('throws on foreign_keys = 1, naming §11.6', () => {
    expect(() => checkForeignKeysOff({ foreign_keys: 1 })).toThrow(new Error(ON_ERROR));
  });

  it('passes no row (a build without foreign-key support, where they cannot be on)', () => {
    expect(() => checkForeignKeysOff(null)).not.toThrow();
  });

  it.each([[undefined], [{}], [{ foreign_keys: '0' }], [{ foreign_keys: 2 }], [0], ['0']])(
    'fails closed on the unexpected row %j',
    (row) => {
      expect(() => checkForeignKeysOff(row)).toThrow(new Error(ON_ERROR));
    },
  );
});

describe('FK2 pinForeignKeysOffSync', () => {
  it('turns foreign keys off on a connection that has them on', () => {
    const conn = syncConn();
    expect(foreignKeys(conn.sqlite)).toBe(1);
    pinForeignKeysOffSync(conn);
    expect(foreignKeys(conn.sqlite)).toBe(0);
  });

  it('throws when the read-back still says on', () => {
    const conn = syncConn();
    expect(() => pinForeignKeysOffSync({ ...conn, execSync: () => undefined })).toThrow(
      new Error(ON_ERROR),
    );
  });
});

describe('FK3 pinForeignKeysOffAsync', () => {
  it('turns foreign keys off on a connection that has them on', async () => {
    const conn = asyncConn();
    expect(foreignKeys(conn.sqlite)).toBe(1);
    await pinForeignKeysOffAsync(conn);
    expect(foreignKeys(conn.sqlite)).toBe(0);
  });

  it('rejects when the read-back still says on', async () => {
    const conn = asyncConn();
    await expect(
      pinForeignKeysOffAsync({ ...conn, execAsync: async () => undefined }),
    ).rejects.toThrow(new Error(ON_ERROR));
  });
});
