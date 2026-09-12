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
  // Opaque pointer into the on-device vault index (app/src/features/vault) —
  // never a FK, since the vault is deliberately outside app/src/db and never
  // synced (docs/specs/document-vault-spec.md). Syncing this id is harmless:
  // it is meaningless without the local vault that produced it, and a device
  // without that vault document simply shows no "Show licence card" action.
  vaultDocumentId: text('vault_document_id'),
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
  // chronographed muzzle velocity, m/s — what a chronograph here reads; power
  // factor converts to fps for the conventional grain·fps/1000 figure.
  velocityMps: real('velocity_mps'),
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
  // What the session records, chosen at creation and orthogonal to `type`
  // (maintainer ruling 2026-09-03): 'series' logs scored series, 'rounds' logs
  // a fixed number of fired shots in `extra_rounds` and never gets series.
  // The two are mutually exclusive by construction, which is what makes the
  // sessions list sortable/filterable on shape without deriving it per row.
  kind: text('kind', { enum: ['series', 'rounds'] })
    .notNull()
    .default('series'),
  // How a new series is entered: ask each time, or go straight to manual
  // entry / photo scoring. Per session so a shooter who is scanning targets
  // all evening is not asked twelve times (#138).
  seriesEntryMode: text('series_entry_mode', { enum: ['ask', 'manual', 'photo'] })
    .notNull()
    .default('ask'),
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
  // the SHOOTER (klass, §6.4a): 1|2|3|Jun|Dam1|Dam2|Dam3|VetY|VetÄ. Free text,
  // not an enum — an import may carry a code the picker does not offer (the
  // F.2.5 klass-1 variants 1u/1b/1s were dropped from the picker 2026-09-09).
  shooterClass: text('shooter_class'),
  /**
   * ISSF event id, `<disciplineId>:<gender>:<age>` (entries.ts).
   *
   * The klass/event split: SPSF puts the category on the SHOOTER's klass,
   * ISSF on the EVENT itself, so a session carries whichever its federation
   * uses and NULL for the other. Free text for the same reason as
   * `shooter_class` — an import may name an event this build has not defined.
   */
  eventId: text('event_id'),
  firearmId: text('firearm_id').references(() => firearms.id),
  ammoLotId: text('ammo_lot_id').references(() => ammoLots.id),
  startedAt: text('started_at').notNull(),
  location: text('location'),
  notes: text('notes'),
  /**
   * Ten and inner-ten counts recorded for the SESSION rather than derived
   * from shot flags.
   *
   * Null wherever real `shots` rows exist — those are counted from the flags,
   * and a stored copy would be a second truth that drifts. Set only where
   * there is nothing to count: a ShotLog import writes a total-override
   * series with no shots, so its "Number of X"/"(X)" values had nowhere to
   * live and were parked in the note as prose (#138).
   */
  tenCount: integer('ten_count'),
  innerTenCount: integer('inner_ten_count'),
  decimalScoring: integer('decimal_scoring').notNull().default(0),
  // Rounds fired in this session that were never scored (fouling shots,
  // function checks, plinking). Counted toward the firearm round counter,
  // ammo-lot usage and volume metrics; excluded from every score statistic
  // and from the series/shots structures (spec Amendment A1 §A1.3).
  // NULL and 0 both mean "none"; nullable so "never entered" stays visible.
  extraRounds: integer('extra_rounds'),
  // Webshooter import (docs/specs/webshooter-integration-spec.md §1/§A).
  // externalSource is 'webshooter' when imported; NULL = locally created.
  externalSource: text('external_source'),
  // 'webshooter:<competition_id>:<signup_id>' — exact-match key (§A.2).
  // Application-enforced uniqueness among non-null values (no partial
  // unique index in this Drizzle/sqlite setup; see queries/webshooter.ts).
  externalRef: text('external_ref'),
  externalSyncedAt: text('external_synced_at'), // last successful re-import merge
  webshooterCompetitionId: text('webshooter_competition_id'), // for re-fetch on refresh
  officialPlacement: integer('official_placement'), // authoritative, from Webshooter
  // authoritative, from Webshooter; the app's own computed standardmedalj
  // indicator (§6.5b) stays a separate, always-computed value — never merged
  officialStandardmedalj: text('official_standardmedalj', {
    enum: ['none', 'brons', 'silver', 'guld'],
  }),
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
  // Webshooter granularity mismatch (spec §1/§A.4): true when this series
  // carries a series/station TOTAL with no per-shot detail. Such series
  // have NO child `shots` rows — every read path summing shots must branch
  // on this flag (see queries/webshooter.ts and shared/scoring extensions).
  isTotalOverride: integer('is_total_override').notNull().default(0),
  totalOverrideTenths: integer('total_override_tenths'), // populated only when isTotalOverride=1
  // shot count backing the override total; required so round counters and
  // per-series averages stay correct without shot rows
  totalOverrideShotCount: integer('total_override_shot_count'),
  note: text('note'), // e.g. 'särskjutning' (§A.6)
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

