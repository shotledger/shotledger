// Protocol table name -> Drizzle table, for the phone's sync store and the
// server's payload schemas alike (docs/specs/sync-payload-validation-spec.md
// §2.1). Keys are exactly SYNC_TABLE_NAMES; the Record type makes a table
// added to the protocol without a Drizzle table a compile error.
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';

import type { SyncTableName } from './protocol';
import {
  ammoLots,
  faltStations,
  firearmCalibers,
  firearmGroups,
  firearms,
  licenses,
  maintenanceEvents,
  series,
  sessionTags,
  sessions,
  settings,
  shots,
  sightSettings,
  tags,
} from './schema';

export const SYNC_TABLES: Record<SyncTableName, SQLiteTable> = {
  firearms,
  licenses,
  firearm_groups: firearmGroups,
  firearm_calibers: firearmCalibers,
  ammo_lots: ammoLots,
  sessions,
  series,
  shots,
  falt_stations: faltStations,
  maintenance_events: maintenanceEvents,
  tags,
  sight_settings: sightSettings,
  session_tags: sessionTags,
  settings,
};
