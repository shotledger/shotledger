// A web edit or delete of one session → the changes one push carries
// (docs/specs/web-session-edit-spec.md §3.1). Pure: ids, change ids and the
// clock are injected. Each write is what the phone's own edit writes (E1):
// updateSession, saveSeriesShots, addSeries, setSeriesSighter,
// deleteSeriesAndShots, addStation, updateStation, softDeleteStation,
// setSessionExtraRounds and deleteSessionAndSeries.
import {
  buildProgramSkeleton,
  getProgram,
  requireDiscipline,
  scoringModeFor,
} from '../disciplines';
import type { EntryShot } from '../scoring/entry';
import { isUnenteredStation, stationPoints, stationProblem } from '../scoring/falt-station';
import { parseSeriesText, type SeriesTextError } from '../scoring/series-text';
import type { VolumeSeries } from '../scoring/volume';
import { PUSH_BATCH_MAX, type ClientChange, type SyncTableName } from '../sync/protocol';
import { TEXT_LIMITS } from '../sync/text-limits';
import { newStationRow } from './falt-entry';
import { applyRank } from './order';
import { parseRoundsFired } from './rounds-entry';
import { newSeriesRow, newShotRow, withRoundsMoved, type Payload } from './rows';
import { blankToNull, startedAtError, type EntryDeps } from './session-entry';
import { isLiveRow, liveRowsIn, sessionRoundsOf, volumeSeriesOf } from './volume-rows';

/** The session fields the web edits (E2). */
export interface EditableSessionFields {
  name: string;
  /** UTC, in `toISOString`'s shape. */
  startedAt: string;
  location: string;
  notes: string;
  competitionName: string;
  competitionLevel: string | null;
  isChampionship: boolean;
  weaponGroup: string | null;
  shooterClass: string | null;
  eventId: string | null;
  firearmId: string | null;
  ammoLotId: string | null;
}

export interface SeriesEditDraft {
  /** A series the form opened; null for one added on the form. */
  id: string | null;
  text: string;
  /** Read in free format only; a fixed format's skeleton decides. */
  isSighter: boolean;
  deleted: boolean;
}

/** A fält station row as the form holds it (§10.4). */
export interface StationEditDraft {
  /** A station the form opened; null for one added on the form. */
  id: string | null;
  /** null only on a new row (Hits not chosen); an opened row always holds 0–6. */
  hits: number | null;
  figuresHit: number;
  figureCount: number | null;
  pointsText: string;
  pointsMaxText: string;
  isScratched: boolean;
  /** Read on a new row only (Start Shoot-off); an opened row keeps its flag (E15). */
  isShootOff: boolean;
  deleted: boolean;
}

export interface SessionEditDraft {
  sessionId: string;
  /** Only what the user changed. */
  fields: Partial<EditableSessionFields>;
  /** The main section's series as the form holds them; a series left out is not touched. */
  series: readonly SeriesEditDraft[];
  /** Every opened station plus new ones; omitted or [] when the page shows none (E13). */
  stations?: readonly StationEditDraft[];
  /** Rounds Fired as typed; read on a rounds-only session only (E17). */
  roundsFired?: string;
}

/** Freshly pulled live rows by id, payloads as the wire carries them. */
export interface EditContext {
  sessions: ReadonlyMap<string, Payload>;
  series: ReadonlyMap<string, Payload>;
  shots: ReadonlyMap<string, Payload>;
  faltStations: ReadonlyMap<string, Payload>;
  firearms: ReadonlyMap<string, Payload>;
  ammoLots: ReadonlyMap<string, Payload>;
}

export interface OpenedSeries {
  row: Payload;
  /** Live shots, by position. */
  shots: readonly Payload[];
}

/** The rows the form was filled from (E6). */
export interface OpenedSession {
  session: Payload;
  /** Every live series of the session, by id. */
  series: ReadonlyMap<string, OpenedSeries>;
  /** Every live fält station of the session: what Delete compares (R10). */
  stations: readonly Payload[];
}

