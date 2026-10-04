import type { SyncTableName } from './protocol';

/**
 * Max length of each user-typed text column in a synced row, in UTF-16 code
 * units (what a TextInput's `maxLength` counts), keyed by table and column
 * name. app/src/db/queries/text-limits.test.ts proves the fullest row of every
 * table stays under MAX_PAYLOAD_BYTES with these, so raise one only there.
 */
const NAME = 120;
const PLACE = 200;
const IDENTIFIER = 64;
const DATE = 32;
const NOTE = 2_000;
const SHORT_NOTE = 500;

export const TEXT_LIMITS = {
  firearms: {
    make: NAME,
    model: NAME,
    serial_number: IDENTIFIER,
    vapen_id: IDENTIFIER,
    notes: NOTE,
  },
  licenses: {
    license_number: IDENTIFIER,
    purpose: NAME,
    decided_on: DATE,
    valid_until: DATE,
    conditions: SHORT_NOTE,
    authority: NAME,
  },
  ammo_lots: {
    label: NAME,
    purchased_on: DATE,
    brand: NAME,
    product: NAME,
    lot_number: IDENTIFIER,
    bullet_make: NAME,
    bullet_model: NAME,
    powder: NAME,
    primer: NAME,
    brass: NAME,
    notes: NOTE,
  },
  sessions: {
    name: NAME,
    competition_name: NAME,
    location: PLACE,
    notes: NOTE,
  },
  // Written by imports only today (e.g. "särskjutning"); bounded so a future
  // input inherits a limit the size test already covers.
  series: { note: SHORT_NOTE },
  falt_stations: { note: SHORT_NOTE },
  maintenance_events: {
    kind: NAME,
    notes: NOTE,
  },
  sight_settings: {
    label: NAME,
    notes: NOTE,
  },
  tags: { name: NAME },
} as const satisfies Partial<Record<SyncTableName, Record<string, number>>>;
