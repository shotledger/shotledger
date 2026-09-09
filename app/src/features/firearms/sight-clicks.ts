// The one place the sight-click range lives. `sight_settings.elevation_clicks`
// and `windage_clicks` are signed nullable integers, and clicks are relative
// to the shooter's own zero — so the range only has to cover a rear sight's
// full travel from that zero in either direction, which on match irons is a
// few tens of clicks. ±200 leaves a wide margin over any real sight while
// still stopping a stuck button at a value nobody could have meant.
import { clampStepperValue } from '@/components/stepper-value';

export const SIGHT_CLICK_LIMIT = 200;
export const SIGHT_CLICK_MIN = -SIGHT_CLICK_LIMIT;
export const SIGHT_CLICK_MAX = SIGHT_CLICK_LIMIT;

/**
 * The value a stepper holds -> what the column takes: `null` and anything
 * non-finite become NULL ("not recorded"), anything else an integer inside the
 * range. The stepper cannot produce a bad value, but this is the boundary to
 * the DB and a value loaded from an older row (or a synced peer) has not been
 * through it.
 */
export function sightClicksForSave(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return clampStepperValue(value, SIGHT_CLICK_MIN, SIGHT_CLICK_MAX);
}