/** `row` is the 1-based row of `draft.series`, or of `draft.stations` for a station error. */
export type EditError =
  | { kind: 'stale' }
  | { kind: 'gone' }
  | { kind: 'nothingToChange' }
  | { kind: 'invalidStartedAt' }
  | { kind: 'startedAtOutOfRange' }
  | { kind: 'tooLong'; field: 'name' | 'competitionName' | 'location' | 'notes'; max: number }
  | { kind: 'unknownFirearm' }
  | { kind: 'unknownAmmoLot' }
  | { kind: 'seriesText'; row: number; error: SeriesTextError }
  | { kind: 'tooManyShots'; row: number; max: number }
  | { kind: 'secondSighter'; row: number }
  | { kind: 'readOnlySeries'; row: number }
  | { kind: 'stationPoints'; row: number }
  | { kind: 'invalidStation'; row: number }
  | { kind: 'invalidRounds' }
  | { kind: 'tooManyChanges'; max: number; needed: number };

/** A firearm whose counters the push moves, and the rows that move was made for (E8). */
export interface CounterMove {
  firearmId: string;
  rows: { tableName: SyncTableName; rowId: string }[];
}

export type EditResult =
  { ok: true; changes: ClientChange[]; moved: CounterMove[] } | { ok: false; errors: EditError[] };

/** One row to write: a payload, or null for a tombstone. */
interface Write {
  tableName: SyncTableName;
  rowId: string;
  payload: Payload | null;
}

const shotsBySeries = (shots: ReadonlyMap<string, Payload>): Map<unknown, Payload[]> => {
  const bySeries = new Map<unknown, Payload[]>();
  for (const shot of liveRowsIn(shots)) {
    const bucket = bySeries.get(shot.series_id) ?? [];
    bucket.push(shot);
    bySeries.set(shot.series_id, bucket);
  }
  for (const bucket of bySeries.values()) {
    bucket.sort((a, b) => (a.position as number) - (b.position as number));
  }
  return bySeries;
};

const seriesOfSession = (context: EditContext, sessionId: string): Payload[] =>
  liveRowsIn(context.series).filter((s) => s.session_id === sessionId);

const stationsOfSession = (context: EditContext, sessionId: string): Payload[] =>
  liveRowsIn(context.faltStations).filter((s) => s.session_id === sessionId);

/** The snapshot a form opens from; null when the session is not live. */
export function openedSession(sessionId: string, context: EditContext): OpenedSession | null {
  const session = context.sessions.get(sessionId);
  if (!isLiveRow(session)) return null;
  const shots = shotsBySeries(context.shots);
  return {
    session,
    series: new Map(
      seriesOfSession(context, sessionId).map((row) => [
        row.id as string,
        { row, shots: shots.get(row.id) ?? [] },
      ]),
    ),
    stations: stationsOfSession(context, sessionId),
  };
}

/** Same columns, same values: a row another device has not written since. */
function sameRow(a: Payload, b: Payload): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && a[key] === b[key])
  );
}

const sameShots = (parsed: readonly EntryShot[], live: readonly Payload[]): boolean =>
  parsed.length === live.length &&
  parsed.every(
    (shot, i) =>
      shot.valueTenths === live[i]!.value_tenths &&
      shot.isInnerTen === (live[i]!.is_inner_ten === 1),
  );

const sameIds = (a: readonly Payload[], b: readonly Payload[]): boolean => {
  const ids = new Set(a.map((row) => row.id));
  return a.length === b.length && b.every((row) => ids.has(row.id));
};

const asNull = (value: unknown): unknown => value ?? null;

