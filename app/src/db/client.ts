// Native DB connection (Android/iOS). See client.web.ts for the web
// counterpart — expo-sqlite's web (WASM/worker) build isn't usable with this
// Expo SDK's static web export yet; see docs/implementation-plan.md M1 report
// for the deviation.
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';
import type { Database } from './types';

// Exported so app/src/db/backup can VACUUM INTO a copy, and restore can
// close this connection before overwriting the file on disk.
export const DATABASE_FILENAME = 'shotledger.db';

const expoDb = openDatabaseSync(DATABASE_FILENAME, { enableChangeListener: false });

export const db: Database = drizzle(expoDb, { schema });

/** The underlying expo-sqlite connection (raw SQL / VACUUM INTO / close),
 * for app/src/db/backup — everything else should use `db`. */
export const rawDb = expoDb;
