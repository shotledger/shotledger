// A typed web entry → the changes one push carries
// (docs/specs/web-series-entry-spec.md §3.3). Pure: ids, change ids and the
// clock are injected. Every rule mirrors the phone's new-session form and
// series entry; the scoring values come from `pressKey` via parseSeriesText.
import {
  buildProgramSkeleton,
  decimalAllowed,
  getProgram,
  requireDiscipline,
  scoringModeFor,
  type Program,
} from '../disciplines';
import { derivedWeaponGroup } from '../disciplines/session-defaults';
import type { EntryShot } from '../scoring/entry';
import { parseSeriesText, type SeriesTextError } from '../scoring/series-text';
import { sessionVolume } from '../scoring/volume';
import { PUSH_BATCH_MAX, type ClientChange, type SyncTableName } from '../sync/protocol';
import { TEXT_LIMITS } from '../sync/text-limits';
import { toSyncPhotoUri } from './photo-uri';
import {
  newSeriesRow,
  newSessionRow,
  newShotRow,
  withRoundsAdded,
  type Payload,
  type SessionFields,
} from './rows';

export interface SeriesDraft {
  text: string;
  /** Read in free format only; a fixed format's skeleton decides. */
  isSighter: boolean;
  /** A final series (docs/specs/web-rounds-final-spec.md C3); absent is the main round. */
  isFinal?: boolean;
  /** A photo goes with this row (docs/specs/web-entry-photo-spec.md C6). */
  hasPhoto?: boolean;
  /**
   * The id of this row's photo when it is already on the server from a save
   * that never pushed (spec R7); the series takes it as its id. Absent: a new id.
   */
  photoId?: string;
}

export interface SessionEntryDraft {
  type: 'training' | 'competition';
  disciplineId: string;
  programId: string | null;
  /** UTC, in `toISOString`'s shape (`isUtcIsoTimestamp`). */
  startedAt: string;
  name: string;
  /** Used when `name` is blank, as the phone does. */
  defaultName: string;
  location: string;
  competitionLevel: string | null;
  isChampionship: boolean;
  competitionName: string;
  weaponGroup: string | null;
  shooterClass: string | null;
  eventId: string | null;
  firearmId: string | null;
  ammoLotId: string | null;
  decimalScoring: boolean;
  /** The chosen shots per series; null for the discipline's default. */
  seriesLength: number | null;
  series: readonly SeriesDraft[];
}

/** Live pulled rows, payloads as the wire carries them. */
export interface EntryContext {
  firearms: ReadonlyMap<string, Payload>;
  firearmGroups: Iterable<Payload>;
  ammoLots: ReadonlyMap<string, Payload>;
}

export interface EntryDeps {
  newId: () => string;
  newChangeId: () => string;
  now: () => string;
}

/** `row` is the 1-based row on the form, not the stored position. */
export type EntryError =
  | { kind: 'hitsDiscipline' }
  /** `tag`: a tag name (entry-tags.ts). */
  | { kind: 'tooLong'; field: 'name' | 'competitionName' | 'location' | 'tag'; max: number }
  | { kind: 'series'; row: number; error: SeriesTextError }
  | { kind: 'tooManyShots'; row: number; max: number }
  | { kind: 'secondSighter'; row: number }
  | { kind: 'finalWithoutMain' }
  | { kind: 'unknownFirearm' }
  | { kind: 'unknownAmmoLot' }
  | { kind: 'invalidStartedAt' }
  | { kind: 'invalidRounds' }
  | { kind: 'tooManyChanges'; max: number }
  // Fält stations (falt-entry.ts): points that do not parse, or an impossible station.
  | { kind: 'stationPoints'; row: number }
  | { kind: 'invalidStation'; row: number };

/** A series that names a photo: its 1-based form row, and the photo id (its series id). */
export interface SeriesPhoto {
  row: number;
  photoId: string;
}