/** The session columns the draft asks for, by the phone's edit screen's rules (E2). */
function sessionColumns(
  fields: Partial<EditableSessionFields>,
  roundsFired: string | undefined,
  session: Payload,
  context: EditContext,
  now: string,
  errors: EditError[],
): Record<string, unknown> {
  const columns: Record<string, unknown> = {};
  const text = (
    field: 'name' | 'competitionName' | 'location' | 'notes',
    column: keyof typeof TEXT_LIMITS.sessions,
    value: string | null,
  ) => {
    const max = TEXT_LIMITS.sessions[column];
    if (value !== null && value.length > max) errors.push({ kind: 'tooLong', field, max });
    columns[column] = value;
  };
  if (fields.name !== undefined) {
    text('name', 'name', fields.name.trim() || (session.name as string));
  }
  if (fields.startedAt !== undefined) {
    // Only an edited date is held to the entry's range (R11).
    const error = startedAtError(fields.startedAt, now);
    if (error === null) columns.started_at = fields.startedAt;
    else if (error.kind === 'invalidStartedAt') errors.push({ kind: 'invalidStartedAt' });
    else errors.push({ kind: 'startedAtOutOfRange' });
  }
  if (fields.location !== undefined) text('location', 'location', blankToNull(fields.location));
  if (fields.notes !== undefined) text('notes', 'notes', blankToNull(fields.notes));
  // Competition fields belong to a competition; a training session never takes them.
  if (session.type === 'competition') {
    if (fields.competitionName !== undefined) {
      text('competitionName', 'competition_name', blankToNull(fields.competitionName));
    }
    if (fields.competitionLevel !== undefined) {
      columns.competition_level = fields.competitionLevel;
    }
    if (fields.isChampionship !== undefined) {
      columns.is_championship = fields.isChampionship ? 1 : 0;
    }
    if (fields.weaponGroup !== undefined) columns.weapon_group = fields.weaponGroup;
    if (fields.shooterClass !== undefined) columns.shooter_class = fields.shooterClass;
    if (fields.eventId !== undefined) columns.event_id = fields.eventId;
  }
  if (fields.firearmId !== undefined) {
    if (fields.firearmId !== null && !isLiveRow(context.firearms.get(fields.firearmId))) {
      errors.push({ kind: 'unknownFirearm' });
    }
    columns.firearm_id = fields.firearmId;
  }
  if (fields.ammoLotId !== undefined) {
    if (fields.ammoLotId !== null && !isLiveRow(context.ammoLots.get(fields.ammoLotId))) {
      errors.push({ kind: 'unknownAmmoLot' });
    }
    columns.ammo_lot_id = fields.ammoLotId;
  }
  // Rounds Fired is the phone's Extra Rounds field, shown on a rounds-only session only (E17).
  if (roundsFired !== undefined && session.kind === 'rounds') {
    const stored = asNull(session.extra_rounds) as number | null;
    // A stored count the edit leaves alone is not re-checked (R11's rule for dates).
    if (roundsFired.trim() !== (stored === null ? '' : String(stored))) {
      const parsed = parseRoundsFired(roundsFired);
      if (parsed.ok) columns.extra_rounds = parsed.rounds;
      else errors.push({ kind: 'invalidRounds' });
    }
  }
  // Only what differs from the pulled row is written.
  return Object.fromEntries(
    Object.entries(columns).filter(([column, value]) => asNull(session[column]) !== value),
  );
}

/** One draft series, read against the opened rows. */
interface PlanBase {
  /** The 1-based row of `draft.series`. */
  row: number;
  /** A sighter after the edit. */
  isSighter: boolean;
  /** An opened series the edit writes: the rows E6 compares. */
  touched: boolean;
  /** Turns a sighter on: a new sighter, or a series switched to one. */
  marksSighter: boolean;
}

type SeriesPlan =
  | (PlanBase & { kind: 'delete'; id: string })
  | (PlanBase & {
      kind: 'keep';
      id: string;
      shots: readonly EntryShot[];
      shotsChanged: boolean;
      sighterChanged: boolean;
    })
  | (PlanBase & { kind: 'new'; id: null; shots: readonly EntryShot[] });

