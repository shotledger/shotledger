// Rounds-only sessions and final series on the Enter Series form
// (docs/specs/web-rounds-final-spec.md C3, C5), mirroring the phone's
// new-session Logging picker and the session detail's Start Final. Pure.
import { getProgram, type Discipline } from '@shotledger/shared/src/disciplines';
import { withEntryTags } from '@shotledger/shared/src/sync-client/entry-tags';
import { buildFaltEntry } from '@shotledger/shared/src/sync-client/falt-entry';
import {
  buildRoundsEntry,
  type RoundsEntryDraft,
} from '@shotledger/shared/src/sync-client/rounds-entry';
import type { Payload } from '@shotledger/shared/src/sync-client/rows';
import {
  buildSessionEntry,
  type EntryContext,
  type EntryDeps,
  type EntryResult,
  type SessionEntryDraft,
} from '@shotledger/shared/src/sync-client/session-entry';

import { entryDisciplines, isFaltForm, toFaltDraft, type FaltForm } from './falt-model';
import {
  addRow,
  modeOf,
  rowSummary,
  toDraft,
  withProgram,
  type EntryForm,
  type SessionKind,
} from './model';

/** Every discipline of the regelverk, fält included, for either kind, as on the phone (#688). */
export function disciplineOptions(form: Pick<EntryForm, 'regulationId'>): readonly Discipline[] {
  return entryDisciplines(form.regulationId);
}

/** The phone's onSelectKind: rounds take no program and no decimal scoring. */
export function withKind(form: EntryForm, kind: SessionKind): EntryForm {
  if (kind === 'rounds') return withProgram({ ...form, kind }, null);
  return { ...form, kind, roundsFired: '' };
}

/** A final is offered by a program that has one (SPSF Precision), as on the phone. */
export function finalOffered(form: EntryForm): boolean {
  if (form.kind !== 'series' || form.programId === null) return false;
  return getProgram(form.programId)?.supportsFinal === true;
}

/** The phone's canStartFinal: no final yet, and an ordinary series holds a shot. */
export function canStartFinal(form: EntryForm): boolean {
  if (!finalOffered(form) || form.rows.some((row) => row.isFinal)) return false;
  const mode = modeOf(form);
  return form.rows.some((row) => {
    const summary = rowSummary(row.text, mode);
    return !row.isSighter && summary.ok && summary.shots > 0;
  });
}

export function startFinal(form: EntryForm): EntryForm {
  const added = addRow(form);
  const last = added.rows.length - 1;
  return {
    ...added,
    rows: added.rows.map((row, i) => (i === last ? { ...row, isFinal: true } : row)),
  };
}

export function toRoundsDraft(form: EntryForm, defaultName: string): RoundsEntryDraft {
  const draft = toDraft(form, defaultName);
  return {
    type: draft.type,
    disciplineId: draft.disciplineId,
    startedAt: draft.startedAt,
    name: draft.name,
    defaultName: draft.defaultName,
    location: draft.location,
    competitionLevel: draft.competitionLevel,
    isChampionship: draft.isChampionship,
    competitionName: draft.competitionName,
    weaponGroup: draft.weaponGroup,
    shooterClass: draft.shooterClass,
    eventId: draft.eventId,
    firearmId: draft.firearmId,
    ammoLotId: draft.ammoLotId,
    roundsFired: form.roundsFired,
  };
}

/** What Save pulls afresh: the entry's context and the account's tags. */
export type TaggedContext = EntryContext & { tags: ReadonlyMap<string, Payload> };

/** The entry Save builds, before its tags: rounds, fält stations or the typed series. */
function buildUntagged(
  form: EntryForm,
  falt: FaltForm,
  defaultName: string,
  context: EntryContext,
  deps: EntryDeps,
  uploadedPhotoIds: ReadonlyMap<number, string>,
): EntryResult {
  if (form.kind === 'rounds') {
    return buildRoundsEntry(toRoundsDraft(form, defaultName), context, deps);
  }
  if (isFaltForm(form)) {
    // Stations carry no photo.
    const entry = buildFaltEntry(toFaltDraft(form, falt, defaultName), context, deps);
    return entry.ok ? { ...entry, photos: [] } : entry;
  }
  return buildSessionEntry(withUploadedPhotos(form, defaultName, uploadedPhotoIds), context, deps);
}

/** What Save builds, its tags in the same push (web-entry-tags-spec C2). */
export function buildEntry(
  form: EntryForm,
  falt: FaltForm,
  defaultName: string,
  context: TaggedContext,
  deps: EntryDeps,
  /** Row key → the id of its photo already on the server (web-entry-photo-spec R7). */
  uploadedPhotoIds: ReadonlyMap<number, string>,
): EntryResult {
  const entry = buildUntagged(form, falt, defaultName, context, deps, uploadedPhotoIds);
  return withEntryTags(entry, form.tags, context.tags, deps);
}

/** The typed series; a row whose photo is already uploaded names that photo's id. */
function withUploadedPhotos(
  form: EntryForm,
  defaultName: string,
  uploadedPhotoIds: ReadonlyMap<number, string>,
): SessionEntryDraft {
  const draft = toDraft(form, defaultName);
  const series = draft.series.map((row, i) => ({
    ...row,
    photoId: uploadedPhotoIds.get(form.rows[i]!.key),
  }));
  return { ...draft, series };
}
