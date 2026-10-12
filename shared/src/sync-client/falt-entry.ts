// A fält session typed on the web → the changes one push carries
// (docs/specs/web-falt-entry-spec.md §3.2). Pure: ids, change ids and the
// clock are injected. The session is the phone's new-session form with fält
// chosen; each station is what the phone's station screen saves.
import { requireDiscipline } from '../disciplines';
import type { FaltResultMode } from '../scoring/falt';
import { isUnenteredStation, stationPoints, stationProblem } from '../scoring/falt-station';
import { sessionVolume } from '../scoring/volume';
import { PUSH_BATCH_MAX, type ClientChange, type SyncTableName } from '../sync/protocol';
import { TEXT_LIMITS } from '../sync/text-limits';
import { newSessionRow, withRoundsAdded, type Payload } from './rows';
import {
  blankToNull,
  checkLength,
  isUtcIsoTimestamp,
  weaponGroupFor,
  type EntryContext,
  type EntryDeps,
  type EntryError,
  type SessionEntryDraft,
} from './session-entry';

export interface StationDraft {
  /** null: Hits not chosen. 0 chosen is a station where every shot missed (R8). */
  hits: number | null;
  figuresHit: number;
  figureCount: number | null;
  pointsText: string;
  pointsMaxText: string;
  isScratched: boolean;
  isShootOff: boolean;
}

export type FaltEntryDraft = Omit<
  SessionEntryDraft,
  'programId' | 'decimalScoring' | 'seriesLength' | 'series'
> & {
  faltResultMode: FaltResultMode;
  stations: readonly StationDraft[];
};

export interface StationFields {
  sessionId: string;
  position: number;
  hits: number;
  figuresHit: number;
  figureCount: number | null;
  points: number | null;
  pointsMax: number | null;
  isScratched: boolean;
  isShootOff: boolean;
}

/** Every `falt_stations` column, with the values the phone's addStation writes. */
export function newStationRow(id: string, now: string, fields: StationFields): Payload {
  return {
    id,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    session_id: fields.sessionId,
    position: fields.position,
    hits: fields.hits,
    figures_hit: fields.figuresHit,
    figure_count: fields.figureCount,
    points: fields.points,
    points_max: fields.pointsMax,
    is_scratched: fields.isScratched ? 1 : 0,
    is_shoot_off: fields.isShootOff ? 1 : 0,
    photo_uri: null,
    note: null,
  };
}

export type FaltEntryResult =
  { ok: true; sessionId: string; changes: ClientChange[] } | { ok: false; errors: EntryError[] };

type KeptStation = Omit<StationFields, 'sessionId' | 'position'>;

/**
 * The stations the phone would have saved: points as its screen parses them,
 * ones with nothing entered never created, the rest numbered 1..n and possible (C2, C3, R8).
 */
function keptStations(stations: readonly StationDraft[], errors: EntryError[]): KeptStation[] {
  const kept: KeptStation[] = [];
  stations.forEach((draft, index) => {
    const row = index + 1;
    const points = stationPoints(draft.pointsText, draft.pointsMaxText);
    if (!points.ok) {
      errors.push({ kind: 'stationPoints', row });
      return;
    }
    const entered: KeptStation = {
      hits: draft.hits ?? 0,
      figuresHit: draft.figuresHit,
      figureCount: draft.figureCount,
      points: points.points,
      pointsMax: points.pointsMax,
      isScratched: draft.isScratched,
      isShootOff: draft.isShootOff,
    };
    if (isUnenteredStation({ ...entered, hits: draft.hits })) return;
    if (stationProblem({ position: row, ...entered }) !== null) {
      errors.push({ kind: 'invalidStation', row });
      return;
    }
    kept.push(entered);
  });
  return kept;
}

export function buildFaltEntry(
  draft: FaltEntryDraft,
  context: EntryContext,
  deps: EntryDeps,
): FaltEntryResult {
  const discipline = requireDiscipline(draft.disciplineId);
  if (discipline.scoring !== 'hits') {
    throw new RangeError(`${draft.disciplineId} is not scored in hits`);
  }

  const errors: EntryError[] = [];
  const isCompetition = draft.type === 'competition';
  const name = draft.name.trim() === '' ? draft.defaultName : draft.name.trim();
  const competitionName = isCompetition ? blankToNull(draft.competitionName) : null;
  const location = blankToNull(draft.location);
  checkLength(errors, 'name', name, TEXT_LIMITS.sessions.name);
  checkLength(errors, 'competitionName', competitionName, TEXT_LIMITS.sessions.competition_name);
  checkLength(errors, 'location', location, TEXT_LIMITS.sessions.location);

  const kept = keptStations(draft.stations, errors);

  let pulledFirearm: Payload | undefined;
  if (draft.firearmId !== null) {
    pulledFirearm = context.firearms.get(draft.firearmId);
    if (pulledFirearm === undefined) errors.push({ kind: 'unknownFirearm' });
  }
  if (draft.ammoLotId !== null && !context.ammoLots.has(draft.ammoLotId)) {
    errors.push({ kind: 'unknownAmmoLot' });
  }
  if (!isUtcIsoTimestamp(draft.startedAt)) errors.push({ kind: 'invalidStartedAt' });
  if (errors.length > 0) return { ok: false, errors };

  const now = deps.now();
  const changes: ClientChange[] = [];
  const add = (tableName: SyncTableName, payload: Payload) =>
    changes.push({
      clientChangeId: deps.newChangeId(),
      tableName,
      rowId: payload.id as string,
      payload,
      deletedAt: null,
      updatedAt: now,
    });

  // Six rounds per station, scratched and shoot-off ones included (C4).
  const rounds = sessionVolume({
    series: [],
    extraRounds: null,
    stationCount: kept.length,
    seriesLength: discipline.defaultSeriesLength,
  });
  const firearmRow = pulledFirearm ? withRoundsAdded(pulledFirearm, rounds, now) : null;
  if (firearmRow) add('firearms', firearmRow);

  const sessionId = deps.newId();
  add('sessions', {
    ...newSessionRow(sessionId, now, {
      name,
      type: draft.type,
      disciplineId: draft.disciplineId,
      // Fält has no program, no decimal mode and no series length (C5).
      programId: null,
      competitionLevel: isCompetition ? draft.competitionLevel : null,
      isChampionship: isCompetition && draft.isChampionship,
      competitionName,
      weaponGroup: weaponGroupFor(draft, context),
      shooterClass: isCompetition ? draft.shooterClass : null,
      eventId: isCompetition ? draft.eventId : null,
      firearmId: draft.firearmId,
      ammoLotId: draft.ammoLotId,
      startedAt: draft.startedAt,
      location,
      decimalScoring: false,
      seriesLength: null,
    }),
    falt_result_mode: draft.faltResultMode,
  });

  kept.forEach((station, index) => {
    add(
      'falt_stations',
      newStationRow(deps.newId(), now, { sessionId, position: index + 1, ...station }),
    );
  });

  if (changes.length > PUSH_BATCH_MAX) {
    return { ok: false, errors: [{ kind: 'tooManyChanges', max: PUSH_BATCH_MAX }] };
  }
  return { ok: true, sessionId, changes };
}
