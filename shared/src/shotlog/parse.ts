// ShotLog CSV row parsing (docs/specs/shotlog-import-spec.md §2). Row-level
// errors are reported, never thrown: one malformed line must not cost the
// user the other 276.
import { parseCsv } from './csv-codec';
import type { ShotlogParseResult, ShotlogRow, ShotlogRowError, ShotlogWarning } from './types';

export const SHOTLOG_HEADER = [
  'Datetime',
  'Session name',
  'Session type',
  'Total score',
  'Number of X',
  '(X)',
  'Firearm',
  'Tags',
  'Note',
] as const;

const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;

// ShotLog names a session it was never given a name for with the device
// locale's timestamp, e.g. "6/29/2025, 10:32 AM" (the space before AM/PM is
// often U+202F, hence \s rather than a literal blank).
const AUTO_NAME_PATTERN = /^\d{1,2}\/\d{1,2}\/\d{4},\s+\d{1,2}:\d{2}\s+(AM|PM)$/u;

/** Non-negative integer, with blank meaning `0`; `null` when unparseable. */
function parseCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return 0;
  if (!/^\d+$/u.test(trimmed)) return null;
  return Number(trimmed);
}

function isRealInstant(value: string): boolean {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return false;
  // Date.parse accepts '2026-02-30T00:00:00Z' by rolling over; round-tripping
  // catches that, so an impossible calendar date is a row error.
  return new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19);
}

function parseRow(fields: readonly string[], line: number): ShotlogRow | ShotlogRowError {
  if (fields.length !== SHOTLOG_HEADER.length) {
    return {
      line,
      message: `column-count: expected ${SHOTLOG_HEADER.length}, got ${fields.length}`,
    };
  }

  const datetime = fields[0]!.trim();
  if (!INSTANT_PATTERN.test(datetime) || !isRealInstant(datetime)) {
    return { line, message: `datetime: not an ISO-8601 UTC instant` };
  }

  const totalScore = parseCount(fields[3]!);
  if (totalScore === null) return { line, message: 'total-score: not a non-negative integer' };
  const tenCount = parseCount(fields[4]!);
  if (tenCount === null) return { line, message: 'ten-count: not a non-negative integer' };
  const innerTenCount = parseCount(fields[5]!);
  if (innerTenCount === null)
    return { line, message: 'inner-ten-count: not a non-negative integer' };

  const name = fields[1]!.trim();
  const firearm = fields[6]!.trim();

  const warnings: ShotlogWarning[] = [];
  if (innerTenCount > tenCount) warnings.push('inner-ten-exceeds-ten-count');
  if (AUTO_NAME_PATTERN.test(name)) warnings.push('auto-generated-name');
  if (firearm !== '') warnings.push('firearm-column-unsupported');

  return {
    line,
    datetime,
    name,
    sourceType: fields[2]!.trim(),
    totalScore,
    tenCount,
    innerTenCount,
    tags: fields[7]!
      .split('|')
      .map((tag) => tag.trim())
      .filter((tag) => tag !== ''),
    note: fields[8]!.trim(),
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

/**
 * Parses a ShotLog export. Fails as a whole only on an empty file or a
 * header that is not §2's nine columns — everything else is a per-row
 * error alongside the rows that did parse.
 */
export function parseShotlogCsv(text: string): ShotlogParseResult {
  if (text.trim() === '') return { ok: false, error: 'empty' };

  const table = parseCsv(text);
  // The blank-file guard above means `parseCsv` returned at least one row.
  // Trimming each header cell also strips ShotLog's leading UTF-8 BOM, which
  // `String.trim` treats as whitespace (ZWNBSP) — no separate BOM step.
  const header = table[0]!.map((field) => field.trim());
  const headerMatches =
    header.length === SHOTLOG_HEADER.length &&
    SHOTLOG_HEADER.every((expected, index) => header[index] === expected);
  if (!headerMatches) return { ok: false, error: 'header-mismatch', found: header };

  const rows: ShotlogRow[] = [];
  const errors: ShotlogRowError[] = [];
  // The header matched §2's nine single-line columns, so it spans line 1 and
  // the first data record starts at line 2.
  let fileLine = 2;
  for (let index = 1; index < table.length; index += 1) {
    const fields = table[index]!;
    const span = lineSpan(fields);
    // A trailing blank line parses as one empty field — skip it silently
    // rather than reporting a column-count error the user cannot act on.
    if (!(fields.length === 1 && fields[0]!.trim() === '')) {
      const parsed = parseRow(fields, fileLine);
      if ('message' in parsed) errors.push(parsed);
      else rows.push(parsed);
    }
    fileLine += span;
  }

  return { ok: true, rows, errors };
}
