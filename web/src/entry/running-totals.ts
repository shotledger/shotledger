// What Enter Series shows while a session is typed (#822 direction A), the
// web twin of the phone's series entry and New Session:
//
// - preselection: the phone's NewSessionScreen preselects the last session's
//   discipline and firearm through lastSessionDefaults over listSessions and
//   listActiveFirearms; this reads the same from the pulled rows.
// - the running session total: the phone's liveSessionTotals
//   (app/src/features/session-entry/series-entry-model.ts) — sessionResults
//   and sessionInnerTenCount over the series as they stand.
// - last time: the phone's loadLastTime (app/src/features/session-entry/
//   last-time.ts), with the matching rules shared in
//   shared/src/session-entry/last-time.ts.
import {
  lastSessionDefaults,
  type LastSessionDefaults,
  type PastSession,
} from '@shotledger/shared/src/disciplines/last-session-defaults';
import { REGULATIONS } from '@shotledger/shared/src/regulations/registry';
import type { EntryShot } from '@shotledger/shared/src/scoring/entry';
import { sessionInnerTenCount, sessionResults } from '@shotledger/shared/src/scoring/totals';
import {
  previousSessionOf,
  scoredOrdinal,
  seriesAtOrdinal,
  type LastTimeSeries,
} from '@shotledger/shared/src/session-entry/last-time';

import { pickableFirearms } from '../firearms/active';

type Rows = ReadonlyMap<string, Record<string, unknown>>;

const isLive = (row: Record<string, unknown>) =>
  row.deleted_at === null || row.deleted_at === undefined;

/** The live sessions as lastSessionDefaults reads them. */
function pastSessions(sessions: Rows): PastSession[] {
  return [...sessions.values()].filter(isLive).map((row) => ({
    disciplineId: String(row.discipline_id),
    firearmId: typeof row.firearm_id === 'string' ? row.firearm_id : null,
    startedAt: String(row.started_at),
  }));
}

/**
 * The discipline and firearm a new entry starts on. `justSaved` is the
 * session a Save has just pushed, which the pulled rows may not hold yet.
 */
export function preselection(
  sessions: Rows,
  firearms: Rows,
  justSaved?: PastSession,
): LastSessionDefaults | null {
  const pickable = pickableFirearms(firearms);
  return lastSessionDefaults([...pastSessions(sessions), ...(justSaved ? [justSaved] : [])], {
    regulationIds: REGULATIONS.map((regulation) => regulation.id),
    isFirearmPickable: (id) => pickable.has(id),
  });
}

/** One typed row: its shots, or null while its text does not parse. */
export interface TypedSeries {
  isSighter: boolean;
  isFinal: boolean;
  shots: readonly EntryShot[] | null;
}

/** The session's total and inner tens over the rows as typed; a row that does not parse adds nothing. */
export function runningTotals(rows: readonly TypedSeries[]): {
  totalTenths: number;
  innerTens: number;
} {
  const list = rows.map((row) => ({
    isSighter: row.isSighter,
    isFinal: row.isFinal,
    shots: [...(row.shots ?? [])],
    totalOverride: null,
  }));
  return {
    totalTenths: sessionResults(list).totalTenths,
    innerTens: sessionInnerTenCount(list),
  };
}

export interface LastTime {
  totalTenths: number;
  innerTens: number | null;
}

/** The previous session's series, as the phone's loadLastTime reads them. */
function seriesOf(sessionId: string, series: Rows, shots: Rows): Map<number, LastTimeSeries> {
  const shotsBySeries = new Map<string, Record<string, unknown>[]>();
  for (const shot of shots.values()) {
    if (!isLive(shot)) continue;
    const id = String(shot.series_id);
    shotsBySeries.set(id, [...(shotsBySeries.get(id) ?? []), shot]);
  }
  const out = new Map<number, LastTimeSeries>();
  for (const row of series.values()) {
    if (!isLive(row) || row.session_id !== sessionId) continue;
    const own = shotsBySeries.get(String(row.id)) ?? [];
    const isOverride = row.is_total_override === 1 && typeof row.total_override_tenths === 'number';
    // A series saved with no shots scored nothing to compare.
    if (!isOverride && own.length === 0) continue;
    const position = Number(row.position);
    out.set(position, {
      position,
      isSighter: row.is_sighter === 1,
      isFinal: row.is_final === 1,
      totalTenths: isOverride
        ? (row.total_override_tenths as number)
        : own.reduce((sum, shot) => sum + Number(shot.value_tenths), 0),
      innerTens: isOverride ? null : own.filter((shot) => shot.is_inner_ten === 1).length,
    });
  }
  return out;
}

/**
 * "Last time" for each typed row, in order: the same scored series of the
 * previous session of this discipline and scoring mode before `startedAt`.
 * Null for a sighter, or where there is nothing to compare.
 */
export function lastTimes(
  tables: { sessions: Rows; series: Rows; shots: Rows },
  current: { disciplineId: string; startedAt: string | null; decimalScoring: boolean },
  rows: readonly Pick<TypedSeries, 'isSighter' | 'isFinal'>[],
): (LastTime | null)[] {
  const none = rows.map(() => null);
  if (current.startedAt === null) return none;
  const candidates = [...tables.sessions.values()]
    .filter((row) => isLive(row) && row.kind !== 'rounds')
    .map((row) => ({
      id: String(row.id),
      disciplineId: String(row.discipline_id),
      startedAt: String(row.started_at),
      decimalScoring: row.decimal_scoring === 1,
    }));
  const previous = previousSessionOf(candidates, {
    id: '',
    disciplineId: current.disciplineId,
    startedAt: current.startedAt,
    decimalScoring: current.decimalScoring,
  });
  if (previous === null) return none;

  const byPosition = seriesOf(previous.id, tables.series, tables.shots);
  // Every series, blanks included, so the ordinal counts as the phone's does.
  const all = [...tables.series.values()]
    .filter((row) => isLive(row) && row.session_id === previous.id)
    .map((row) => ({
      position: Number(row.position),
      isSighter: row.is_sighter === 1,
      isFinal: row.is_final === 1,
      // A shoot-off takes no ordinal, as on the phone (#727 PR C, S2).
      isShootOff: row.is_shoot_off === 1,
      totalTenths: 0,
      innerTens: null,
    }));
  const positioned = rows.map((row, index) => ({ ...row, position: index + 1 }));
  return positioned.map((row) => {
    const ordinal = scoredOrdinal(
      positioned.filter((other) => other.position !== row.position),
      row,
    );
    const match = seriesAtOrdinal(all, ordinal, row.isFinal);
    const found = match ? byPosition.get(match.position) : undefined;
    return found ? { totalTenths: found.totalTenths, innerTens: found.innerTens } : null;
  });
}
