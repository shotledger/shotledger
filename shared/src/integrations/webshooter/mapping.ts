// Webshooter -> ShotLedger mapping (spec §4). Fail-soft on anything not
// confidently resolvable — never a guess (spsf-domain rule 8 / v2 spec §A.8).
import type { ResultRow, StationResult } from './api/schemas';

// --- §4.1 classname -> weapon_group/shooter_class ---------------------------

export type ClassnameMappingResult =
  | { ok: true; weaponGroup: string; shooterClass: string }
  | { ok: false; classname: string; reason: string };

interface ClassnamePattern {
  regex: RegExp;
  build: (match: RegExpExecArray) => { weaponGroup: string; shooterClass: string };
}

const CLASSNAME_PATTERNS: readonly ClassnamePattern[] = [
  {
    regex: /^(A|B|C|R)(\d)$/u,
    build: (m) => ({ weaponGroup: `spsf:${m[1]}`, shooterClass: m[2]! }),
  },
  {
    regex: /^CD(\d)$/u,
    build: (m) => ({ weaponGroup: 'spsf:C', shooterClass: `Dam${m[1]}` }),
  },
  {
    regex: /^CJun$/u,
    build: () => ({ weaponGroup: 'spsf:C', shooterClass: 'Jun' }),
  },
  {
    regex: /^CVÄ$/u,
    build: () => ({ weaponGroup: 'spsf:C', shooterClass: 'VetÄ' }),
  },
  {
    regex: /^CVY$/u,
    build: () => ({ weaponGroup: 'spsf:C', shooterClass: 'VetY' }),
  },
  {
    regex: /^A Opt (\d)$/u,
    build: (m) => ({ weaponGroup: 'spsf:A-opt', shooterClass: m[1]! }),
  },
];

/**
 * Maps a Webshooter `classname` string to ShotLedger's orthogonal
 * weapon_group/shooter_class pair, or reports it as unmapped. Never guesses
 * (spec §4.1) — a `ok: false` result is the app layer's cue to prompt for a
 * manual mapping and cache it in `settings` (this module has no settings
 * access, by design).
 */
export function mapClassname(classname: string): ClassnameMappingResult {
  for (const pattern of CLASSNAME_PATTERNS) {
    const match = pattern.regex.exec(classname);
    if (match) return { ok: true, ...pattern.build(match) };
  }
  return {
    ok: false,
    classname,
    reason: `Unrecognized Webshooter classname "${classname}" — needs a manual mapping`,
  };
}

// --- §4.2 competition type -> discipline/program ---------------------------

export type WebshooterResultsType = 'precision' | 'field' | 'military' | 'pointfield' | null;

export interface DisciplineProgramIds {
  disciplineId: string;
  /** Null for fält, which has no fixed program: a round is as many stations as the arrangör lays out. */
  programId: string | null;
  /** How a fält competition presents its result (SHB D.6.11 p. 95); null on a ring discipline. */
  faltResultMode: 'falt' | 'poangfalt' | null;
}

const RESULTS_TYPE_TO_PROGRAM: Record<NonNullable<WebshooterResultsType>, DisciplineProgramIds> = {
  precision: { disciplineId: 'spsf-precision', programId: 'spsf-precision', faltResultMode: null },
  military: { disciplineId: 'spsf-milsnabb', programId: 'spsf-milsnabb', faltResultMode: null },
  field: { disciplineId: 'spsf-falt', programId: null, faltResultMode: 'falt' },
  pointfield: { disciplineId: 'spsf-falt', programId: null, faltResultMode: 'poangfalt' },
};

/** `null` only when Webshooter reports no `results_type` at all. */
export function mapResultsType(resultsType: WebshooterResultsType): DisciplineProgramIds | null {
  if (resultsType === null) return null;
  return RESULTS_TYPE_TO_PROGRAM[resultsType];
}

// --- §4.3 results -> series-total-without-shots -----------------------------

export interface MappedSeriesOverride {
  position: number;
  isFinal: boolean;
  isTotalOverride: true;
  totalOverrideTenths: number;
  totalOverrideShotCount: number;
}

function mapSection(
  rows: readonly StationResult[],
  isFinal: boolean,
  shotsPerSeries: number,
): Omit<MappedSeriesOverride, 'position'>[] {
  return (
    rows
      // A station with no points was not shot. It must not become a series:
      // `null * 10` is 0 in JavaScript, so importing it would invent a
      // zero-scored series and pull every average down after it.
      .filter((row) => row.points !== null)
      .map((row) => ({
        isFinal,
        isTotalOverride: true as const,
        totalOverrideTenths: row.points! * 10,
        totalOverrideShotCount: shotsPerSeries,
      }))
  );
}