function planSeries(
  draft: SessionEditDraft,
  opened: OpenedSession,
  context: EditContext,
  errors: EditError[],
): SeriesPlan[] {
  const plans: SeriesPlan[] = [];
  // A session edited for its fields alone needs no scoring rules.
  if (draft.series.length === 0) return plans;
  const session = opened.session;
  const discipline = requireDiscipline(session.discipline_id as string);
  const program = getProgram(session.program_id as string) ?? null;
  const fixed = program !== null && buildProgramSkeleton(program).length > 0;
  const seriesLength =
    program?.shotsPerSeries ??
    (session.series_length as number | null | undefined) ??
    discipline.defaultSeriesLength;
  const mode = scoringModeFor(discipline, program, session.decimal_scoring === 1);

  /** The row's shots, or null when an error was recorded for it. */
  const parse = (text: string, row: number): readonly EntryShot[] | null => {
    const parsed = parseSeriesText(text, mode);
    if (!parsed.ok) {
      errors.push({ kind: 'seriesText', row, error: parsed.error });
      return null;
    }
    if (parsed.shots.length > seriesLength) {
      errors.push({ kind: 'tooManyShots', row, max: seriesLength });
    }
    return parsed.shots;
  };

  draft.series.forEach((series, index) => {
    const row = index + 1;
    const { id } = series;
    if (id === null) {
      // A new row deleted again writes nothing, whatever its text.
      if (series.deleted) return;
      const shots = parse(series.text, row);
      // A blank new row writes nothing.
      if (shots === null || shots.length === 0) return;
      const isSighter = !fixed && series.isSighter;
      plans.push({
        kind: 'new',
        id,
        row,
        shots,
        isSighter,
        touched: false,
        marksSighter: isSighter,
      });
      return;
    }
    const was = opened.series.get(id);
    if (was === undefined) throw new RangeError(`series ${id} is not one the form opened`);
    if (was.row.is_final === 1 || was.row.is_total_override === 1) {
      errors.push({ kind: 'readOnlySeries', row });
      return;
    }
    if (series.deleted) {
      plans.push({ kind: 'delete', id, row, isSighter: false, touched: true, marksSighter: false });
      return;
    }
    const shots = parse(series.text, row);
    if (shots === null) return;
    const wasSighter = was.row.is_sighter === 1;
    const isSighter = fixed ? wasSighter : series.isSighter;
    const shotsChanged = !sameShots(shots, was.shots);
    const sighterChanged = isSighter !== wasSighter;
    plans.push({
      kind: 'keep',
      id,
      row,
      shots,
      shotsChanged,
      isSighter,
      sighterChanged,
      touched: shotsChanged || sighterChanged,
      marksSighter: isSighter && sighterChanged,
    });
  });

  // In a fixed format nothing marks a sighter, so this passes there.
  checkSighters(plans, seriesOfSession(context, opened.session.id as string), errors);
  return plans;
}

/** One sighter in the main section, as addSeries and setSeriesSighter allow (§6.3). */
function checkSighters(plans: SeriesPlan[], fresh: readonly Payload[], errors: EditError[]): void {
  // A new series has no id, and no pulled series has a null one.
  const byId = new Map(plans.map((plan) => [plan.id, plan]));
  let sighters = plans.filter((plan) => plan.id === null && plan.isSighter).length;
  // Counted over the fresh pull: a series the edit does not write keeps the
  // flag it has now, which another device may have set since the form opened.
  for (const row of fresh) {
    if (row.is_final === 1) continue;
    const plan = byId.get(row.id as string);
    if (plan?.touched ? plan.isSighter : row.is_sighter === 1) sighters += 1;
  }
  if (sighters <= 1) return;
  for (const plan of plans) {
    if (plan.marksSighter) errors.push({ kind: 'secondSighter', row: plan.row });
  }
}