export type EntryResult =
  | { ok: true; sessionId: string; changes: ClientChange[]; photos: SeriesPhoto[] }
  | { ok: false; errors: EntryError[] };

interface KeptSeries {
  isSighter: boolean;
  isFinal: boolean;
  shots: EntryShot[];
  /** The 1-based form row, when the row has a photo. */
  photoRow: number | null;
  /** An uploaded photo's id to reuse as the series id (R7). */
  photoId: string | undefined;
}

export const blankToNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export function checkLength(
  errors: EntryError[],
  field: 'name' | 'competitionName' | 'location',
  value: string | null,
  max: number,
): void {
  if (value !== null && value.length > max) errors.push({ kind: 'tooLong', field, max });
}

/**
 * `YYYY-MM-DDTHH:mm:ss.sssZ`, exactly what `toISOString` writes for a
 * four-digit year: the web's `startedAtIso` and the phone's session form both
 * write that, and `started_at` is compared as a string. Spec R28.
 */
export function isUtcIsoTimestamp(value: string): boolean {
  const time = Date.parse(value);
  return value.length === 24 && !Number.isNaN(time) && new Date(time).toISOString() === value;
}

export function weaponGroupFor(
  draft: Pick<SessionEntryDraft, 'type' | 'firearmId' | 'weaponGroup'>,
  context: EntryContext,
): string | null {
  if (draft.type === 'competition') return draft.weaponGroup;
  // No firearm matches no rows, and derives nothing.
  const links = [...context.firearmGroups]
    .filter((row) => row.firearm_id === draft.firearmId)
    .map((row) => ({
      groupId: row.group_id as string,
      isDefaultForGroup: row.is_default_for_group as number,
    }));
  return derivedWeaponGroup(links) ?? draft.weaponGroup;
}

