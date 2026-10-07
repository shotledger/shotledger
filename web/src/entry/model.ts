// The Enter Series form as plain data (docs/specs/web-series-entry-spec.md
// §3.1): the phone's new-session cascade, then rows of typed series. Pure, so
// the page is a thin view over it.
import {
  buildProgramSkeleton,
  decimalAllowed,
  disciplinesForRegulations,
  getProgram,
  rankEventsForShooter,
  requireDiscipline,
  scoringModeFor,
  type Discipline,
  type ShooterProfile,
} from '@shotledger/shared/src/disciplines';
import { defaultProgramFor } from '@shotledger/shared/src/disciplines/session-defaults';
import { effectiveRegulationIds, REGULATIONS } from '@shotledger/shared/src/regulations/registry';
import type { ScoringMode } from '@shotledger/shared/src/scoring/entry';
import { parseSeriesText, type SeriesTextError } from '@shotledger/shared/src/scoring/series-text';
import type { SessionEntryDraft } from '@shotledger/shared/src/sync-client/session-entry';

import type { CompetitionLevel } from '../../../app/src/features/session/labels';

export type SessionType = 'training' | 'competition';

export interface Row {
  /** Stable React key; not stored. */
  key: number;
  text: string;
  isSighter: boolean;
}

export interface EntryForm {
  type: SessionType;
  regulationId: string;
  disciplineId: string;
  programId: string | null;
  /** Local `YYYY-MM-DD` and `HH:MM`, as the date and time inputs hold them. */
  date: string;
  time: string;
  name: string;
  location: string;
  competitionLevel: CompetitionLevel;
  isChampionship: boolean;
  competitionName: string;
  weaponGroup: string | null;
  shooterClass: string | null;
  eventId: string | null;
  firearmId: string | null;
  ammoLotId: string | null;
  decimalScoring: boolean;
  seriesLengthText: string;
  rows: Row[];
}

// The profile settings are not read in this layer (spec C6).
const EMPTY_PROFILE: ShooterProfile = {
  birthYear: null,
  skillClass: null,
  competesInWomensClasses: false,
};

let lastKey = 0;
const newRow = (text = '', isSighter = false): Row => ({ key: (lastKey += 1), text, isSighter });

/** Ring disciplines only: fält is scored in hits and entered on the phone (C4). */
export function ringDisciplines(regulationId: string): readonly Discipline[] {
  return disciplinesForRegulations([regulationId]).filter((d) => d.scoring === 'rings');
}

/** `firstDisciplineFor`'s rule, over the ring disciplines only. */
function firstRingDiscipline(regulationId: string): string {
  const rings = ringDisciplines(regulationId);
  return (rings.find((d) => d.federation !== 'generic') ?? rings[0]!).id;
}