/** The `updateStation` columns of a station; the rest of its row is kept (E15). */
interface StationColumns {
  hits: number;
  figures_hit: number;
  figure_count: number | null;
  points: number | null;
  points_max: number | null;
  is_scratched: number;
}

type StationPlan =
  | { kind: 'delete'; id: string }
  | { kind: 'keep'; id: string; columns: StationColumns; changed: boolean }
  | { kind: 'new'; columns: StationColumns; isShootOff: boolean };

const asText = (value: unknown): string => (value == null ? '' : String(Number(value)));

/** The draft row is the stored station exactly as the form opened it. */
const asOpened = (station: StationEditDraft, was: Payload): boolean =>
  station.hits === was.hits &&
  station.figuresHit === was.figures_hit &&
  station.figureCount === asNull(was.figure_count) &&
  station.pointsText === asText(was.points) &&
  station.pointsMaxText === asText(was.points_max) &&
  station.isScratched === (was.is_scratched === 1);

/** The draft's stations as the phone's station screen would save them (E13, E15). */
function planStations(
  draft: SessionEditDraft,
  opened: OpenedSession,
  errors: EditError[],
): StationPlan[] {
  const plans: StationPlan[] = [];
  const stations = draft.stations ?? [];
  if (stations.length === 0) return plans;
  const disciplineId = opened.session.discipline_id as string;
  if (requireDiscipline(disciplineId).scoring !== 'hits') {
    throw new RangeError(`${disciplineId} is not scored in hits`);
  }
  const openedById = new Map(opened.stations.map((row) => [row.id as string, row]));
  stations.forEach((station, index) => {
    const row = index + 1;
    const { id } = station;
    const was = id === null ? undefined : openedById.get(id);
    if (id !== null && was === undefined) {
      throw new RangeError(`station ${id} is not one the form opened`);
    }
    if (station.deleted) {
      // A new row removed again writes nothing.
      if (id !== null) plans.push({ kind: 'delete', id });
      return;
    }
    // A stored station left as opened is not re-checked, so data the phone
    // stored unchecked (an import) never blocks an edit of something else (R11's rule).
    if (was !== undefined && asOpened(station, was)) return;
    const points = stationPoints(station.pointsText, station.pointsMaxText);
    if (!points.ok) {
      errors.push({ kind: 'stationPoints', row });
      return;
    }
    const entered = {
      figureCount: station.figureCount,
      points: points.points,
      isScratched: station.isScratched,
    };
    // A new row with nothing entered is the phone's station screen backed out
    // of, a started shoot-off included: nothing is saved (#713 R8).
    if (id === null && isUnenteredStation({ ...entered, hits: station.hits, isShootOff: false })) {
      return;
    }
    // An opened station always holds hits: the phone's screen has no unset state.
    if (id !== null && station.hits === null) {
      errors.push({ kind: 'invalidStation', row });
      return;
    }
    const hits = station.hits ?? 0;
    const enterable = {
      position: was === undefined ? row : (was.position as number),
      hits,
      figuresHit: station.figuresHit,
      figureCount: station.figureCount,
      points: points.points,
      pointsMax: points.pointsMax,
      isScratched: station.isScratched,
    };
    if (stationProblem(enterable) !== null) {
      errors.push({ kind: 'invalidStation', row });
      return;
    }
    const columns: StationColumns = {
      hits,
      figures_hit: station.figuresHit,
      figure_count: station.figureCount,
      points: points.points,
      points_max: points.pointsMax,
      is_scratched: station.isScratched ? 1 : 0,
    };
    if (was === undefined) {
      plans.push({ kind: 'new', columns, isShootOff: station.isShootOff });
      return;
    }
    const changed = (Object.keys(columns) as (keyof StationColumns)[]).some(
      (column) => asNull(was[column]) !== columns[column],
    );
    plans.push({ kind: 'keep', id: id!, columns, changed });
  });
  return plans;
}