/**
 * Flattens `results` (main round) and `results_finals` (§A.6: same section
 * semantics as a locally-entered final) into one position-ordered array of
 * series-total-without-shots structures (§A.4). `results_distinguish`, a
 * särskjutning, is not imported: the app models särskjutning in fält only
 * (maintainer, 2026-10-14; #727), and it never enters the score.
 */
export function mapStationResultsToSeries(
  row: ResultRow,
  shotsPerSeries: number,
): MappedSeriesOverride[] {
  const sections = [
    ...mapSection(row.results, false, shotsPerSeries),
    ...mapSection(row.results_finals, true, shotsPerSeries),
  ];
  return sections.map((section, index) => ({ ...section, position: index + 1 }));
}

// --- fält: results -> stations (#352) ----------------------------------------

export interface MappedFaltStation {
  position: number;
  hits: number;
  figuresHit: number;
  /** A poängmål's ring points; null when the station had none. */
  points: number | null;
  isShootOff: boolean;
}

export type FaltStationsMappingResult =
  { ok: true; stations: MappedFaltStation[] } | { ok: false; reason: string };

const SHOTS_PER_FALT_STATION = 6;

function checkFaltStation(row: StationResult): string | null {
  const hits = row.hits as number;
  const figuresHit = row.figure_hits;
  if (!Number.isInteger(hits) || hits < 0 || hits > SHOTS_PER_FALT_STATION) {
    return `hits ${hits} is outside 0-${SHOTS_PER_FALT_STATION}`;
  }
  if (figuresHit === null) return hits === 0 ? null : `${hits} hits but no figure count`;
  if (!Number.isInteger(figuresHit) || figuresHit < 0 || figuresHit > hits) {
    return `figure_hits ${figuresHit} with ${hits} hits`;
  }
  if (hits > 0 && figuresHit === 0) return `${hits} hits spread over 0 figures`;
  if (row.points !== null && (!Number.isInteger(row.points) || row.points < 0)) {
    return `points ${row.points}`;
  }
  return null;
}

/**
 * One fält station per Webshooter station row, in `stations_id` order — the
 * order every captured response already uses; neither `stations_id` nor
 * `station_id` is a station number. Shoot-off stations follow the round,
 * numbered on (D.6.11.3 p. 97). A row with null hits was not shot and is
 * skipped. Any other row a station could not have produced fails the whole
 * mapping rather than being corrected: the importer never guesses.
 *
 * Webshooter's `points` is a poängmål's ring points and reads 0 on a station
 * without one, so 0 is stored as "no poängmål". A true zero on a poängmål is
 * indistinguishable in the data, and sums are the same either way.
 */
export function mapStationResultsToFaltStations(row: ResultRow): FaltStationsMappingResult {
  // No captured fält response carries finals; they would be ordinary stations.
  const sections: { rows: readonly StationResult[]; isShootOff: boolean }[] = [
    { rows: row.results, isShootOff: false },
    { rows: row.results_finals, isShootOff: false },
    { rows: row.results_distinguish, isShootOff: true },
  ];
  const stations: MappedFaltStation[] = [];
  for (const section of sections) {
    const shot = section.rows
      .filter((station) => station.hits !== null && station.deleted_at === null)
      .slice()
      .sort((a, b) => a.stations_id - b.stations_id);
    for (const station of shot) {
      const problem = checkFaltStation(station);
      if (problem) {
        return { ok: false, reason: `station ${stations.length + 1}: ${problem}` };
      }
      stations.push({
        position: stations.length + 1,
        hits: station.hits as number,
        figuresHit: station.figure_hits ?? 0,
        points: station.points === null || station.points === 0 ? null : station.points,
        isShootOff: section.isShootOff,
      });
    }
  }
  return { ok: true, stations };
}

// --- §4.3 official placement/medal -------------------------------------------

export type OfficialStandardMedal = 'none' | 'brons' | 'silver';

export interface MappedOfficialResult {
  officialPlacement: number;
  officialStandardMedal: OfficialStandardMedal;
}

const STD_MEDAL_CODE_TO_VALOR: Record<'B' | 'S', OfficialStandardMedal> = {
  B: 'brons',
  S: 'silver',
};

export function mapOfficialResult(row: ResultRow): MappedOfficialResult {
  return {
    officialPlacement: row.placement,
    officialStandardMedal: row.std_medal === null ? 'none' : STD_MEDAL_CODE_TO_VALOR[row.std_medal],
  };
}
