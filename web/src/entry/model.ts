// The Enter Series form as plain data (docs/specs/web-series-entry-spec.md
// §3.1): the phone's new-session cascade, then rows of typed series. Pure, so
// the page is a thin view over it.
import {
  buildProgramSkeleton,
  decimalAllowed,
  defaultShooterClass,
  disciplinesForRegulations,
  getProgram,
  requireDiscipline,
  scoringModeFor,
  type Discipline,
  type ShooterProfile,
} from '@shotledger/shared/src/disciplines';
import {
  defaultProgramFor,
  eventsUnder,
  preferredEventId,
  shooterClassesInOrder,
} from '@shotledger/shared/src/disciplines/session-defaults';
import { REGULATIONS } from '@shotledger/shared/src/regulations/registry';
import type { ScoringMode } from '@shotledger/shared/src/scoring/entry';
import { parseSeriesText, type SeriesTextError } from '@shotledger/shared/src/scoring/series-text';
import type { SessionEntryDraft } from '@shotledger/shared/src/sync-client/session-entry';

import type { CompetitionLevel } from '../../../app/src/features/session/labels';

export type SessionType = 'training' | 'competition';
/** Scored series, or rounds fired only (docs/specs/web-rounds-final-spec.md). */
export type SessionKind = 'series' | 'rounds';

export interface Row {
  /** Stable React key; not stored. */
  key: number;
  text: string;
  isSighter: boolean;
  /** A row of the final; absent is the main round. */
  isFinal?: boolean;
}

export interface EntryForm {
  type: SessionType;
  kind: SessionKind;
  /** Rounds Only: the count as typed. */
  roundsFired: string;
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
  /** Tag names, in the order added; linked when the push is built (tags.ts). */
  tags: readonly string[];
  /** The synced profile the klass and event defaults come from (C6); not stored. */
  profile: ShooterProfile;
  /** The year eligibility is judged in: the year the form opened, as on the phone. */
  eligibilityYear: number;
}

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

type Defaults = Pick<EntryForm, 'regulationId' | 'disciplineId' | 'profile' | 'eligibilityYear'>;

/** The events on offer, ranked for the shooter as the phone ranks them (C6). */
export function eventsFor(form: Defaults) {
  return eventsUnder(form.regulationId, form.disciplineId, form.profile, form.eligibilityYear);
}

const preferredEvent = (form: Defaults) =>
  preferredEventId(form.regulationId, form.disciplineId, form.profile, form.eligibilityYear);

/** Every klass of the discipline, the shooter's own first (C6). */
export function classesFor(form: Defaults & Pick<EntryForm, 'weaponGroup'>): string[] {
  return shooterClassesInOrder(
    form.disciplineId,
    form.profile,
    form.eligibilityYear,
    form.weaponGroup,
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

export function initialForm(now: Date, profile: ShooterProfile): EntryForm {
  const regulationId = REGULATIONS[0]!.id;
  const disciplineId = firstRingDiscipline(regulationId);
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const form: EntryForm = {
    type: 'training',
    kind: 'series',
    roundsFired: '',
    regulationId,
    disciplineId,
    // Training preselects no program (defaultProgramFor).
    programId: null,
    date,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    name: '',
    location: '',
    competitionLevel: 'forening',
    isChampionship: false,
    competitionName: '',
    weaponGroup: null,
    // Prefilled from the profile, as the phone does; kept across later changes.
    shooterClass: defaultShooterClass(profile, now.getFullYear()),
    eventId: null,
    firearmId: null,
    ammoLotId: null,
    decimalScoring: false,
    seriesLengthText: String(requireDiscipline(disciplineId).defaultSeriesLength),
    rows: [newRow()],
    tags: [],
    profile,
    eligibilityYear: now.getFullYear(),
  };
  return { ...form, eventId: preferredEvent(form) };
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
  // A program without a final turns final rows into ordinary ones.
  const ordinary = (row: Row): Row =>
    row.isFinal && programOf(form)?.supportsFinal !== true ? { ...row, isFinal: false } : row;
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
      .map((row) => ({ ...ordinary(row), isSighter: false }));
    return { ...form, rows: [...laid, ...past] };
  }
  const rows = form.rows.map((row) => ({ ...ordinary(row), isSighter: false }));
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
    { ...next, eventId: preferredEvent(next) },
    defaultProgramFor(form.type, disciplineId),
  );
}

export function withRegulation(form: EntryForm, regulationId: string): EntryForm {
  return withDiscipline(form, firstRingDiscipline(regulationId), regulationId);
}

/**
 * Whether `next` builds the same session as `prev`: only blank, unmarked rows
 * appended, which the builder drops. Enter and Add Series then keep a held
 * request instead of silently discarding it (R21).
 */
export function sendsTheSame(prev: EntryForm, next: EntryForm): boolean {
  const { rows: before, ...fieldsBefore } = prev;
  const { rows: after, ...fieldsAfter } = next;
  if (after.length < before.length) return false;
  const keys = Object.keys(fieldsBefore) as (keyof typeof fieldsBefore)[];
  return (
    keys.every((key) => fieldsBefore[key] === fieldsAfter[key]) &&
    before.every(
      (row, i) => row.text === after[i]!.text && row.isSighter === after[i]!.isSighter,
    ) &&
    after.slice(before.length).every((row) => row.text.trim() === '' && !row.isSighter)
  );
}

/** After Start Final, a new row is a final row, as on the phone. */
export function addRow(form: EntryForm): EntryForm {
  const row = form.rows.at(-1)?.isFinal ? { ...newRow(), isFinal: true } : newRow();
  return { ...form, rows: [...form.rows, row] };
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
  const final = form.rows[index]!.isFinal === true;
  return form.rows.every(
    (row, i) => i === index || !row.isSighter || (row.isFinal === true) !== final,
  );
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
  const parsed = Number(text);
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
    series: form.rows.map(({ text, isSighter, isFinal }) => ({
      text,
      isSighter,
      isFinal: isFinal === true,
    })),
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