/**
 * A draft that writes any station needs the session's whole live station set
 * unchanged since the form opened: a new station's position and shoot-off
 * flag are read from all of them (E20).
 */
function areStationsStale(
  plans: readonly StationPlan[],
  opened: OpenedSession,
  context: EditContext,
): boolean {
  const writes = plans.some((plan) => plan.kind !== 'keep' || plan.changed);
  return (
    writes && !sameRows(opened.stations, stationsOfSession(context, opened.session.id as string))
  );
}

/** A touched series another device wrote since the form opened (E6). */
function isStale(plans: SeriesPlan[], opened: OpenedSession, context: EditContext): boolean {
  if (!sameRow(opened.session, context.sessions.get(opened.session.id as string)!)) return true;
  const shots = shotsBySeries(context.shots);
  return plans
    .filter((plan): plan is Exclude<SeriesPlan, { kind: 'new' }> => plan.touched)
    .some((plan) => {
      const was = opened.series.get(plan.id)!;
      const now = context.series.get(plan.id);
      return (
        !isLiveRow(now) || !sameRow(was.row, now) || !sameIds(was.shots, shots.get(plan.id) ?? [])
      );
    });
}

const tombstone = (tableName: SyncTableName, row: Payload): Write => ({
  tableName,
  rowId: row.id as string,
  payload: null,
});

/**
 * The firearm writes for the given moves (E4), summed per firearm: one
 * floored move each, none for a firearm that is not live or a net move of 0.
 */
function firearmWrites(
  context: EditContext,
  moves: [string | null, number][],
  now: string,
): Write[] {
  const delta = new Map<string, number>();
  for (const [firearmId, rounds] of moves) {
    if (firearmId !== null && isLiveRow(context.firearms.get(firearmId))) {
      delta.set(firearmId, (delta.get(firearmId) ?? 0) + rounds);
    }
  }
  const writes: Write[] = [];
  for (const [firearmId, rounds] of delta) {
    const payload = withRoundsMoved(context.firearms.get(firearmId)!, rounds, now);
    if (payload !== null) writes.push({ tableName: 'firearms', rowId: firearmId, payload });
  }
  return writes;
}

/** The writes as one push, in APPLY_ORDER, or why not (E7). */
function finish(writes: Write[], deps: EntryDeps, now: string): EditResult {
  if (writes.length === 0) return { ok: false, errors: [{ kind: 'nothingToChange' }] };
  if (writes.length > PUSH_BATCH_MAX) {
    return {
      ok: false,
      errors: [{ kind: 'tooManyChanges', max: PUSH_BATCH_MAX, needed: writes.length }],
    };
  }
  const ordered = [...writes].sort((a, b) => applyRank(a.tableName) - applyRank(b.tableName));
  const changes: ClientChange[] = ordered.map((write) => ({
    clientChangeId: deps.newChangeId(),
    tableName: write.tableName,
    rowId: write.rowId,
    payload: write.payload,
    deletedAt: write.payload === null ? now : null,
    updatedAt: now,
  }));
  const rows = changes
    .filter((change) => change.tableName !== 'firearms')
    .map(({ tableName, rowId }) => ({ tableName, rowId }));
  const moved = changes
    .filter((change) => change.tableName === 'firearms')
    .map((change) => ({ firearmId: change.rowId, rows }));
  return { ok: true, changes, moved };
}

const volumeOf = (session: Payload, series: VolumeSeries[], context: EditContext): number =>
  sessionRoundsOf(session, series, stationsOfSession(context, session.id as string).length);

/** The session's live series as volume sees them, from the pulled rows. */
function volumeBefore(session: Payload, context: EditContext): Map<string, VolumeSeries> {
  const shots = shotsBySeries(context.shots);
  return new Map(
    seriesOfSession(context, session.id as string).map((row) => [
      row.id as string,
      volumeSeriesOf(row, (shots.get(row.id) ?? []).length),
    ]),
  );
}

