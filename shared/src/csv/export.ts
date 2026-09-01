import { CSV_COLUMNS, type SessionExport } from './types';
import { stringifyRows } from './csv-codec';

const bool = (b: boolean) => (b ? '1' : '0');
const str = (s: string | null) => s ?? '';
const int = (n: number | null) => (n === null ? '' : String(n));

/** Builds the raw string matrix (header + data rows) for a set of sessions. */
export function buildCsvRows(sessionsExport: readonly SessionExport[]): string[][] {
  const rows: string[][] = [[...CSV_COLUMNS]];

  for (const session of sessionsExport) {
    const sessionCols = [
      session.id,
      session.name,
      session.type,
      session.disciplineId,
      str(session.programId),
      str(session.competitionLevel),
      bool(session.isChampionship),
      str(session.competitionName),
      str(session.weaponGroup),
      str(session.shooterClass),
      str(session.firearm),
      str(session.ammoLot),
      session.startedAt,
      str(session.location),
      str(session.notes),
      bool(session.decimalScoring),
      int(session.extraRounds),
      session.tags.join('|'),
    ];

    if (session.series.length === 0) {
      // Session-only row: every position/value/inner-ten column blank.
      rows.push([...sessionCols, '', '', '', '', '', '']);
      continue;
    }

    for (const s of session.series) {
      if (s.shots.length === 0) {
        rows.push([...sessionCols, String(s.position), bool(s.isSighter), bool(s.isFinal), '', '', '']);
        continue;
      }
      for (const shot of s.shots) {
        rows.push([
          ...sessionCols,
          String(s.position),
          bool(s.isSighter),
          bool(s.isFinal),
          String(shot.position),
          String(shot.valueTenths),
          bool(shot.isInnerTen),
        ]);
      }
    }
  }

  return rows;
}

/** Serializes sessions directly to CSV text (header + RFC 4180 body). */
export function exportSessionsToCsv(sessionsExport: readonly SessionExport[]): string {
  return stringifyRows(buildCsvRows(sessionsExport));
}
