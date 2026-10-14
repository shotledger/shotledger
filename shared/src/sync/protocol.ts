import { z } from 'zod';

/**
 * Sync wire protocol (ADR 0003). See
 * docs/specs/sync-protocol-spec.md §2 for the full design rationale.
 */

/** Current protocol version this server/client build speaks. */
export const PROTOCOL_VERSION = 1;

/** Oldest client protocol version this server still accepts. */
export const MIN_SUPPORTED_PROTOCOL_VERSION = 1;

/** Max rows returned per table in a single pull response. */
export const PULL_PAGE_SIZE = 200;

/** Max changes accepted in a single push request. */
export const PUSH_BATCH_MAX = 500;

/**
 * Max UTF-8 bytes of one change's `JSON.stringify(payload)` on push. The
 * fullest app row is ~2.6 KB. A pull page is PULL_PAGE_SIZE rows across all
 * tables (backend/src/db/queries.ts), so at this cap one response stays near
 * 3.1 MiB (200 x 16 KiB), well inside the Worker's 128 MB.
 */
export const MAX_PAYLOAD_BYTES = 16_384;

/**
 * The range the server accepts in a `real` column: drizzle-zod bounds a
 * SQLite real to a signed 48-bit integer's range
 * (docs/specs/sync-payload-validation-spec.md §2.1). A screen that turns
 * typed text into a real holds it to this, or the row never syncs.
 */
export const REAL_MIN = -140_737_488_355_328;
export const REAL_MAX = 140_737_488_355_327;

/**
 * Tables that follow the id/updated_at/deleted_at sync convention
 * (docs/implementation-plan.md §3). `settings` syncs only the keys in
 * SYNCED_SETTING_KEYS (docs/specs/sync-tags-settings-spec.md §2.3).
 */
export const SYNC_TABLE_NAMES = [
  'firearms',
  'licenses',
  'firearm_groups',
  'firearm_calibers',
  'ammo_lots',
  'sessions',
  'series',
  'shots',
  'falt_stations',
  'maintenance_events',
  'tags',
  'sight_settings',
  'session_tags',
  'settings',
] as const;

export const SyncTableNameSchema = z.enum(SYNC_TABLE_NAMES);

/**
 * The account settings that follow the user (ADR 0019); a settings row's id
 * is its key. Every other key is device-local and never syncs. Kept in
 * lock-step with the WHEN clause of the app's settings outbox triggers. The
 * `show*` keys are the feature switches (#801, FEATURE_SETTING_KEYS in
 * shared/src/features/visibility.ts).
 */
export const SYNCED_SETTING_KEYS = [
  'birthYear',
  'skillClass',
  'competesInWomensClasses',
  'complianceProfile',
  'complianceProfileVariant',
  'showLicenseActivity',
  'showPhotos',
  'showTimer',
  'showSightSettings',
  'showAmmoLots',
  'showMaintenance',
] as const;

const SYNCED_SETTINGS: ReadonlySet<string> = new Set(SYNCED_SETTING_KEYS);

export function isSyncedSettingKey(id: string): boolean {
  return SYNCED_SETTINGS.has(id);
}

/**
 * Whether a `settings` row may sync: an allowlisted key, carried under its own
 * id — the payload's id is what a device writes, so it is checked too. A
 * tombstone carries no payload.
 */
export function isSyncableSettingRow(rowId: string, payload: unknown): boolean {
  if (!isSyncedSettingKey(rowId)) return false;
  if (payload === null) return true;
  return typeof payload === 'object' && (payload as { id?: unknown }).id === rowId;
}
export type SyncTableName = z.infer<typeof SyncTableNameSchema>;

const cursorSchema = z.number().int().nonnegative();
const seqSchema = z.number().int().positive();
// Nonnegative, not positive: an out-of-range (too old) client must still
// parse successfully so checkProtocolVersion (not zod) is what rejects it,
// producing the 409 version-handshake response rather than a generic 400.
const protocolVersionSchema = z.number().int().nonnegative();

export const ChangeRowSchema = z
  .object({
    tableName: SyncTableNameSchema,
    rowId: z.string().min(1),
    seq: seqSchema,
    payload: z.unknown().nullable(),
    deletedAt: z.string().nullable(),
    updatedAt: z.string().min(1),
  })
  .refine((row) => (row.deletedAt === null ? true : row.payload === null), {
    message: 'payload must be null when deletedAt is set',
    path: ['payload'],
  });
export type ChangeRow = z.infer<typeof ChangeRowSchema>;

export const ClientChangeSchema = z
  .object({
    clientChangeId: z.uuid(),
    tableName: SyncTableNameSchema,
    rowId: z.string().min(1),
    payload: z.unknown().nullable(),
    deletedAt: z.string().nullable(),
    updatedAt: z.string().min(1),
  })
  .refine((row) => (row.deletedAt === null ? true : row.payload === null), {
    message: 'payload must be null when deletedAt is set',
    path: ['payload'],
  });
export type ClientChange = z.infer<typeof ClientChangeSchema>;

export const PullRequestSchema = z.object({
  protocolVersion: protocolVersionSchema,
  tables: z
    .array(
      z.object({
        tableName: SyncTableNameSchema,
        cursor: cursorSchema,
      }),
    )
    .min(1),
});
export type PullRequest = z.infer<typeof PullRequestSchema>;

export const PullResponseSchema = z.object({
  protocolVersion: protocolVersionSchema,
  changes: z.array(ChangeRowSchema),
  nextCursors: z.array(
    z.object({
      tableName: SyncTableNameSchema,
      cursor: cursorSchema,
      hasMore: z.boolean(),
    }),
  ),
});
export type PullResponse = z.infer<typeof PullResponseSchema>;

export const PushRequestSchema = z.object({
  protocolVersion: protocolVersionSchema,
  changes: z.array(ClientChangeSchema).min(1).max(PUSH_BATCH_MAX),
});
export type PushRequest = z.infer<typeof PushRequestSchema>;

export const PushAckStatusSchema = z.enum(['applied', 'rejected', 'duplicate']);
export type PushAckStatus = z.infer<typeof PushAckStatusSchema>;

export const PushAckSchema = z.object({
  clientChangeId: z.uuid(),
  status: PushAckStatusSchema,
  seq: seqSchema.optional(),
  reason: z.string().optional(),
});
export type PushAck = z.infer<typeof PushAckSchema>;

export const PushResponseSchema = z.object({
  protocolVersion: protocolVersionSchema,
  acks: z.array(PushAckSchema),
});
export type PushResponse = z.infer<typeof PushResponseSchema>;

export const PROTOCOL_VERSION_UNSUPPORTED = 'PROTOCOL_VERSION_UNSUPPORTED';

export interface VersionError {
  code: typeof PROTOCOL_VERSION_UNSUPPORTED;
  minSupportedVersion: number;
  serverVersion: number;
}

export type VersionCheckResult = { ok: true } | { ok: false; error: VersionError };

/**
 * Version handshake: a client older than MIN_SUPPORTED_PROTOCOL_VERSION
 * must upgrade before syncing (ADR 0003 guardrail).
 */
export function checkProtocolVersion(clientVersion: number): VersionCheckResult {
  if (clientVersion < MIN_SUPPORTED_PROTOCOL_VERSION) {
    return {
      ok: false,
      error: {
        code: PROTOCOL_VERSION_UNSUPPORTED,
        minSupportedVersion: MIN_SUPPORTED_PROTOCOL_VERSION,
        serverVersion: PROTOCOL_VERSION,
      },
    };
  }
  return { ok: true };
}
