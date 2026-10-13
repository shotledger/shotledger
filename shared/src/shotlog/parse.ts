// ShotLog CSV parsing (docs/specs/shotlog-import-spec.md §2, revision 2).
// ShotLog 5.4's full export is one row per series; rows sharing a
// `Session ID` form one session. Errors are reported, never thrown: one
// malformed session must not cost the user the other 278.
import { parseCsv } from './csv-codec';
import type {
  ShotlogParseResult,
  ShotlogRowError,
  ShotlogSeries,
  ShotlogSession,
  ShotlogShot,
  ShotlogWarning,
} from './types';

/** The fixed columns; `Shot 1` … `Shot N` follow them. */
export const SHOTLOG_HEADER = [
  'Session ID',
  'Datetime',
  'Session name',
  'Session type',
  'Discipline',
  'Family',
  'Firearm',
  'Tags',
  'Note',
  'Series',
  'Segment',
  'Sighting',
  'Series total',
  'X',
  '(X)',
] as const;

/** The only `Family` measured in a real export (spec §1). */
export const SHOTLOG_RING_FAMILY = 'ring_generic';

const COL = {
  sessionId: 0,
  datetime: 1,
  name: 2,
  sourceType: 3,
  discipline: 4,
  family: 5,
  firearm: 6,
  tags: 7,
  note: 8,
  series: 9,
  segment: 10,
  sighting: 11,
  total: 12,
  tens: 13,
  innerTens: 14,
} as const;

const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/u;

// ShotLog names a session it was never given a name for with the device
// locale's timestamp, e.g. "6/29/2025, 10:32 AM" (the space before AM/PM is
// often U+202F, hence \s rather than a literal blank).
const AUTO_NAME_PATTERN = /^\d{1,2}\/\d{1,2}\/\d{4},\s+\d{1,2}:\d{2}\s+(AM|PM)$/u;

const HALF_DAY_MS = 12 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** Non-negative integer, with blank meaning `0`; `null` when unparseable. */
function parseCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return 0;
  if (!/^\d+$/u.test(trimmed)) return null;
  return Number(trimmed);
}

function parseShot(raw: string): ShotlogShot | null {
  if (raw === 'X') return { valueTenths: 100, isInnerTen: false };
  if (raw === '(X)') return { valueTenths: 100, isInnerTen: true };
  if (/^\d$/u.test(raw)) return { valueTenths: Number(raw) * 10, isInnerTen: false };
  return null;
}

/** The six numbers of a valid `YYYY-MM-DD HH:MM:SS`, or `null`. */
function wallClockParts(value: string): number[] | null {
  const match = LOCAL_DATETIME.exec(value);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  const [y, mo, d, h, mi, s] = parts as [number, number, number, number, number, number];
  // Date.UTC rolls '2026-02-30' over to March; round-tripping catches it.
  const iso = new Date(Date.UTC(y, mo - 1, d, h, mi, s)).toISOString();
  return iso.slice(0, 19) === value.replace(' ', 'T') ? parts : null;
}

function offsetMinutesAt(ms: number): number {
  return new Date(ms).getTimezoneOffset();
}

/**
 * Resolves ShotLog's zone-less local time in the device's zone (spec Q1).
 * The `Date` constructor does the resolving; ECMA-262's LocalTime→UTC rule
 * shifts a time in a DST gap forward and takes the earlier instant in an
 * overlap. This function only adds whether that happened, as `ambiguous`.
 */
export function resolveLocalDatetime(local: string): { instant: string; ambiguous: boolean } {
  const parts = wallClockParts(local);
  if (parts === null) throw new RangeError(`not a ShotLog local datetime: ${local}`);
  const [y, mo, d, h, mi, s] = parts as [number, number, number, number, number, number];
  const instant = new Date(y, mo - 1, d, h, mi, s).toISOString();
  // A wall time has exactly one instant unless a DST transition is near.
  // Each offset seen half a day either side proposes one instant; it counts
  // only if it reads back as the same wall time. Gap: none do. Overlap: two.
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  const offsets = new Set([
    offsetMinutesAt(wall - HALF_DAY_MS),
    offsetMinutesAt(wall + HALF_DAY_MS),
  ]);
  const readsBack = [...offsets].filter((offset) => {
    const candidate = wall + offset * MINUTE_MS;
    return candidate - offsetMinutesAt(candidate) * MINUTE_MS === wall;
  });
  return { instant, ambiguous: readsBack.length !== 1 };
}

/** One parsed CSV row, before rows are grouped into sessions. */
interface SeriesRow {
  line: number;
  sessionId: string;
  /** Every session-level column, joined: equal on every row of a session. */
  sessionKey: string;
  fields: readonly string[];
  /** `null` on a session row that carries no series. */
  seriesNumber: number | null;
  isSighter: boolean;
  shots: ShotlogShot[];
  warnings: ShotlogWarning[];
}

