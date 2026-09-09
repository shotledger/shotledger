// IPSC/USPSA power factor. The figure is conventionally quoted in
// grain·fps/1000, but ammo lots record velocity in m/s (what a chronograph
// here reads), so the conversion happens on the way in.

/** Exact by definition: 1 ft = 0.3048 m. */
const FEET_PER_METRE = 1 / 0.3048;

/**
 * Power factor from bullet weight (grains) and muzzle velocity (m/s), or null
 * when either is missing or not a usable positive number.
 *
 * Truncated to a whole number: IPSC disregards the fraction, so a load
 * computing to 124.9 makes Minor, not the 125 Minor floor.
 */
export function powerFactor(
  bulletWeightGr: number | null | undefined,
  velocityMps: number | null | undefined,
): number | null {
  if (bulletWeightGr == null || velocityMps == null) return null;
  if (!Number.isFinite(bulletWeightGr) || !Number.isFinite(velocityMps)) return null;
  if (bulletWeightGr <= 0 || velocityMps <= 0) return null;
  const raw = (bulletWeightGr * velocityMps * FEET_PER_METRE) / 1000;
  // The m/s→fps factor is not exact in binary, so a power factor that is
  // arithmetically integral can land a hair under it (125 → 124.999…).
  return Math.floor(Number(raw.toFixed(6)));
}
