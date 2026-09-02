// Web fallback. expo-sqlite's web build (WASM + a worker chunk) fails to
// bundle under this Expo SDK's static web export — Metro's serializer
// throws "Worker chunk not found for: .../expo-sqlite/web/worker.ts" as
// soon as anything imports 'expo-sqlite' into a route that's part of the
// server-rendered bundle. Rather than fight the bundler, M1 ships
// native-first: `db` is null on web, and callers (migration-gate.web.tsx,
// the /dev screen) fall back to a "not available in this preview" state.
// Flagged as a deviation in the M1 report — revisit when either the SDK
// fixes the worker-chunk export path or a non-static web output is chosen.
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Database } from './types';

export const DATABASE_FILENAME = 'shotledger.db';

export const db: Database | null = null;

/** See client.ts — no expo-sqlite connection on web. */
export const rawDb: SQLiteDatabase | null = null;
