// Native DB connection (Android/iOS). See client.web.ts for the web
// counterpart — expo-sqlite's web (WASM/worker) build isn't usable with this
// Expo SDK's static web export yet; see docs/implementation-plan.md M1 report
// for the deviation.
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';
import type { Database } from './types';

const expoDb = openDatabaseSync('shotledger.db', { enableChangeListener: false });

export const db: Database = drizzle(expoDb, { schema });
