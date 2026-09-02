/**
 * VERIFY: initial values per docs/adr/0003-diy-changelog-sync.md "Photo
 * policy" section — a maintainer-approved starting point, not derived from
 * measurement. Revisit if real usage data contradicts them.
 */

/** ADR: "max object size (~1.5 MB)". */
export const MAX_PHOTO_BYTES = 1_500_000;

/** ADR: "per-user storage quota (initial: 1 GB)". */
export const DEFAULT_QUOTA_BYTES = 1_073_741_824;

/** ADR: "upload rate limit (initial: 60/hour via the Workers rate-limiting binding)". */
export const RATE_LIMIT_MAX_UPLOADS = 60;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
