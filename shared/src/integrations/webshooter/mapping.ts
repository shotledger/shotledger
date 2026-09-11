// WebShooter -> ShotLedger mapping (spec §4). Fail-soft on anything not
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
 * Maps a WebShooter `classname` string to ShotLedger's orthogonal
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
    reason: `Unrecognized WebShooter classname "${classname}" — needs a manual mapping`,
  };
}

// --- §4.2 competition type -> discipline/program ---------------------------

export type WebShooterResultsType = 'precision' | 'field' | 'military' | 'pointfield' | null;

export interface DisciplineProgramIds {
  disciplineId: string;
  programId: string;
}

const RESULTS_TYPE_TO_PROGRAM: Partial<
  Record<NonNullable<WebShooterResultsType>, DisciplineProgramIds>
> = {
  precision: { disciplineId: 'spsf-precision', programId: 'spsf-precision' },
  military: { disciplineId: 'spsf-milsnabb', programId: 'spsf-milsnabb' },
};

/** `null` for `field`/`pointfield`/`null` — not importable (spec §A.9). */
export function mapResultsType(resultsType: WebShooterResultsType): DisciplineProgramIds | null {
  if (resultsType === null) return null;
  return RESULTS_TYPE_TO_PROGRAM[resultsType] ?? null;
}

// --- §4.3 results -> series-total-without-shots -----------------------------

export interface MappedSeriesOverride {
  position: number;
  isFinal: boolean;
  note: 'särskjutning' | null;
  isTotalOverride: true;
  totalOverrideTenths: number;
  totalOverrideShotCount: number;
}

function mapSection(
  rows: readonly StationResult[],
  isFinal: boolean,
  note: 'särskjutning' | null,
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
        note,
        isTotalOverride: true as const,
        totalOverrideTenths: row.points! * 10,
        totalOverrideShotCount: shotsPerSeries,
      }))
  );
}

/**
 * Flattens `results` (main round), `results_finals` (§A.6: same section
 * semantics as a locally-entered final), and `results_distinguish` (§A.6:
 * ordinary extra scored series with a särskjutning note, never a special
 * flag) into one position-ordered array of series-total-without-shots
 * structures (§A.4).
 */
export function mapStationResultsToSeries(
  row: ResultRow,
  shotsPerSeries: number,
): MappedSeriesOverride[] {
  const sections = [
    ...mapSection(row.results, false, null, shotsPerSeries),
    ...mapSection(row.results_finals, true, null, shotsPerSeries),
    ...mapSection(row.results_distinguish, false, 'särskjutning', shotsPerSeries),
  ];
  return sections.map((section, index) => ({ ...section, position: index + 1 }));
}

// --- §4.3 official placement/medal -------------------------------------------

export type OfficialStandardmedalj = 'none' | 'brons' | 'silver';

export interface MappedOfficialResult {
  officialPlacement: number;
  officialStandardmedalj: OfficialStandardmedalj;
}

const STD_MEDAL_CODE_TO_VALOR: Record<'B' | 'S', OfficialStandardmedalj> = {
  B: 'brons',
  S: 'silver',
};

export function mapOfficialResult(row: ResultRow): MappedOfficialResult {
  return {
    officialPlacement: row.placement,
    officialStandardmedalj:
      row.std_medal === null ? 'none' : STD_MEDAL_CODE_TO_VALOR[row.std_medal],
  };
}

// --- §4.4 local time -> UTC ---------------------------------------------------

interface NaiveDateTimeParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function parseNaive(localDateTime: string): NaiveDateTimeParts {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/u.exec(localDateTime);
  if (!match) {
    throw new RangeError(`Expected "YYYY-MM-DD HH:mm:ss", got ${JSON.stringify(localDateTime)}`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6]),
  };
}

/** IANA zone offset, in minutes east of UTC, for the instant `ms`. */
function offsetMinutesAt(timeZone: string, ms: number): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(ms)).map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - ms) / 60000;
}

/**
 * Converts a naive `"YYYY-MM-DD HH:mm:ss"` local timestamp (WebShooter's own
 * format, no offset) to a UTC ISO string, without a date/tz library
 * dependency (spec §4.4). Fixed-point technique: guess the instant as if the
 * wall-clock components were UTC, sample the zone's actual offset at that
 * instant, correct, then resample once more — two samples always converge
 * here because Europe/Stockholm's offset only ever takes one of two values
 * (+1h/+2h) and the correction is small enough never to cross a second DST
 * boundary.
 */
export function localToUtcIso(localDateTime: string, timeZone = 'Europe/Stockholm'): string {
  const parts = parseNaive(localDateTime);
  const naiveUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  let candidateMs = naiveUtcMs;
  for (let i = 0; i < 2; i += 1) {
    const offsetMinutes = offsetMinutesAt(timeZone, candidateMs);
    candidateMs = naiveUtcMs - offsetMinutes * 60000;
  }
  return new Date(candidateMs).toISOString();
}
