// Which target faces photo scoring can handle, and how.
//
// Phase 1 shipped auto-geometry for the precision face only (spec §0, CV
// spike §6.2). The milsnabb face (§0 "milsnabb-photo-corners" amendment)
// never takes the disc lock, whose validity gate was calibrated on precision
// faces only (spec §10.1). It has its own ring-line lock (milsnabb-lock.ts,
// docs/specs/cv-milsnabb-closeup-lock-2026-10.md), and falls back to the four
// corners when that refuses. Any other face is not supported.
//
// The ISSF faces join on the same rule, by what the auto pipeline was actually
// validated against rather than by federation:
// - `issf-25m-precision` is dimensionally the same sheet as the SPSF precision
//   face — a 200 mm solid black disc — so it takes the auto path.
// - `issf-25m-rapid-fire` is the same sheet as milsnabb, so it inherits
//   milsnabb's manual-only verdict for the same measured reason.
// - `issf-10m-air-pistol` is manual-only because nothing has measured it: its
//   black is 59.5 mm against the validated 200 mm, and a scale that far outside
//   the tested range is exactly where a confident wrong lock comes from.
const AUTO_FACE_IDS: ReadonlySet<string> = new Set([
  'spsf-pistol-25m-precision',
  'issf-25m-precision',
]);
const MANUAL_ONLY_FACE_IDS: ReadonlySet<string> = new Set([
  'spsf-snabbskjutning-25m',
  'issf-25m-rapid-fire',
  'issf-10m-air-pistol',
]);

/** Photo scoring can score this face at all, automatically or by corners. */
export function isPhotoScoringSupported(faceId: string): boolean {
  return AUTO_FACE_IDS.has(faceId) || MANUAL_ONLY_FACE_IDS.has(faceId);
}

/**
 * The face the hole detector and tap-snap were measured on (a 200 mm solid
 * black disc), so their help is offered on it — whether the photo locked by
 * itself or its corners were placed by hand.
 */
export function isAutoFace(faceId: string): boolean {
  return AUTO_FACE_IDS.has(faceId);
}

/** The face never takes the disc lock: its own ring lock or four corners. */
export function isManualOnlyFace(faceId: string): boolean {
  return MANUAL_ONLY_FACE_IDS.has(faceId);
}

// The milsnabb sheet; ISSF's rapid fire face is the same sheet (targets.ts).
const MILSNABB_LOCK_FACE_IDS: ReadonlySet<string> = new Set([
  'spsf-snabbskjutning-25m',
  'issf-25m-rapid-fire',
]);

/** The milsnabb lock is tried before the corners. */
export function isMilsnabbLockFace(faceId: string): boolean {
  return MILSNABB_LOCK_FACE_IDS.has(faceId);
}