function rowError(line: number, message: string): ShotlogRowError {
  return { line, message };
}

function parseShots(fields: readonly string[], line: number): ShotlogShot[] | ShotlogRowError {
  const shots: ShotlogShot[] = [];
  let sawBlank = false;
  for (let index = SHOTLOG_HEADER.length; index < fields.length; index += 1) {
    const raw = fields[index]!.trim();
    const column = index - SHOTLOG_HEADER.length + 1;
    if (raw === '') {
      sawBlank = true;
      continue;
    }
    if (sawBlank) return rowError(line, `shot-${column}: follows a blank shot`);
    const shot = parseShot(raw);
    if (shot === null) return rowError(line, `shot-${column}: not 0-9, X or (X)`);
    shots.push(shot);
  }
  return shots;
}

/** Totals and counts are checked against the shots; the shots win. */
function checkTotals(
  fields: readonly string[],
  shots: readonly ShotlogShot[],
  line: number,
): ShotlogWarning[] | ShotlogRowError {
  const total = parseCount(fields[COL.total]!);
  if (total === null) return rowError(line, 'series-total: not a non-negative integer');
  const tens = parseCount(fields[COL.tens]!);
  if (tens === null) return rowError(line, 'x: not a non-negative integer');
  const innerTens = parseCount(fields[COL.innerTens]!);
  if (innerTens === null) return rowError(line, '(x): not a non-negative integer');

  const warnings: ShotlogWarning[] = [];
  const sum = shots.reduce((acc, shot) => acc + shot.valueTenths, 0);
  if (sum !== total * 10) warnings.push('series-total-mismatch');
  const plainTens = shots.filter((shot) => shot.valueTenths === 100 && !shot.isInnerTen).length;
  const innerCount = shots.filter((shot) => shot.isInnerTen).length;
  if (plainTens !== tens || innerCount !== innerTens) warnings.push('x-count-mismatch');
  return warnings;
}

function parseRow(
  fields: readonly string[],
  line: number,
  width: number,
): SeriesRow | ShotlogRowError {
  if (fields.length !== width) {
    return rowError(line, `column-count: expected ${width}, got ${fields.length}`);
  }
  const sessionId = fields[COL.sessionId]!.trim();
  if (sessionId === '') return rowError(line, 'session-id: blank');
  if (wallClockParts(fields[COL.datetime]!.trim()) === null) {
    return rowError(line, 'datetime: not YYYY-MM-DD HH:MM:SS');
  }

  const seriesRaw = fields[COL.series]!.trim();
  if (seriesRaw !== '' && !/^[1-9]\d*$/u.test(seriesRaw)) {
    return rowError(line, 'series: not a positive integer');
  }
  const seriesNumber = seriesRaw === '' ? null : Number(seriesRaw);

  const sighting = fields[COL.sighting]!.trim();
  if (sighting !== 'Yes' && sighting !== 'No' && sighting !== '') {
    return rowError(line, 'sighting: not Yes or No');
  }

  const shots = parseShots(fields, line);
  if ('message' in shots) return shots;

  const warnings: ShotlogWarning[] = [];
  if (seriesNumber === null) {
    if (shots.length > 0) return rowError(line, 'series: blank on a row with shots');
  } else {
    if (shots.length === 0) return rowError(line, 'shots: none on a series row');
    const totals = checkTotals(fields, shots, line);
    if ('message' in totals) return totals;
    warnings.push(...totals);
  }
  if (fields[COL.segment]!.trim() !== '') warnings.push('segment-unsupported');

  return {
    line,
    sessionId,
    sessionKey: fields.slice(COL.datetime, COL.series).join('\u0000'),
    fields,
    seriesNumber,
    isSighter: sighting === 'Yes',
    shots,
    warnings,
  };
}

function addWarning(warnings: ShotlogWarning[], warning: ShotlogWarning): void {
  if (!warnings.includes(warning)) warnings.push(warning);
}