export function buildSessionEntry(
  draft: SessionEntryDraft,
  context: EntryContext,
  deps: EntryDeps,
): EntryResult {
  const discipline = requireDiscipline(draft.disciplineId);
  if (discipline.scoring === 'hits') return { ok: false, errors: [{ kind: 'hitsDiscipline' }] };

  let program: Program | null = null;
  if (draft.programId !== null) {
    const found = getProgram(draft.programId);
    if (!found || found.disciplineId !== draft.disciplineId) {
      throw new RangeError(`program ${draft.programId} is not one of ${draft.disciplineId}`);
    }
    program = found;
  }
  const chosenLength = draft.seriesLength;
  if (chosenLength !== null && (!Number.isInteger(chosenLength) || chosenLength < 1)) {
    throw new RangeError(`seriesLength must be a positive integer, got ${chosenLength}`);
  }

  const errors: EntryError[] = [];
  const isCompetition = draft.type === 'competition';
  const name = draft.name.trim() === '' ? draft.defaultName : draft.name.trim();
  const competitionName = isCompetition ? blankToNull(draft.competitionName) : null;
  const location = blankToNull(draft.location);
  checkLength(errors, 'name', name, TEXT_LIMITS.sessions.name);
  checkLength(errors, 'competitionName', competitionName, TEXT_LIMITS.sessions.competition_name);
  checkLength(errors, 'location', location, TEXT_LIMITS.sessions.location);

  // The order of the app's resolveSeriesLength: program, choice, discipline.
  const seriesLength = program
    ? program.shotsPerSeries
    : (chosenLength ?? discipline.defaultSeriesLength);
  const mode = scoringModeFor(discipline, program, draft.decimalScoring);
  const skeleton = program ? buildProgramSkeleton(program) : [];
  const fixed = skeleton.length > 0;
  // Only where the phone offers Start Final (no program with one is laid out).
  if (program?.supportsFinal !== true && draft.series.some((row) => row.isFinal)) {
    throw new RangeError(`a final series needs a program with a final, got ${draft.programId}`);
  }

  const typed: KeptSeries[] = [];
  // One sighter per section, main and final, as the phone's addSeries allows.
  const sighterSections = new Set<boolean>();
  const rowCount = Math.max(skeleton.length, draft.series.length);
  for (let index = 0; index < rowCount; index += 1) {
    // Past the typed rows only the skeleton remains, so `entry` is set there.
    const row = draft.series[index];
    const entry = skeleton[index];
    const isSighter = entry ? entry.isSighter : !fixed && row!.isSighter;
    const parsed = parseSeriesText(row?.text ?? '', mode);
    if (!parsed.ok) {
      errors.push({ kind: 'series', row: index + 1, error: parsed.error });
      continue;
    }
    if (parsed.shots.length > seriesLength) {
      errors.push({ kind: 'tooManyShots', row: index + 1, max: seriesLength });
    }
    const isFinal = row?.isFinal === true;
    if (!fixed && isSighter) {
      if (sighterSections.has(isFinal)) errors.push({ kind: 'secondSighter', row: index + 1 });
      sighterSections.add(isFinal);
    }
    // A blank ordinary row is dropped; the skeleton, a sighter and a photo
    // are kept, as the phone pre-creates or keeps them.
    const hasPhoto = row?.hasPhoto === true;
    if (entry || isSighter || hasPhoto || parsed.shots.length > 0) {
      typed.push({
        isSighter,
        isFinal,
        shots: parsed.shots,
        photoRow: hasPhoto ? index + 1 : null,
        photoId: hasPhoto ? row?.photoId : undefined,
      });
    }
  }

  // A final with nothing shot (and no photo, C6) is not saved; one without a
  // main round is refused. A kept ordinary row has shots or a photo.
  const finalShot = typed.some((s) => s.isFinal && (s.shots.length > 0 || s.photoRow !== null));
  const kept = finalShot ? typed : typed.filter((s) => !s.isFinal);
  if (finalShot && !kept.some((s) => !s.isFinal && !s.isSighter)) {
    errors.push({ kind: 'finalWithoutMain' });
  }

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

  const rounds = sessionVolume({
    series: kept.map((s) => ({
      shotCount: s.shots.length,
      totalOnly: false,
      overrideShotCount: null,
    })),
    extraRounds: null,
    stationCount: 0,
    seriesLength,
  });
  const firearmRow = pulledFirearm ? withRoundsAdded(pulledFirearm, rounds, now) : null;
  if (firearmRow) add('firearms', firearmRow);

  const fields: SessionFields = {
    name,
    type: draft.type,
    disciplineId: draft.disciplineId,
    programId: program?.id ?? null,
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
    decimalScoring: decimalAllowed(discipline, program) && draft.decimalScoring,
    seriesLength: program ? null : chosenLength,
  };
  const sessionId = deps.newId();
  add('sessions', newSessionRow(sessionId, now, fields));

  const shotRows: Payload[] = [];
  const photos: SeriesPhoto[] = [];
  kept.forEach((series, index) => {
    const seriesId = series.photoId ?? deps.newId();
    // The series id doubles as the photo id, as on the phone (C2).
    if (series.photoRow !== null) photos.push({ row: series.photoRow, photoId: seriesId });
    add(
      'series',
      newSeriesRow(seriesId, now, {
        sessionId,
        position: index + 1,
        isSighter: series.isSighter,
        isFinal: series.isFinal,
        photoUri: series.photoRow === null ? null : toSyncPhotoUri(seriesId),
      }),
    );
    series.shots.forEach((shot, shotIndex) => {
      shotRows.push(newShotRow(deps.newId(), now, { seriesId, position: shotIndex + 1, ...shot }));
    });
  });
  for (const row of shotRows) add('shots', row);

  if (changes.length > PUSH_BATCH_MAX) {
    return { ok: false, errors: [{ kind: 'tooManyChanges', max: PUSH_BATCH_MAX }] };
  }
  return { ok: true, sessionId, changes, photos };
}
