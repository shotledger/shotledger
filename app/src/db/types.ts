import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type * as schema from './schema';

/**
 * Driver-agnostic DB handle. Both drizzle-orm/expo-sqlite (app runtime) and
 * drizzle-orm/better-sqlite3 (used only in tests, see db/test-db.ts) are
 * 'sync'-kind SQLite drivers with identical query surfaces, so query
 * functions can be written once and run against either.
 */
export type Database = BaseSQLiteDatabase<'sync', unknown, typeof schema>;
