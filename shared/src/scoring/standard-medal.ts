// Standardmedalj point thresholds — §6.5b, SHB 2026 C.5.1.2.3 (precision,
// verified table), C.5.1.2.5 (militär snabbmatch, verified fixed table) and
// C.5.1.2.4 (magnumprecision, verified fixed table).
// Executable spec: docs/specs/m5-stats-spec.md §"Behaviors — standardMedal.ts".
// Standardmedalj i guld is 50 accumulated medal points across sessions
// (v2+, not computed here) — this module only evaluates one session's
// brons/silver band.

export type StandardMedalGrade = 'brons' | 'silver';
export type StandardMedalPrecisionGroup = 'A' | 'B' | 'C';
export type StandardMedalMilsnabbGroup = 'A' | 'B' | 'C' | 'R';
/** The three rows C.5.1.2.4 prints, named after the groups they cover. */
export type StandardMedalMagnumRow = 'M1-M4,M8' | 'M5' | 'M6-M7,M9';

interface Thresholds {
  silver: number;
  brons: number;
}

// Precision table (C.5.1.2.3 p. 71). A-opt shares A's row, same as marke.ts.
const PRECISION_THRESHOLDS: Record<number, Record<StandardMedalPrecisionGroup, Thresholds>> = {
  6: {
    A: { silver: 277, brons: 267 },
    B: { silver: 282, brons: 273 },
    C: { silver: 283, brons: 276 },
  },
  7: {
    A: { silver: 323, brons: 312 },
    B: { silver: 329, brons: 319 },
    C: { silver: 330, brons: 322 },
  },
  10: {
    A: { silver: 461, brons: 445 },
    B: { silver: 470, brons: 455 },
    C: { silver: 471, brons: 460 },
  },
};

const PRECISION_TABULATED_SERIES_COUNTS = [6, 7, 10] as const;

// Militär snabbmatch: fixed 12-series program only (C.5.1.2.5 p. 71).
const MILSNABB_SERIES_COUNT = 12;
const MILSNABB_THRESHOLDS: Record<StandardMedalMilsnabbGroup, Thresholds> = {
  A: { silver: 540, brons: 516 },
  R: { silver: 552, brons: 528 },
  B: { silver: 561, brons: 537 },
  C: { silver: 564, brons: 540 },
};

const PRECISION_WEAPON_GROUP_TO_STD_GROUP: Record<string, StandardMedalPrecisionGroup> = {
  'spsf:A': 'A',
  'spsf:AM': 'A',
  'spsf:AP': 'A',
  'spsf:AG': 'A',
  'spsf:A-opt': 'A',
  'spsf:B': 'B',
  'spsf:C': 'C',
};

// Magnumprecision (C.5.1.2.4 p. 71). The table prints one silver/brons pair
// per vapengrupp with no series-count column and states no scaling rule, so
// it is read as the six-series omfattning C.5.1 p. 69 fixes — "Magnumprecision
// 6 serier om vardera 5 skott" — and nothing is extrapolated beyond it: SHB
// sets no limit for longer matches (confirmed 2026-10-03).
const MAGNUM_SERIES_COUNT = 6;
const MAGNUM_THRESHOLDS: Record<StandardMedalMagnumRow, Thresholds> = {
  'M1-M4,M8': { silver: 282, brons: 274 },
  M5: { silver: 294, brons: 288 },
  'M6-M7,M9': { silver: 270, brons: 253 },
};

const MAGNUM_WEAPON_GROUP_TO_STD_GROUP: Record<string, StandardMedalMagnumRow> = {
  'spsf:M1': 'M1-M4,M8',
  'spsf:M2': 'M1-M4,M8',
  'spsf:M3': 'M1-M4,M8',
  'spsf:M4': 'M1-M4,M8',
  'spsf:M8': 'M1-M4,M8',
  'spsf:M5': 'M5',
  'spsf:M6': 'M6-M7,M9',
  'spsf:M7': 'M6-M7,M9',
  'spsf:M9': 'M6-M7,M9',
};

const MILSNABB_WEAPON_GROUP_TO_STD_GROUP: Record<string, StandardMedalMilsnabbGroup> = {
  'spsf:A': 'A',
  'spsf:B': 'B',
  'spsf:C': 'C',
  'spsf:R': 'R',
};

