/**
 * VERIFY: initial values per ARCHITECTURE.md § Sync, "Photo
 * policy" — a maintainer-approved starting point, not derived from
 * measurement. Revisit if real usage data contradicts them.
 */

/** Photo policy: a maximum object size (~1.5 MB). */
export const MAX_PHOTO_BYTES = 1_500_000;

/** Photo policy: a per-user quota (initially 1 GB). */
export const DEFAULT_QUOTA_BYTES = 1_073_741_824;

/** Photo policy: an upload rate limit (initially 60/hour, a D1 fixed-window counter). */
export const RATE_LIMIT_MAX_UPLOADS = 60;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
