// Pistolskyttemärke per-series thresholds — the colloquial "guldserie".
// Executable spec: docs/specs/m3-scoring-spec.md §4.
// Source: SHB 2026 Bilaga 1 mom 5.1.1.1 p. 452, transcribed in
// docs/reference/spsf-shb-2026.md. Values are POINTS (not tenths) per
// 5-shot precision series.

export type MarkeValor = 'brons' | 'silver' | 'guld';
export type MarkeGroup = 'A' | 'B' | 'C';

const THRESHOLDS: Record<MarkeValor, Record<MarkeGroup, number>> = {
  brons: { A: 32, B: 33, C: 34 },
  silver: { A: 38, B: 39, C: 40 },
  guld: { A: 43, B: 45, C: 46 },
};

/** The per-series requirement is defined for 5-shot precision series only. */
const MARKE_SERIES_LENGTH = 5;
const MARKE_DISCIPLINES = new Set(['spsf-precision']);

// Sub-groups AM/AP/AG and A-opt are variants of vapengrupp A (SHB F.4.1,
// F.4.5) and share its märke row — see spec §4 M10 (VERIFY V3).
const WEAPON_GROUP_TO_MARKE_GROUP: Record<string, MarkeGroup> = {
  'spsf:A': 'A',
  'spsf:AM': 'A',
  'spsf:AP': 'A',
  'spsf:AG': 'A',
  'spsf:A-opt': 'A',
  'spsf:B': 'B',
  'spsf:C': 'C',
};

const EARLIEST_BIRTH_YEAR = 1900;

export interface MarkeThresholdInput {
  valor: MarkeValor;
  markeGroup: MarkeGroup;
  birthYear?: number | null;
  year: number;
}

export interface SeriesThresholdInput {
  weaponGroup?: string | null;
  disciplineId: string;
  seriesLength: number;
  birthYear?: number | null;
  year: number;
}

/** Maps a federation-scoped vapengrupp id to its märke row, or null. */
export function markeGroupForWeaponGroup(weaponGroup?: string | null): MarkeGroup | null {
  if (!weaponGroup) return null;
  return WEAPON_GROUP_TO_MARKE_GROUP[weaponGroup] ?? null;
}

/**
 * Points deducted per series for age: −1 from the year AFTER turning 55,
 * −2 from the year after turning 65 (SHB Bilaga 1 mom 5.1.1.1).
 */
export function ageReduction(birthYear: number | null | undefined, year: number): number {
  if (birthYear === null || birthYear === undefined) return 0;
  if (!Number.isInteger(birthYear) || birthYear < EARLIEST_BIRTH_YEAR || birthYear > year) {
    throw new RangeError(`birthYear must be an integer between ${EARLIEST_BIRTH_YEAR} and ${year}`);
  }
  const age = year - birthYear;
  if (age > 65) return 2;
  if (age > 55) return 1;
  return 0;
}

/** Age-adjusted märke threshold in points for one 5-shot precision series. */
export function markeThreshold(input: MarkeThresholdInput): number {
  const base = THRESHOLDS[input.valor][input.markeGroup];
  return base - ageReduction(input.birthYear, input.year);
}

/**
 * The guld ("guldserie") threshold for a given series, or null when the
 * märke requirement does not apply — a weapon group with no row (R, magnum,
 * airgun), a non-precision discipline, or a series that is not 5 shots.
 */
export function guldserieThreshold(input: SeriesThresholdInput): number | null {
  if (input.seriesLength !== MARKE_SERIES_LENGTH) return null;
  if (!MARKE_DISCIPLINES.has(input.disciplineId)) return null;
  const markeGroup = markeGroupForWeaponGroup(input.weaponGroup);
  if (markeGroup === null) return null;
  return markeThreshold({
    valor: 'guld',
    markeGroup,
    birthYear: input.birthYear,
    year: input.year,
  });
}

/** True when a series score (in points) meets the guld requirement. */
export function isGuldserie(points: number, input: SeriesThresholdInput): boolean {
  const threshold = guldserieThreshold(input);
  return threshold !== null && points >= threshold;
}

const MARKE_VALORS: readonly MarkeValor[] = ['brons', 'silver', 'guld'];
const MARKE_GROUPS: readonly MarkeGroup[] = ['A', 'B', 'C'];

export type MarkeThresholdTable = Record<MarkeGroup, Record<MarkeValor, number>>;

export interface MarkeThresholdTableInput {
  birthYear?: number | null;
  year: number;
}

/**
 * Every brons/silver/guld × A/B/C threshold for one birth year and year, age
 * reduction applied — for UI that shows the whole table (e.g. a settings
 * screen) rather than a single cell via {@link markeThreshold}.
 */
export function allMarkeThresholds(input: MarkeThresholdTableInput): MarkeThresholdTable {
  const table = {} as MarkeThresholdTable;
  for (const markeGroup of MARKE_GROUPS) {
    const row = {} as Record<MarkeValor, number>;
    for (const valor of MARKE_VALORS) {
      row[valor] = markeThreshold({
        valor,
        markeGroup,
        birthYear: input.birthYear,
        year: input.year,
      });
    }
    table[markeGroup] = row;
  }
  return table;
}
