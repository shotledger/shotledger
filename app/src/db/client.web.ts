// Web DB connection: expo-sqlite's WASM build in a worker, persisted in the
// browser's origin-private file system (OPFS). Needs `web.output` other
// than `static` plus the COOP/COEP headers set in metro.config.js —
// ARCHITECTURE.md § Web preview.
//
// Unlike client.ts this cannot open synchronously at import time: a cold
// worker takes longer to fetch its chunk and compile the WASM than the sync
// channel's spin-wait allows ("Sync operation timeout"). So the connection
// is opened with the async API by migration-gate.web.tsx before anything
// renders, and `db` reaches it through a thin client that drizzle's
// expo-sqlite session only ever calls `prepareSync` on.
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import * as schema from './schema';
import type { Database } from './types';

export const DATABASE_FILENAME = 'shotledger.db';

let connection: SQLiteDatabase | null = null;

/** Opens (once) the OPFS-backed connection; awaited by the web MigrationGate. */
export async function openWebDatabase(): Promise<void> {
  // The sync channel spins on SharedArrayBuffer, which browsers expose only
  // to cross-origin isolated pages (COOP/COEP headers on the document).
  if (typeof SharedArrayBuffer === 'undefined') {
    throw new Error(
      'Page is not cross-origin isolated (COOP/COEP headers missing) — ARCHITECTURE.md § Web preview',
    );
  }
  connection ??= await openDatabaseAsync(DATABASE_FILENAME, { enableChangeListener: false });
}

function connected(): SQLiteDatabase {
  if (!connection) throw new Error('Web database used before openWebDatabase() resolved');
  return connection;
}

const lazyClient = {
  prepareSync: (source: string) => connected().prepareSync(source),
} as SQLiteDatabase;

export const db: Database = drizzle(lazyClient, { schema });

/** See client.ts. Null until openWebDatabase() has resolved. */
export const rawDb: SQLiteDatabase | null = null;
