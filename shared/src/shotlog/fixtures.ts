// Synthetic ShotLog fixtures. Every id, name, tag, note, date and score here
// is INVENTED — the maintainer's real export supplied the format only (spec
// §0's real-data rule), never a value.
import { SHOTLOG_HEADER } from './parse';
import type { ShotlogSession } from './types';

/** ShotLog writes its export with a UTF-8 byte-order mark. */
export const BOM = String.fromCharCode(0xfeff);

export const FIXTURE_SHOT_COLUMNS = 5;

export function headerLine(shotColumns: number = FIXTURE_SHOT_COLUMNS): string {
  const shots = Array.from({ length: shotColumns }, (_, index) => `Shot ${index + 1}`);
  return [...SHOTLOG_HEADER, ...shots].join(',');
}

export const SHOTLOG_HEADER_LINE = headerLine();

export interface FixtureSession {
  id: string;
  /** `YYYY-MM-DD HH:MM:SS`, local wall time. */
  datetime: string;
  name: string;
  sourceType?: string;
  discipline?: string;
  family?: string;
  firearm?: string;
  tags?: string;
  note?: string;
}

export interface FixtureSeries {
  /** Defaults to the series' 1-based index. `''` writes a blank cell. */
  number?: number | string;
  segment?: string;
  sighting?: string;
  /** Shot tokens as ShotLog writes them: `'9'`, `'X'`, `'(X)'`. */
  shots: readonly string[];
  /** Defaults to the shots' sum, with X and (X) as 10. */
  total?: number | string;
  /** Defaults to the number of `X` shots. */
  tens?: number | string;
  /** Defaults to the number of `(X)` shots. */
  innerTens?: number | string;
}

function field(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/gu, '""')}"` : value;
}

function shotPoints(token: string): number {
  return token === 'X' || token === '(X)' ? 10 : Number(token);
}

function sessionCells(session: FixtureSession): string[] {
  return [
    session.id,
    session.datetime,
    session.name,
    session.sourceType ?? 'Practice',
    session.discipline ?? 'Generic (ring scoring)',
    session.family ?? 'ring_generic',
    session.firearm ?? '',
    session.tags ?? '',
    session.note ?? '',
  ];
}

export function seriesLine(
  session: FixtureSession,
  series: FixtureSeries,
  index: number,
  shotColumns: number = FIXTURE_SHOT_COLUMNS,
): string {
  const shots = series.shots.filter((token) => token !== '');
  const cells = [
    ...sessionCells(session),
    String(series.number ?? index + 1),
    series.segment ?? '',
    series.sighting ?? 'No',
    String(series.total ?? shots.reduce((sum, token) => sum + shotPoints(token), 0)),
    String(series.tens ?? shots.filter((token) => token === 'X').length),
    String(series.innerTens ?? shots.filter((token) => token === '(X)').length),
    ...Array.from({ length: shotColumns }, (_, column) => series.shots[column] ?? ''),
  ];
  return cells.map(field).join(',');
}

/** The single row ShotLog writes for a session that has no series. */
export function emptySessionLine(
  session: FixtureSession,
  shotColumns: number = FIXTURE_SHOT_COLUMNS,
): string {
  return [...sessionCells(session), '', '', '', '', '', '', ...Array<string>(shotColumns).fill('')]
    .map(field)
    .join(',');
}

export interface FixtureEntry {
  session: FixtureSession;
  /** Omit or leave empty for a session with no series. */
  series?: readonly FixtureSeries[];
}

export function sessionLines(entry: FixtureEntry, shotColumns = FIXTURE_SHOT_COLUMNS): string[] {
  const series = entry.series ?? [];
  if (series.length === 0) return [emptySessionLine(entry.session, shotColumns)];
  return series.map((item, index) => seriesLine(entry.session, item, index, shotColumns));
}

/** Builds a complete synthetic ShotLog export, header included. */
export function fixtureCsv(
  entries: readonly FixtureEntry[],
  { bom = false, shotColumns = FIXTURE_SHOT_COLUMNS } = {},
): string {
  const body = [
    headerLine(shotColumns),
    ...entries.flatMap((entry) => sessionLines(entry, shotColumns)),
  ].join('\r\n');
  return bom ? BOM + body : body;
}

/** Five plain shots worth 45 — the default series when the score is not the point. */
export const PLAIN_SERIES: FixtureSeries = { shots: ['X', '9', '9', '9', '8'] };

/** A parsed session for tests of the layers above `parseShotlogCsv`. */
export function parsedSession(patch: Partial<ShotlogSession> & { line: number }): ShotlogSession {
  return {
    sessionId: `S-${patch.line.toString(16).padStart(8, '0')}`,
    localDatetime: '2026-05-04 11:00:00',
    datetime: '2026-05-04T09:00:00.000Z',
    name: 'Club Cup A',
    sourceType: 'Practice',
    discipline: 'Generic (ring scoring)',
    family: 'ring_generic',
    tags: [],
    note: '',
    series: [
      {
        line: patch.line,
        position: 1,
        isSighter: false,
        shots: [{ valueTenths: 100, isInnerTen: false }],
      },
    ],
    warnings: [],
    ...patch,
  };
}
