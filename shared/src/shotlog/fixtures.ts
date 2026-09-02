// Synthetic ShotLog fixtures. Every name, tag and note here is INVENTED —
// the maintainer's real export supplied the format only (spec §0's
// real-data rule), never a value.
import { SHOTLOG_HEADER } from './parse';

export const SHOTLOG_HEADER_LINE = SHOTLOG_HEADER.join(',');

/** ShotLog writes its export with a UTF-8 byte-order mark. */
export const BOM = String.fromCharCode(0xfeff);

export interface FixtureRow {
  datetime: string;
  name: string;
  sourceType?: string;
  total: number | string;
  tens?: number | string;
  innerTens?: number | string;
  firearm?: string;
  tags?: string;
  note?: string;
}

function field(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/gu, '""')}"` : value;
}

export function fixtureLine(row: FixtureRow): string {
  return [
    row.datetime,
    row.name,
    row.sourceType ?? 'Practice',
    String(row.total),
    String(row.tens ?? 0),
    String(row.innerTens ?? 0),
    row.firearm ?? '',
    row.tags ?? '',
    row.note ?? '',
  ]
    .map(field)
    .join(',');
}

/** Builds a complete synthetic ShotLog export, header included. */
export function fixtureCsv(rows: readonly FixtureRow[], { bom = false } = {}): string {
  const body = [SHOTLOG_HEADER_LINE, ...rows.map(fixtureLine)].join('\r\n');
  return bom ? BOM + body : body;
}
