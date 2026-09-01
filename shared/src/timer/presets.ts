// Timer presets (docs/specs/shot-timer-spec.md §4). PAR presets are generic
// shooting-sport practice timers; the milsnabb drill is generated FROM the
// `spsf-milsnabb` program's `structure` (shared/src/disciplines) rather than
// hard-coded, so it stays in lock-step with the discipline data file.
import { getProgram, type Program } from '../disciplines';
import type { SeriesSpec, TimerConfig } from './types';

/**
 * SHB J.6.2 p. 290: "FÄRDIGA" (ready) is called 60 s after "LADDA" (load),
 * then targets appear for the series' time limit. That 60 s LADDA→FÄRDIGA
 * wait is a once-per-omgång range-command cadence, not a per-series pause —
 * modelling it before every one of the 13 series here would make a solo
 * practice drill ~13 minutes of standing-and-waiting. `MILSNABB_PRACTICE_READY_DELAY_MS`
 * is a practical default for unsupervised practice; `MILSNABB_OFFICIAL_READY_DELAY_MS`
 * is kept for a shooter who wants the authentic cadence (selectable in the
 * custom preset builder).
 */
export const MILSNABB_OFFICIAL_READY_DELAY_MS = 60_000;
export const MILSNABB_PRACTICE_READY_DELAY_MS = 5_000;
/** Practical rest between series (target re-set / breathe) — not an SHB-specified value. */
export const MILSNABB_DEFAULT_REST_MS = 5_000;

export interface ParPreset {
  id: string;
  /** i18n key suffix under `timer.presets.<id>`. */
  nameKey: string;
  config: TimerConfig;
}

function series(durations: readonly number[]): SeriesSpec[] {
  return durations.map((durationMs, index) => ({ index, durationMs }));
}

/** A single PAR time, fixed ready delay — the classic "beep, shoot until beep" drill. */
export const PAR_SINGLE: ParPreset = {
  id: 'parSingle',
  nameKey: 'parSingle',
  config: {
    readyDelayMs: 3_000,
    series: series([3_000]),
    restMs: 0,
  },
};

/** A single PAR time with a randomized ready delay, so the start signal cannot be anticipated. */
export const PAR_RANDOM_START: ParPreset = {
  id: 'parRandomStart',
  nameKey: 'parRandomStart',
  config: {
    readyDelayMs: 0,
    randomReadyDelay: { minMs: 1_000, maxMs: 4_000 },
    series: series([3_000]),
    restMs: 0,
  },
};

/** Interval/repeat mode: 5 reps of a 5 s PAR, 10 s rest, randomized start each rep. */
export const PAR_INTERVAL_DRILL: ParPreset = {
  id: 'parInterval',
  nameKey: 'parInterval',
  config: {
    readyDelayMs: 0,
    randomReadyDelay: { minMs: 1_000, maxMs: 3_000 },
    series: series([5_000, 5_000, 5_000, 5_000, 5_000]),
    restMs: 10_000,
  },
};

/**
 * Looks up the registered `spsf-milsnabb` program. Always present in
 * practice (registered + zod-validated at module load in
 * `shared/src/disciplines/index.ts`); the `lookup` param exists only so
 * this "should never happen" guard is actually exercised in tests, the
 * same defensive-but-tested pattern as `requireDiscipline`.
 */
export function requireMilsnabbProgram(lookup: (id: string) => Program | undefined = getProgram): Program {
  const program = lookup('spsf-milsnabb');
  if (!program) throw new Error('spsf-milsnabb program is not registered');
  return program;
}

/**
 * Builds a milsnabb drill `TimerConfig` from an already-resolved program
 * (J.6.1 p. 290): 1 provserie at omgång 1's time limit, then 3 omgångar ×
 * 4 serier at 10 s / 8 s / 6 s (§6.3 program structure). Exported
 * separately from `buildMilsnabbDrillConfig` so the data-integrity guards
 * can be tested with a deliberately malformed `program`, without a default
 * parameter masking `program`'s nullability.
 */
export function buildMilsnabbDrillConfigFrom(
  program: Program,
  readyDelayMs: number,
  restMs: number,
): TimerConfig {
  if (!program.structure) {
    throw new Error('spsf-milsnabb program structure is missing');
  }
  const { structure } = program;
  const firstGroupLimitS = structure.groups[0]?.timeLimitSeconds;
  if (!firstGroupLimitS) {
    throw new Error('spsf-milsnabb program structure has no time limit for its first group');
  }

  const durationsS: number[] = [];
  for (let i = 0; i < structure.sighterSeries; i += 1) durationsS.push(firstGroupLimitS);
  for (const group of structure.groups) {
    if (!group.timeLimitSeconds) throw new Error('spsf-milsnabb group is missing a time limit');
    for (let i = 0; i < group.seriesCount; i += 1) durationsS.push(group.timeLimitSeconds);
  }

  return {
    readyDelayMs,
    series: series(durationsS.map((s) => s * 1_000)),
    restMs,
  };
}

/**
 * Milsnabb drill (J.6.1 p. 290): 1 provserie at omgång 1's time limit, then
 * 3 omgångar × 4 serier at 10 s / 8 s / 6 s (§6.3 program structure,
 * `shared/src/disciplines/programs/spsf-milsnabb.json`). Ready delay and
 * rest are practice defaults — see the constants above.
 */
export function buildMilsnabbDrillConfig(
  readyDelayMs: number = MILSNABB_PRACTICE_READY_DELAY_MS,
  restMs: number = MILSNABB_DEFAULT_REST_MS,
): TimerConfig {
  return buildMilsnabbDrillConfigFrom(requireMilsnabbProgram(), readyDelayMs, restMs);
}

export const PAR_PRESETS: readonly ParPreset[] = [PAR_SINGLE, PAR_RANDOM_START, PAR_INTERVAL_DRILL];