// Photo scoring phase 1 (docs/specs/photo-scoring-phase1-spec.md §4): where
// the user tapped, in target millimetres. The score derived from a mark
// already lives in shots.value_tenths — this table stores the geometry, so
// re-scoring never needs the photo again.
export const shotMarks = sqliteTable('shot_marks', {
  ...common,
  shotId: text('shot_id')
    .notNull()
    .references(() => shots.id),
  // Origin at the target centre; y increases DOWNWARD, matching
  // imageToTargetMm/scoreHole in shared/src/target-scoring.
  xMm: real('x_mm').notNull(),
  yMm: real('y_mm').notNull(),
  // Denormalised on purpose: the firearm's caliber can be edited later, and
  // that must not silently re-score a shot recorded months ago.
  caliberMm: real('caliber_mm').notNull(),
});

/**
 * Groundwork for a learned hole detector (#138, "Phase 2").
 *
 * Every tap-to-mark in Score from Photo is already a labelled example, and
 * the geometry is solved by then, so the label is in canonical target-mm
 * rather than in some photo's pixels. This table keeps those labels — and
 * ONLY with the shooter's explicit opt-in, which is off by default.
 *
 * Three deliberate properties:
 * - **Local only.** Not in `SYNC_TABLE_NAMES` (shared/src/sync/protocol.ts),
 *   which is an allow-list, so these rows never leave the device. Target
 *   photos are personal data (hard rule 7) and there is nowhere off-device
 *   they are allowed to go.
 * - **No photo bytes.** `photoUri` points at the file the series already
 *   references; this table copies nothing and owns nothing, so deleting the
 *   session's photo cannot leave an orphaned copy here.
 * - **Deletable on its own.** The shooter can clear every row without
 *   touching their logbook, which is what makes the consent revocable in
 *   practice rather than only in principle.
 */
export const trainingSamples = sqliteTable('training_samples', {
  ...common,
  seriesId: text('series_id')
    .notNull()
    .references(() => series.id),
  /** Which face the marks are in the coordinate system of. */
  targetFaceId: text('target_face_id').notNull(),
  /** 'auto' or 'manual' — a manually cornered photo is a weaker label. */
  geometrySource: text('geometry_source').notNull(),
  photoUri: text('photo_uri'),
  /** JSON array of {xMm, yMm, caliberMm, moved, calledRingLabel}. */
  marksJson: text('marks_json').notNull(),
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

// Free-text label per firearm (issue #114) — the same aiming method recurs
// across disciplines with different settings, so no discipline FK. Clicks are
// signed and relative to whatever reference zero the shooter chose for that
// firearm: only the DIFFERENCE between two rows is meaningful. Positive
// elevation = up (raises point of impact); positive windage = right; NULL =
// not recorded. `is_active` marks the setting the firearm is currently
// dialled to ("aktuell inställning"); at most one per firearm, enforced in
// the query layer.
export const sightSettings = sqliteTable('sight_settings', {
  ...common,
  firearmId: text('firearm_id')
    .notNull()
    .references(() => firearms.id),
  label: text('label').notNull(),
  elevationClicks: integer('elevation_clicks'),
  windageClicks: integer('windage_clicks'),
  isActive: integer('is_active').notNull().default(0),
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

// ---------------------------------------------------------------------------
// Client-only sync bookkeeping (docs/specs/sync-app-spec.md §2). These four
// tables never leave the device and are absent from SYNC_TABLE_NAMES.
// ---------------------------------------------------------------------------

// Written by AFTER INSERT/UPDATE triggers on the nine synced tables, so the
// enqueue happens inside the caller's transaction (ADR 0003 guardrail) with
// no query module having to remember it. Triggers live in migration 0004.
export const syncOutbox = sqliteTable(
  'sync_outbox',
  {
    tableName: text('table_name').notNull(),
    rowId: text('row_id').notNull(),
    // Monotonic local revision; the ack delete matches on it so a write
    // landing mid-push keeps the entry queued.
    rev: integer('rev').notNull(),
    clientChangeId: text('client_change_id'),
  },
  (t) => [primaryKey({ columns: [t.tableName, t.rowId] })],
);

export const syncState = sqliteTable('sync_state', {
  tableName: text('table_name').primaryKey(),
  cursor: integer('cursor').notNull().default(0),
});

// Singleton row (id = 0). `applying` suppresses the outbox triggers while
// pulled rows are written, which is what stops two devices ping-ponging the
// same row forever.
export const syncControl = sqliteTable('sync_control', {
  id: integer('id').primaryKey(),
  applying: integer('applying').notNull().default(0),
  lastRev: integer('last_rev').notNull().default(0),
});

export const photoQueue = sqliteTable('photo_queue', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['upload', 'download'] }).notNull(),
  photoId: text('photo_id').notNull(),
  localUri: text('local_uri'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: text('created_at').notNull(),
});
