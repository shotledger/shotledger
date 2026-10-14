// A stand-in for `@/db/client` backed by the in-memory better-sqlite3 DB, so
// a component test runs the real query functions against the real schema.
//
//   jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);
//
// and call `resetTestDb()` in `beforeEach` for a fresh, empty database.
import type { Database } from '@/db/types';
import { createTestDb } from '@/db/test-db';

let current: Database = createTestDb() as unknown as Database;

/** The module shape of `@/db/client`, reading whichever DB is current. */
export const testDbClient = {
  get db(): Database {
    return current;
  },
  get rawDb(): null {
    return null;
  },
};

/** Replaces the DB with a fresh one and returns it, for seeding. */
export function resetTestDb(): Database {
  current = createTestDb() as unknown as Database;
  return current;
}

/** The DB the mocked `@/db/client` currently serves. */
export function testDb(): Database {
  return current;
}
