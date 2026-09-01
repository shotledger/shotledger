// Drizzle schema — implements docs/implementation-plan.md §3 exactly.
// Common columns on every table: id (UUIDv7 TEXT PK), created_at, updated_at
// (both UTC ISO-8601 TEXT), deleted_at (TEXT NULL, soft-delete tombstone).
// Every read query MUST filter `deleted_at IS NULL`; writes always bump
// `updated_at`; deletes set `deleted_at` instead of removing rows.
import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const common = {
  id: text('id').primaryKey(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
};

export const firearms = sqliteTable('firearms', {
  ...common,
  make: text('make').notNull(),
  model: text('model').notNull(),
  caliber: text('caliber'),
  // vapentyp
  weaponType: text('weapon_type', {
    enum: ['pistol', 'revolver', 'rifle', 'airgun'],
  }),
  serialNumber: text('serial_number'), // optional, sensitive
  vapenId: text('vapen_id'), // national register id ("SE…" on license card back)
  loadSystem: text('load_system'), // laddsystem, e.g. halvautomat
  notes: text('notes'),
  roundCount: integer('round_count').notNull().default(0),
  maintenanceIntervalRounds: integer('maintenance_interval_rounds'),
  roundsSinceMaintenance: integer('rounds_since_maintenance').notNull().default(0),
});

export const licenses = sqliteTable('licenses', {
  ...common,
  // one row per ISSUED license; a renewal appends a new row, history kept
  firearmId: text('firearm_id')
    .notNull()
    .references(() => firearms.id),
  licenseNumber: text('license_number'), // e.g. 'A123.456/2024-01'
  purpose: text('purpose'), // ändamål, e.g. 'Målskjutning'
  decidedOn: text('decided_on'), // datum för beslut
  validUntil: text('valid_until'), // giltighetstid t.o.m.; NULL = tills vidare
  conditions: text('conditions'), // villkor (often empty)
  authority: text('authority'), // e.g. 'Polismyndigheten'
  // expiry reminders (M4) key off the latest row per firearm
});

export const firearmGroups = sqliteTable('firearm_groups', {
  ...common,
  firearmId: text('firearm_id')
    .notNull()
    .references(() => firearms.id),
  // federation-scoped id, e.g. 'spsf:C' (§6.4a)
  groupId: text('group_id').notNull(),
  isDefaultForGroup: integer('is_default_for_group').notNull().default(0),
});

export const ammoLots = sqliteTable('ammo_lots', {
  ...common,
  label: text('label').notNull(), // display name
  caliber: text('caliber'),
  quantity: integer('quantity'),
  purchasedOn: text('purchased_on'),
  isHandload: integer('is_handload').notNull().default(0),
  // factory ammo:
  brand: text('brand'),
  product: text('product'),
  lotNumber: text('lot_number'),
  // projectile (factory and handload):
  bulletMake: text('bullet_make'),
  bulletModel: text('bullet_model'),
  bulletWeightGr: real('bullet_weight_gr'),
  // handload recipe:
  powder: text('powder'), // e.g. 'Vihtavuori N320'
  powderChargeGr: real('powder_charge_gr'), // grains
  primer: text('primer'),
  brass: text('brass'),
  colMm: real('col_mm'), // cartridge overall length
  crimpMm: real('crimp_mm'),
  notes: text('notes'),
});

export const sessions = sqliteTable('sessions', {
  ...common,
  name: text('name').notNull(), // default: program/discipline + date
  type: text('type', { enum: ['training', 'competition'] }).notNull(),
  disciplineId: text('discipline_id').notNull(), // key into discipline defs (§6.2)
  programId: text('program_id'), // predefined match format (§6.3); NULL = free-form training
  // only when type='competition'; SHB 2026 C.3.1 (p. 52) levels
  competitionLevel: text('competition_level', {
    enum: ['forening', 'krets', 'landsdel', 'national', 'riks'],
  }),
  // mästerskap is a flag ON a level (SHB C.3.1), not a level: KM=forening+1, SM=riks+1
  isChampionship: integer('is_championship').notNull().default(0),
  competitionName: text('competition_name'), // e.g. "Skånemästerskapet"
  // the GUN: federation-scoped group id, e.g. 'spsf:C' (§6.4a); valid set
  // depends on the discipline's federation
  weaponGroup: text('weapon_group'),
  // the SHOOTER (klass, §6.4a): 1|1u|1b|1s|2|3|Jun|Dam1|Dam2|Dam3|VetY|VetÄ
  shooterClass: text('shooter_class'),
  firearmId: text('firearm_id').references(() => firearms.id),
  ammoLotId: text('ammo_lot_id').references(() => ammoLots.id),
  startedAt: text('started_at').notNull(),
  location: text('location'),
  notes: text('notes'),
  decimalScoring: integer('decimal_scoring').notNull().default(0),
  // Rounds fired in this session that were never scored (fouling shots,
  // function checks, plinking). Counted toward the firearm round counter,
  // ammo-lot usage and volume metrics; excluded from every score statistic
  // and from the series/shots structures (spec Amendment A1 §A1.3).
  // NULL and 0 both mean "none"; nullable so "never entered" stays visible.
  extraRounds: integer('extra_rounds'),
});

export const series = sqliteTable('series', {
  ...common,
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id),
  position: integer('position').notNull(), // 1-based
  // provskott: excluded from score/stats, included in volume counts (§6.3);
  // max ONE per section (main / final), UI/query-enforced
  isSighter: integer('is_sighter').notNull().default(0),
  // series belongs to the final; a final may have its own sighters (both
  // flags set)
  isFinal: integer('is_final').notNull().default(0),
  photoUri: text('photo_uri'), // local file URI
});

export const shots = sqliteTable('shots', {
  ...common,
  seriesId: text('series_id')
    .notNull()
    .references(() => series.id),
  position: integer('position').notNull(),
  // 0–109. ONE storage for both modes: integer scoring stores value×10
  // (9 → 90), decimal stores tenths (10.3 → 103). Integer sums — no float
  // drift.
  valueTenths: integer('value_tenths').notNull(),
  // Centrumtia — set by the (X) key. A plain X is an ordinary ten and leaves
  // this 0 (spec Amendment A1 §A1.1, maintainer ruling 2026-09-01).
  isInnerTen: integer('is_inner_ten').notNull().default(0),
  // DEPRECATED (2026-09-01, Amendment A1 §A1.1.4): the old "(X) in decimal
  // mode" flag. Nothing writes it any more and every row has 0. Kept rather
  // than dropped because a destructive column-drop migration on an existing
  // local-first database is riskier than an unused column.
  isInnerTenDecimal: integer('is_inner_ten_decimal').notNull().default(0),
});

export const maintenanceEvents = sqliteTable('maintenance_events', {
  ...common,
  firearmId: text('firearm_id')
    .notNull()
    .references(() => firearms.id),
  performedAt: text('performed_at').notNull(),
  kind: text('kind').notNull(), // free text v1
  roundCountAt: integer('round_count_at'),
  notes: text('notes'),
});

export const tags = sqliteTable('tags', {
  ...common,
  name: text('name').notNull().unique(),
});

// Pure join table, per §3 exactly: no common columns, composite PK.
export const sessionTags = sqliteTable(
  'session_tags',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.tagId] })],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON values
});
