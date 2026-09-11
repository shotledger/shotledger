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

/**
 * The slider trial (#138): a slider over the full ±200 range would give about
 * two pixels per click, so instead it shows a window that starts at ±10 and
 * grows by 10 whenever the value reaches within one click of an end —
 * maintainer's suggestion, 2026-09-11.
 *
 * The window only ever grows while one setting is being edited. Deriving it
 * from the value alone would shrink it again on the way back, and the thumb
 * would jump outward the moment you crossed the boundary in the other
 * direction — an oscillation right where the control most needs to feel
 * steady. Callers hold the current window and feed it back in.
 */
export const SIGHT_SLIDER_WINDOW_STEP = 10;

export function expandedSightWindow(currentWindow: number, value: number | null): number {
  const floor = Math.max(SIGHT_SLIDER_WINDOW_STEP, currentWindow);
  if (value === null || !Number.isFinite(value)) return Math.min(floor, SIGHT_CLICK_LIMIT);

  // One click of headroom: 9 inside a ±10 window opens the next step, 8 does
  // not. The +2 is that headroom plus the step's own exclusive upper edge.
  const needed =
    Math.ceil((Math.abs(Math.round(value)) + 2) / SIGHT_SLIDER_WINDOW_STEP) *
    SIGHT_SLIDER_WINDOW_STEP;
  return Math.min(Math.max(floor, needed), SIGHT_CLICK_LIMIT);
}