export function buildSessionEdit(
  draft: SessionEditDraft,
  opened: OpenedSession,
  context: EditContext,
  deps: EntryDeps,
): EditResult {
  if (opened.session.id !== draft.sessionId) {
    throw new RangeError(`the form opened ${String(opened.session.id)}, not ${draft.sessionId}`);
  }
  const session = context.sessions.get(draft.sessionId);
  if (!isLiveRow(session)) return { ok: false, errors: [{ kind: 'gone' }] };

  const now = deps.now();
  const errors: EditError[] = [];
  const columns = sessionColumns(draft.fields, draft.roundsFired, session, context, now, errors);
  const plans = planSeries(draft, opened, context, errors);
  const stationPlans = planStations(draft, opened, errors);
  if (errors.length > 0) return { ok: false, errors };
  if (isStale(plans, opened, context) || areStationsStale(stationPlans, opened, context)) {
    return { ok: false, errors: [{ kind: 'stale' }] };
  }

  const writes: Write[] = [];
  if (Object.keys(columns).length > 0) {
    writes.push({
      tableName: 'sessions',
      rowId: draft.sessionId,
      payload: { ...session, ...columns, updated_at: now },
    });
  }

  const shots = shotsBySeries(context.shots);
  const volumes = volumeBefore(session, context);
  const before = volumeOf(session, [...volumes.values()], context);
  let position = Math.max(
    0,
    ...seriesOfSession(context, draft.sessionId).map((s) => s.position as number),
  );
  const addShots = (seriesId: string, entered: readonly EntryShot[]) =>
    entered.forEach((shot, index) => {
      const id = deps.newId();
      writes.push({
        tableName: 'shots',
        rowId: id,
        payload: newShotRow(id, now, { seriesId, position: index + 1, ...shot }),
      });
    });

  for (const plan of plans) {
    if (plan.kind === 'new') {
      const id = deps.newId();
      position += 1;
      writes.push({
        tableName: 'series',
        rowId: id,
        payload: newSeriesRow(id, now, {
          sessionId: draft.sessionId,
          position,
          isSighter: plan.isSighter,
        }),
      });
      addShots(id, plan.shots);
      volumes.set(id, volumeSeriesOf({}, plan.shots.length));
      continue;
    }
    const live = shots.get(plan.id) ?? [];
    if (plan.kind === 'delete') {
      writes.push(tombstone('series', context.series.get(plan.id)!));
      for (const shot of live) writes.push(tombstone('shots', shot));
      volumes.delete(plan.id);
      continue;
    }
    if (plan.sighterChanged) {
      writes.push({
        tableName: 'series',
        rowId: plan.id,
        payload: {
          ...context.series.get(plan.id)!,
          is_sighter: plan.isSighter ? 1 : 0,
          updated_at: now,
        },
      });
    }
    if (plan.shotsChanged) {
      for (const shot of live) writes.push(tombstone('shots', shot));
      addShots(plan.id, plan.shots);
      volumes.set(plan.id, volumeSeriesOf(context.series.get(plan.id)!, plan.shots.length));
    }
  }

  const fresh = [...stationsOfSession(context, draft.sessionId)].sort(
    (a, b) => (a.position as number) - (b.position as number),
  );
  const freshById = new Map(fresh.map((row) => [row.id as string, row]));
  const removed = new Set(
    stationPlans.filter((plan) => plan.kind === 'delete').map((plan) => plan.id),
  );
  // Positions are never rewritten; a new station goes after the last live one (E14).
  let stationPosition = Math.max(0, ...fresh.map((row) => row.position as number));
  // The phone's nextStationIsShootOff over the kept stations: the last one decides (E15).
  let shootOff = fresh.filter((row) => !removed.has(row.id as string)).at(-1)?.is_shoot_off === 1;
  let stationCount = fresh.length;
  for (const plan of stationPlans) {
    if (plan.kind === 'delete') {
      writes.push(tombstone('falt_stations', freshById.get(plan.id)!));
      stationCount -= 1;
    } else if (plan.kind === 'keep') {
      if (plan.changed) {
        writes.push({
          tableName: 'falt_stations',
          rowId: plan.id,
          payload: { ...freshById.get(plan.id)!, ...plan.columns, updated_at: now },
        });
      }
    } else {
      const id = deps.newId();
      stationPosition += 1;
      shootOff ||= plan.isShootOff;
      writes.push({
        tableName: 'falt_stations',
        rowId: id,
        payload: newStationRow(id, now, {
          sessionId: draft.sessionId,
          position: stationPosition,
          hits: plan.columns.hits,
          figuresHit: plan.columns.figures_hit,
          figureCount: plan.columns.figure_count,
          points: plan.columns.points,
          pointsMax: plan.columns.points_max,
          isScratched: plan.columns.is_scratched === 1,
          isShootOff: shootOff,
        }),
      });
      stationCount += 1;
    }
  }

  // Six rounds per station and the extra rounds as written: E19's volumes.
  const after = sessionRoundsOf({ ...session, ...columns }, [...volumes.values()], stationCount);
  const from = asNull(session.firearm_id) as string | null;
  const to = 'firearm_id' in columns ? (columns.firearm_id as string | null) : from;
  // The same firearm on both sides nets to one move of after − before (E4).
  const moves: [string | null, number][] = [
    [from, -before],
    [to, after],
  ];
  return finish([...firearmWrites(context, moves, now), ...writes], deps, now);
}

