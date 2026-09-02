import { parseCsv } from './csv-codec';
import { CSV_COLUMNS, csvRowSchema, type CsvColumn, type CsvRow, type RowError } from './types';

export interface CsvRowEntry {
  /** 1-based data row number (header excluded), for error reporting. */
  row: number;
  data: CsvRow;
}

/** Parses raw CSV text into validated rows. Never throws on bad data —
 * invalid rows are collected in `errors`, valid ones in `entries`. */
export function parseImportCsv(text: string): { entries: CsvRowEntry[]; errors: RowError[] } {
  const matrix = parseCsv(text);
  if (matrix.length === 0) return { entries: [], errors: [] };

  const [header, ...dataRows] = matrix;
  if (!header) return { entries: [], errors: [] };
  const missingColumns = CSV_COLUMNS.filter((c) => !header.includes(c));
  if (missingColumns.length > 0) {
    return {
      entries: [],
      errors: [{ row: 0, message: `missing column(s): ${missingColumns.join(', ')}` }],
    };
  }

  const entries: CsvRowEntry[] = [];
  const errors: RowError[] = [];

  dataRows.forEach((raw, index) => {
    const rowNum = index + 1;
    if (raw.length === 1 && raw[0] === '') return; // trailing blank line

    const record: Record<string, string> = {};
    for (const col of CSV_COLUMNS as readonly CsvColumn[]) {
      record[col] = raw[header.indexOf(col)] ?? '';
    }

    const result = csvRowSchema.safeParse(record);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({
          row: rowNum,
          column: String(issue.path[0] ?? ''),
          message: issue.message,
        });
      }
      return;
    }
    entries.push({ row: rowNum, data: result.data });
  });

  return { entries, errors };
}

export interface SeriesImportGroup {
  position: number;
  isSighter: boolean;
  isFinal: boolean;
  shots: { position: number; valueTenths: number; isInnerTen: boolean }[];
}

export interface SessionImportGroup {
  sessionId: string;
  name: string;
  type: 'training' | 'competition';
  disciplineId: string;
  programId: string | null;
  competitionLevel: string | null;
  isChampionship: boolean;
  competitionName: string | null;
  weaponGroup: string | null;
  shooterClass: string | null;
  firearm: string | null;
  ammoLot: string | null;
  startedAt: string;
  location: string | null;
  notes: string | null;
  decimalScoring: boolean;
  extraRounds: number | null;
  tags: string[];
  series: SeriesImportGroup[];
}

const SESSION_LEVEL_KEYS = [
  'session_name',
  'session_type',
  'discipline_id',
  'program_id',
  'competition_level',
  'is_championship',
  'competition_name',
  'weapon_group',
  'shooter_class',
  'firearm',
  'ammo_lot',
  'started_at',
  'location',
  'notes',
  'decimal_scoring',
  'extra_rounds',
  'tags',
] as const satisfies readonly (keyof CsvRow)[];

function toGroup(sessionId: string, first: CsvRow): SessionImportGroup {
  return {
    sessionId,
    name: first.session_name,
    type: first.session_type,
    disciplineId: first.discipline_id,
    programId: first.program_id,
    competitionLevel: first.competition_level,
    isChampionship: first.is_championship,
    competitionName: first.competition_name,
    weaponGroup: first.weapon_group,
    shooterClass: first.shooter_class,
    firearm: first.firearm,
    ammoLot: first.ammo_lot,
    startedAt: first.started_at,
    location: first.location,
    notes: first.notes,
    decimalScoring: first.decimal_scoring,
    extraRounds: first.extra_rounds,
    tags: first.tags.length === 0 ? [] : first.tags.split('|'),
    series: [],
  };
}

/**
 * Groups validated rows by session_id, checks session-level consistency
 * and structural rules, and orders series/shots by position.
 */
export function groupRowsIntoSessions(entries: readonly CsvRowEntry[]): {
  groups: SessionImportGroup[];
  errors: RowError[];
} {
  const errors: RowError[] = [];
  const firstRowBySession = new Map<string, CsvRow>();
  const rowsBySession = new Map<string, CsvRowEntry[]>();

  for (const entry of entries) {
    const id = entry.data.session_id;
    const first = firstRowBySession.get(id);
    if (!first) {
      firstRowBySession.set(id, entry.data);
      rowsBySession.set(id, [entry]);
      continue;
    }
    for (const key of SESSION_LEVEL_KEYS) {
      if (first[key] !== entry.data[key]) {
        errors.push({
          row: entry.row,
          column: key,
          message: `conflicts with an earlier row for session ${id} (session-level fields must match)`,
        });
        break;
      }
    }
    rowsBySession.get(id)!.push(entry);
  }

  const groups: SessionImportGroup[] = [];

  for (const [sessionId, rows] of rowsBySession) {
    const group = toGroup(sessionId, firstRowBySession.get(sessionId)!);
    const sessionOnly = rows.filter((r) => r.data.series_position === null);
    const withSeries = rows.filter((r) => r.data.series_position !== null);

    if (sessionOnly.length > 0 && withSeries.length > 0) {
      for (const r of rows) {
        errors.push({
          row: r.row,
          column: 'series_position',
          message: `session ${sessionId} mixes a session-only row with series rows`,
        });
      }
      continue;
    }

    if (sessionOnly.length > 1) {
      for (const r of sessionOnly.slice(1)) {
        errors.push({
          row: r.row,
          message: `session ${sessionId} has more than one session-only row`,
        });
      }
      groups.push(group);
      continue;
    }

    if (sessionOnly.length === 1) {
      groups.push(group);
      continue;
    }

    const bySeries = new Map<number, CsvRowEntry[]>();
    for (const r of withSeries) {
      const pos = r.data.series_position!;
      const bucket = bySeries.get(pos) ?? [];
      bucket.push(r);
      bySeries.set(pos, bucket);
    }

    const seriesPositions = [...bySeries.keys()].sort((a, b) => a - b);
    for (const seriesPos of seriesPositions) {
      const seriesRows = bySeries.get(seriesPos)!;
      const emptyRows = seriesRows.filter((r) => r.data.shot_position === null);
      const shotRows = seriesRows.filter((r) => r.data.shot_position !== null);

      if (emptyRows.length > 0 && shotRows.length > 0) {
        for (const r of seriesRows) {
          errors.push({
            row: r.row,
            column: 'shot_position',
            message: `series ${seriesPos} of session ${sessionId} mixes an empty-series row with shot rows`,
          });
        }
        continue;
      }

      const first = seriesRows[0]!.data;
      const seriesGroup: SeriesImportGroup = {
        position: seriesPos,
        isSighter: first.is_sighter,
        isFinal: first.is_final,
        shots: [],
      };

      if (emptyRows.length > 1) {
        for (const r of emptyRows.slice(1)) {
          errors.push({
            row: r.row,
            message: `series ${seriesPos} of session ${sessionId} has more than one empty-series row`,
          });
        }
      }

      const seenShotPositions = new Set<number>();
      for (const r of shotRows) {
        const pos = r.data.shot_position!;
        if (seenShotPositions.has(pos)) {
          errors.push({
            row: r.row,
            column: 'shot_position',
            message: `duplicate shot_position ${pos} in series ${seriesPos} of session ${sessionId}`,
          });
          continue;
        }
        seenShotPositions.add(pos);
        seriesGroup.shots.push({
          position: pos,
          valueTenths: r.data.value_tenths!,
          isInnerTen: r.data.is_inner_ten,
        });
      }
      seriesGroup.shots.sort((a, b) => a.position - b.position);
      group.series.push(seriesGroup);
    }

    groups.push(group);
  }

  return { groups, errors };
}