/** The events on offer, ranked against an empty profile (C6). */
export function eventsFor(form: Pick<EntryForm, 'regulationId' | 'disciplineId' | 'date'>) {
  const year = Number(form.date.slice(0, 4)) || new Date().getFullYear();
  return rankEventsForShooter(
    EMPTY_PROFILE,
    form.disciplineId,
    year,
    effectiveRegulationIds([form.regulationId]),
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

export function initialForm(now: Date): EntryForm {
  const regulationId = REGULATIONS[0]!.id;
  const disciplineId = firstRingDiscipline(regulationId);
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const form: EntryForm = {
    type: 'training',
    regulationId,
    disciplineId,
    programId: defaultProgramFor('training', disciplineId),
    date,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    name: '',
    location: '',
    competitionLevel: 'forening',
    isChampionship: false,
    competitionName: '',
    weaponGroup: null,
    shooterClass: null,
    eventId: null,
    firearmId: null,
    ammoLotId: null,
    decimalScoring: false,
    seriesLengthText: String(requireDiscipline(disciplineId).defaultSeriesLength),
    rows: [newRow()],
  };
  return { ...form, eventId: eventsFor(form)[0]?.id ?? null };
}

const programOf = (form: Pick<EntryForm, 'programId'>) =>
  form.programId === null ? null : (getProgram(form.programId) ?? null);

export function skeletonOf(form: Pick<EntryForm, 'programId'>) {
  const program = programOf(form);
  return program ? buildProgramSkeleton(program) : [];
}

export const isFixed = (form: Pick<EntryForm, 'programId'>) => skeletonOf(form).length > 0;

/**
 * Re-lays the rows for the form's program, keeping what was typed: a fixed
 * format takes its skeleton's rows and sighters, typed rows past it kept; a
 * free one drops trailing blank rows and every sighter mark.
 */
function layoutRows(form: EntryForm): EntryForm {
  const skeleton = skeletonOf(form);
  if (skeleton.length > 0) {
    const laid = skeleton.map((entry, i) => ({
      key: form.rows[i]?.key ?? newRow().key,
      text: form.rows[i]?.text ?? '',
      isSighter: entry.isSighter,
    }));
    const past = form.rows
      .slice(skeleton.length)
      .filter((row) => row.text.trim() !== '')
      .map((row) => ({ ...row, isSighter: false }));
    return { ...form, rows: [...laid, ...past] };
  }
  const rows = form.rows.map((row) => ({ ...row, isSighter: false }));
  while (rows.length > 1 && rows.at(-1)!.text.trim() === '') rows.pop();
  return { ...form, rows: rows.length > 0 ? rows : [newRow()] };
}

export function withProgram(form: EntryForm, programId: string | null): EntryForm {
  return layoutRows({ ...form, programId, decimalScoring: false });
}

export function withType(form: EntryForm, type: SessionType): EntryForm {
  return withProgram({ ...form, type }, defaultProgramFor(type, form.disciplineId));
}

export function withDiscipline(
  form: EntryForm,
  disciplineId: string,
  regulationId: string = form.regulationId,
): EntryForm {
  const next = {
    ...form,
    regulationId,
    disciplineId,
    weaponGroup: null,
    seriesLengthText: String(requireDiscipline(disciplineId).defaultSeriesLength),
  };
  return withProgram(
    { ...next, eventId: eventsFor(next)[0]?.id ?? null },
    defaultProgramFor(form.type, disciplineId),
  );
}

export function withRegulation(form: EntryForm, regulationId: string): EntryForm {
  return withDiscipline(form, firstRingDiscipline(regulationId), regulationId);
}

export function addRow(form: EntryForm): EntryForm {
  return { ...form, rows: [...form.rows, newRow()] };
}

/**
 * Enter in a row moves to the next one. In the last row of a free format it
 * adds a row first; a fixed format's skeleton is complete as laid out.
 */
export function onRowEnter(
  form: EntryForm,
  index: number,
): { form: EntryForm; focus: number | null } {
  if (index < form.rows.length - 1) return { form, focus: index + 1 };
  if (isFixed(form)) return { form, focus: null };
  return { form: addRow(form), focus: index + 1 };
}

/** One sighter per section in free format (§6.3); a skeleton decides its own. */
export function canMarkSighter(form: EntryForm, index: number): boolean {
  if (isFixed(form)) return false;
  return form.rows.every((row, i) => i === index || !row.isSighter);
}

export function decimalShown(form: EntryForm): boolean {
  return decimalAllowed(requireDiscipline(form.disciplineId), programOf(form));
}

export function modeOf(form: EntryForm): ScoringMode {
  return scoringModeFor(requireDiscipline(form.disciplineId), programOf(form), form.decimalScoring);
}

/** The local date and time as UTC ISO-8601; null when either is incomplete. */
export function startedAtIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const parsed = new Date(`${date}T${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Blank or not a positive whole number falls back to the default, as on the phone. */
function chosenSeriesLength(text: string): number | null {
  const parsed = Number(text.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function toDraft(form: EntryForm, defaultName: string): SessionEntryDraft {
  return {
    type: form.type,
    disciplineId: form.disciplineId,
    programId: form.programId,
    startedAt: startedAtIso(form.date, form.time) ?? '',
    name: form.name,
    defaultName,
    location: form.location,
    competitionLevel: form.competitionLevel,
    isChampionship: form.isChampionship,
    competitionName: form.competitionName,
    weaponGroup: form.weaponGroup,
    shooterClass: form.shooterClass,
    eventId: form.eventId,
    firearmId: form.firearmId,
    ammoLotId: form.ammoLotId,
    decimalScoring: decimalShown(form) && form.decimalScoring,
    seriesLength: programOf(form) ? null : chosenSeriesLength(form.seriesLengthText),
    series: form.rows.map(({ text, isSighter }) => ({ text, isSighter })),
  };
}

export type RowSummary =
  | { ok: true; totalTenths: number; innerTens: number; shots: number }
  | { ok: false; error: SeriesTextError };

export function rowSummary(text: string, mode: ScoringMode): RowSummary {
  const parsed = parseSeriesText(text, mode);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    totalTenths: parsed.shots.reduce((sum, shot) => sum + shot.valueTenths, 0),
    innerTens: parsed.shots.filter((shot) => shot.isInnerTen).length,
    shots: parsed.shots.length,
  };
}