/** Same rows by id, each with the same columns and values. */
function sameRows(a: readonly Payload[], b: readonly Payload[]): boolean {
  const byId = new Map(b.map((row) => [row.id, row]));
  return (
    a.length === b.length &&
    a.every((row) => {
      const other = byId.get(row.id);
      return other !== undefined && sameRow(row, other);
    })
  );
}

/**
 * Anything Delete would remove that changed since the page opened (R10): the
 * session row, any live series (its row, its live shot ids, one added or
 * removed) and any live fält station.
 */
function isDeleteStale(opened: OpenedSession, context: EditContext): boolean {
  const sessionId = opened.session.id as string;
  if (!sameRow(opened.session, context.sessions.get(sessionId)!)) return true;
  const was = [...opened.series.values()];
  const wasRows = was.map((s) => s.row);
  if (!sameRows(wasRows, seriesOfSession(context, sessionId))) return true;
  const shots = shotsBySeries(context.shots);
  if (was.some((s) => !sameIds(s.shots, shots.get(s.row.id) ?? []))) return true;
  return !sameRows(opened.stations, stationsOfSession(context, sessionId));
}

/** Delete as deleteSessionAndSeries (E5): tombstones and the counter moved back. */
export function buildSessionDelete(
  opened: OpenedSession,
  context: EditContext,
  deps: EntryDeps,
): EditResult {
  const sessionId = opened.session.id as string;
  const session = context.sessions.get(sessionId);
  if (!isLiveRow(session)) return { ok: false, errors: [{ kind: 'gone' }] };
  if (isDeleteStale(opened, context)) return { ok: false, errors: [{ kind: 'stale' }] };
  const now = deps.now();
  const shots = shotsBySeries(context.shots);
  const series = seriesOfSession(context, sessionId);
  const writes: Write[] = [tombstone('sessions', session)];
  for (const row of series) {
    writes.push(tombstone('series', row));
    for (const shot of shots.get(row.id) ?? []) writes.push(tombstone('shots', shot));
  }
  for (const station of stationsOfSession(context, sessionId)) {
    writes.push(tombstone('falt_stations', station));
  }
  const rounds = volumeOf(session, [...volumeBefore(session, context).values()], context);
  const firearm = asNull(session.firearm_id) as string | null;
  return finish([...firearmWrites(context, [[firearm, -rounds]], now), ...writes], deps, now);
}