/** Folds one session's rows into a session, or the first reason it cannot be. */
function buildSession(rows: readonly SeriesRow[]): ShotlogSession | ShotlogRowError {
  const first = rows[0]!;
  const seen = new Set<number>();
  for (const row of rows) {
    if (row.sessionKey !== first.sessionKey) {
      return rowError(
        row.line,
        'inconsistent-session: session columns differ from line ' + first.line,
      );
    }
    if (row.seriesNumber === null) {
      if (rows.length > 1) {
        return rowError(
          row.line,
          'bad-series-sequence: a row without a series in a session with series',
        );
      }
    } else {
      if (seen.has(row.seriesNumber)) {
        return rowError(row.line, `bad-series-sequence: series ${row.seriesNumber} repeated`);
      }
      seen.add(row.seriesNumber);
    }
  }

  const warnings: ShotlogWarning[] = [];
  const fields = first.fields;
  const name = fields[COL.name]!.trim();
  const family = fields[COL.family]!.trim();
  if (AUTO_NAME_PATTERN.test(name)) warnings.push('auto-generated-name');
  if (fields[COL.firearm]!.trim() !== '') warnings.push('firearm-column-unsupported');
  if (family !== SHOTLOG_RING_FAMILY) warnings.push('family-unsupported');

  const localDatetime = fields[COL.datetime]!.trim();
  const { instant, ambiguous } = resolveLocalDatetime(localDatetime);
  if (ambiguous) warnings.push('ambiguous-local-time');

  const seriesRows = rows.filter((row) => row.seriesNumber !== null);
  let sighterTaken = false;
  const series = seriesRows.map((row, index): ShotlogSeries => {
    if (row.seriesNumber !== index + 1) addWarning(warnings, 'series-gap');
    for (const warning of row.warnings) addWarning(warnings, warning);
    let isSighter = row.isSighter;
    if (isSighter && sighterTaken) {
      isSighter = false;
      addWarning(warnings, 'multiple-sighter-series');
    }
    sighterTaken ||= isSighter;
    return { line: row.line, position: index + 1, isSighter, shots: row.shots };
  });
  // A session row with no series still carries the segment column.
  for (const warning of first.warnings) addWarning(warnings, warning);

  return {
    line: first.line,
    sessionId: first.sessionId,
    localDatetime,
    datetime: instant,
    name,
    sourceType: fields[COL.sourceType]!.trim(),
    discipline: fields[COL.discipline]!.trim(),
    family,
    tags: fields[COL.tags]!.split('|')
      .map((tag) => tag.trim())
      .filter((tag) => tag !== ''),
    note: fields[COL.note]!.trim(),
    series,
    warnings,
  };
}

/**
 * How many physical file lines one parsed record occupies. A quoted field
 * may hold line breaks, so record index and file line are not the same
 * number — and §2 promises the line the user sees in their editor.
 */
function lineSpan(fields: readonly string[]): number {
  let breaks = 0;
  for (const field of fields) breaks += (field.match(/\r\n|\r|\n/gu) ?? []).length;
  return breaks + 1;
}

/** The fixed columns, then `Shot 1` … `Shot N` with N ≥ 1 and no gap. */
function headerMatches(header: readonly string[]): boolean {
  if (header.length <= SHOTLOG_HEADER.length) return false;
  return header.every((name, index) =>
    index < SHOTLOG_HEADER.length
      ? name === SHOTLOG_HEADER[index]
      : name === `Shot ${index - SHOTLOG_HEADER.length + 1}`,
  );
}

interface Group {
  rows: SeriesRow[];
  failed: boolean;
}

/**
 * Parses a ShotLog 5.4 full export. Fails as a whole only on an empty file
 * or a header that is not §2's; everything else is a per-row error. A row
 * error drops the whole session it belongs to — importing it short of a
 * series would be silently wrong.
 */
export function parseShotlogCsv(text: string): ShotlogParseResult {
  if (text.trim() === '') return { ok: false, error: 'empty' };

  const table = parseCsv(text);
  // The blank-file guard above means `parseCsv` returned at least one row.
  // Trimming each header cell also strips ShotLog's leading UTF-8 BOM, which
  // `String.trim` treats as whitespace (ZWNBSP) — no separate BOM step.
  const header = table[0]!.map((field) => field.trim());
  if (!headerMatches(header)) return { ok: false, error: 'header-mismatch', found: header };

  const errors: ShotlogRowError[] = [];
  const groups: Group[] = [];
  const byId = new Map<string, Group>();
  let current: Group | null = null;
  // The header is single-line, so the first data record starts at line 2.
  let fileLine = 2;
  for (let index = 1; index < table.length; index += 1) {
    const fields = table[index]!;
    const line = fileLine;
    fileLine += lineSpan(fields);
    // A trailing blank line parses as one empty field — skip it silently
    // rather than reporting a column-count error the user cannot act on.
    if (fields.length === 1 && fields[0]!.trim() === '') continue;

    const parsed = parseRow(fields, line, header.length);
    // A blank id always fails `parseRow`, so its "session" is dropped too.
    const id = fields[COL.sessionId]!.trim();
    let group = byId.get(id);
    if (group === undefined) {
      group = { rows: [], failed: false };
      byId.set(id, group);
      groups.push(group);
    } else if (group !== current && !group.failed) {
      errors.push(rowError(line, `split-session: ${id} also appears before line ${line}`));
      group.failed = true;
    }
    current = group;
    if ('message' in parsed) {
      errors.push(parsed);
      group.failed = true;
    } else {
      group.rows.push(parsed);
    }
  }

  const sessions: ShotlogSession[] = [];
  for (const group of groups) {
    if (group.failed) continue;
    const built = buildSession(group.rows);
    if ('message' in built) errors.push(built);
    else sessions.push(built);
  }
  errors.sort((a, b) => a.line - b.line);
  return { ok: true, sessions, errors };
}
