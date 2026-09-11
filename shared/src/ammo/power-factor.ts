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

/**
 * Exact by definition: 1 grain = 64.79891 mg.
 *
 * The same load is quoted in grains and measured in m/s, so one of the two
 * conversions has to happen somewhere; doing it from the defined constant
 * rather than a rounded 0.0648 keeps a 7.5 J airgun limit from landing on
 * the wrong side of itself.
 */
const KILOGRAMS_PER_GRAIN = 0.00006479891;

/**
 * Muzzle energy in joules from bullet weight (grains) and muzzle velocity
 * (m/s), or null when either is missing or not a usable positive number.
 *
 * E = ½mv². Unlike `powerFactor`, nothing here is truncated to satisfy a
 * rule — one decimal is kept because the useful range spans three orders of
 * magnitude: a centrefire pistol load is several hundred joules, an air
 * pistol is single digits, and rounding to whole joules would erase the
 * difference between 7.4 and 7.5 exactly where it matters most.
 *
 * This computes a figure; it does not judge one. Any legal or federation
 * energy limit is a regulatory value and is deliberately not encoded here.
 */
export function muzzleEnergyJoules(
  bulletWeightGr: number | null | undefined,
  velocityMps: number | null | undefined,
): number | null {
  if (bulletWeightGr == null || velocityMps == null) return null;
  if (!Number.isFinite(bulletWeightGr) || !Number.isFinite(velocityMps)) return null;
  if (bulletWeightGr <= 0 || velocityMps <= 0) return null;
  const joules = 0.5 * bulletWeightGr * KILOGRAMS_PER_GRAIN * velocityMps * velocityMps;
  return Number(joules.toFixed(1));
}