export interface StandardMedalPointsInput {
  disciplineId: string;
  weaponGroup?: string | null;
  /** Count of scored (non-sighter) series in the evaluated section. */
  seriesCount: number;
  /** Points (not tenths) for the evaluated section. */
  totalPoints: number;
}

export interface StandardMedalResult {
  /** Highest band met, or null when the score is below brons (or undefined). */
  grade: StandardMedalGrade | null;
  silverThreshold: number | null;
  bronsThreshold: number | null;
}

const NO_RESULT: StandardMedalResult = {
  grade: null,
  silverThreshold: null,
  bronsThreshold: null,
};

/**
 * >10-series precision scaling (SHB C.5.1.2.3): the 10-series value ÷10 ×
 * series count. Rounded to the nearest point — an implementation choice
 * for a case the source doesn't specify a rounding rule for (spec §"Domain
 * facts" item 4), not a guessed regulatory value.
 */
function scalePrecisionThresholds(
  group: StandardMedalPrecisionGroup,
  seriesCount: number,
): Thresholds {
  // Row 10 always exists (fixed table literal below) — noUncheckedIndexedAccess
  // can't see that a `number`-keyed Record lookup at a hardcoded key is safe.
  const row10 = PRECISION_THRESHOLDS[10]![group];
  return {
    silver: Math.round((row10.silver / 10) * seriesCount),
    brons: Math.round((row10.brons / 10) * seriesCount),
  };
}

function thresholdsFor(input: StandardMedalPointsInput): Thresholds | null {
  if (input.disciplineId === 'spsf-precision') {
    const group = PRECISION_WEAPON_GROUP_TO_STD_GROUP[input.weaponGroup ?? ''];
    if (!group) return null;
    if (input.seriesCount > 10) return scalePrecisionThresholds(group, input.seriesCount);
    if ((PRECISION_TABULATED_SERIES_COUNTS as readonly number[]).includes(input.seriesCount)) {
      // Membership just checked against the table's own key set.
      return PRECISION_THRESHOLDS[input.seriesCount]![group];
    }
    return null;
  }
  if (input.disciplineId === 'spsf-milsnabb') {
    if (input.seriesCount !== MILSNABB_SERIES_COUNT) return null;
    const group = MILSNABB_WEAPON_GROUP_TO_STD_GROUP[input.weaponGroup ?? ''];
    return group ? MILSNABB_THRESHOLDS[group] : null;
  }
  if (input.disciplineId === 'spsf-magnumprecision') {
    if (input.seriesCount !== MAGNUM_SERIES_COUNT) return null;
    const row = MAGNUM_WEAPON_GROUP_TO_STD_GROUP[input.weaponGroup ?? ''];
    return row ? MAGNUM_THRESHOLDS[row] : null;
  }
  return null;
}

/** The brons/silver band a session/section's point total meets, if any. */
export function standardMedalPoints(input: StandardMedalPointsInput): StandardMedalResult {
  const thresholds = thresholdsFor(input);
  if (!thresholds) return NO_RESULT;
  const grade: StandardMedalGrade | null =
    input.totalPoints >= thresholds.silver
      ? 'silver'
      : input.totalPoints >= thresholds.brons
        ? 'brons'
        : null;
  return { grade, silverThreshold: thresholds.silver, bronsThreshold: thresholds.brons };
}

export interface StandardMedalSessionInput {
  disciplineId: string;
  weaponGroup?: string | null;
  hasFinal: boolean;
  /** Scored series count / points in the grundomgång (excludes the final). */
  beforeFinalSeriesCount: number;
  beforeFinalTenths: number;
  /** Scored series count / points across the whole session. */
  totalSeriesCount: number;
  totalTenths: number;
}

/**
 * Session-level standardMedal evaluator (spsf-domain rule 3): when the
 * session has a final, the medal always evaluates the grundomgång
 * (beforeFinal), never the after-final total.
 *
 * @Requirements SCORE_002
 */
export function standardMedalForSession(input: StandardMedalSessionInput): StandardMedalResult {
  const seriesCount = input.hasFinal ? input.beforeFinalSeriesCount : input.totalSeriesCount;
  const tenths = input.hasFinal ? input.beforeFinalTenths : input.totalTenths;
  return standardMedalPoints({
    disciplineId: input.disciplineId,
    weaponGroup: input.weaponGroup,
    seriesCount,
    totalPoints: tenths / 10,
  });
}
