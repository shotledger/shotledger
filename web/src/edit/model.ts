// The Edit Session form as plain data (docs/specs/web-session-edit-spec.md
// §3.2): the session's fields as the phone's edit screen shows them, then one
// text per series of the main section. Pure, so the page is a thin view.
import {
  buildProgramSkeleton,
  getDiscipline,
  getProgram,
  scoringModeFor,
} from '@shotledger/shared/src/disciplines';
import type { ScoringMode } from '@shotledger/shared/src/scoring/entry';
import { formatSeriesText } from '@shotledger/shared/src/scoring/series-text';
import type { Payload } from '@shotledger/shared/src/sync-client/rows';
import {
  openedSession,
  type EditableSessionFields,
  type EditContext,
  type OpenedSession,
  type SessionEditDraft,
} from '@shotledger/shared/src/sync-client/session-edit';

import { startedAtIso } from '../entry/model';
import type { PulledTables, WebTable } from '../pull';
import { photoRefOf } from '../sessions/browse';

/** The tables Save and Delete pull afresh (E6, R1). */
export const EDIT_TABLES = [
  'sessions',
  'series',
  'shots',
  'falt_stations',
  'firearms',
  'ammo_lots',
] as const satisfies readonly WebTable[];

export function editContext(tables: Pick<PulledTables, (typeof EDIT_TABLES)[number]>): EditContext {
  return {
    sessions: tables.sessions,
    series: tables.series,
    shots: tables.shots,
    faltStations: tables.falt_stations,
    firearms: tables.firearms,
    ammoLots: tables.ammo_lots,
  };
}

export interface EditRow {
  /** Stable React key; not stored. */
  key: number;
  /** The series' id; null for a series added on the form. */
  id: string | null;
  text: string;
  isSighter: boolean;
  deleted: boolean;
  /** Shown as a marker only; Save never writes the photo columns (E10). */
  hasPhoto: boolean;
}

/** A series shown but not edited here: a final or a total-only one (E11). */
export interface ReadOnlySeries {
  id: string;
  position: number;
  kind: 'final' | 'totalOnly';
  text: string;
  hasPhoto: boolean;
}

/** What the page shows but leaves to the phone (E11): a fält session's stations, a rounds-only session's rounds. */
export type PhoneOnly =
  { kind: 'stations'; count: number } | { kind: 'rounds'; rounds: number } | null;

export interface EditForm {
  /** Local `YYYY-MM-DD` and `HH:MM`, as the date and time inputs hold them. */
  date: string;
  time: string;
  name: string;
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
  rows: EditRow[];
}

export interface OpenedForm {
  opened: OpenedSession;
  /** The form as opened: what "changed" is measured against. */
  initial: EditForm;
  readOnly: ReadOnlySeries[];
  /** Whether the session's series are edited here: a scored series session (E11). */
  editsSeries: boolean;
  /** A fixed format: its skeleton decides the sighters (K7). */
  fixed: boolean;
  mode: ScoringMode;
  /** Shots per series, for the row hint. */
  seriesLength: number;
  phoneOnly: PhoneOnly;
}

let lastKey = 0;
const nextKey = () => (lastKey += 1);

const pad = (n: number) => String(n).padStart(2, '0');
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const orNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** The local date and time inputs for a stored UTC instant. */
export function localDateTime(iso: string): { date: string; time: string } {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return { date: '', time: '' };
  return {
    date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
  };
}

const shotsOf = (shots: readonly Payload[]) =>
  shots.map((shot) => ({
    valueTenths: shot.value_tenths as number,
    isInnerTen: shot.is_inner_ten === 1,
  }));

/** The form for a session from the pulled rows; null when it is not live. */
export function openForm(context: EditContext, sessionId: string): OpenedForm | null {
  const opened = openedSession(sessionId, context);
  if (opened === null) return null;
  const { session } = opened;
  const discipline = getDiscipline(session.discipline_id as string);
  const program = getProgram(session.program_id as string) ?? null;
  const editsSeries = session.kind !== 'rounds' && discipline?.scoring === 'rings';
  const mode: ScoringMode = discipline
    ? scoringModeFor(discipline, program, session.decimal_scoring === 1)
    : 'integer';
  const seriesLength =
    program?.shotsPerSeries ??
    (session.series_length as number | null | undefined) ??
    discipline?.defaultSeriesLength ??
    0;

  const series = [...opened.series.values()].sort(
    (a, b) => (a.row.position as number) - (b.row.position as number),
  );
  const rows: EditRow[] = [];
  const readOnly: ReadOnlySeries[] = [];
  for (const { row, shots } of series) {
    const id = row.id as string;
    const shown = formatSeriesText(shotsOf(shots), mode);
    const hasPhoto = photoRefOf(row.photo_uri as string | null | undefined) !== null;
    if (row.is_final === 1 || row.is_total_override === 1) {
      readOnly.push({
        id,
        position: row.position as number,
        kind: row.is_final === 1 ? 'final' : 'totalOnly',
        text: shown,
        hasPhoto,
      });
    } else if (editsSeries) {
      rows.push({
        key: nextKey(),
        id,
        text: shown,
        isSighter: row.is_sighter === 1,
        deleted: false,
        hasPhoto,
      });
    }
  }

  const initial: EditForm = {
    ...localDateTime(text(session.started_at)),
    name: text(session.name),
    location: text(session.location),
    notes: text(session.notes),
    competitionName: text(session.competition_name),
    competitionLevel: orNull(session.competition_level),
    isChampionship: session.is_championship === 1,
    weaponGroup: orNull(session.weapon_group),
    shooterClass: orNull(session.shooter_class),
    eventId: orNull(session.event_id),
    firearmId: orNull(session.firearm_id),
    ammoLotId: orNull(session.ammo_lot_id),
    rows,
  };
  // A rounds-only fält session is rounds (#718).
  const phoneOnly: PhoneOnly =
    session.kind === 'rounds'
      ? { kind: 'rounds', rounds: (session.extra_rounds as number | null | undefined) ?? 0 }
      : discipline?.scoring === 'hits'
        ? { kind: 'stations', count: opened.stations.length }
        : null;
  return {
    opened,
    initial,
    readOnly,
    editsSeries,
    fixed: program !== null && buildProgramSkeleton(program).length > 0,
    mode,
    seriesLength,
    phoneOnly,
  };
}

type FieldKey = Exclude<keyof EditableSessionFields, 'startedAt'>;
const FIELDS: readonly FieldKey[] = [
  'name',
  'location',
  'notes',
  'competitionName',
  'competitionLevel',
  'isChampionship',
  'weaponGroup',
  'shooterClass',
  'eventId',
  'firearmId',
  'ammoLotId',
];

/** What Save sends: only the fields that differ from the form as opened (§3.1). */
export function toDraft(sessionId: string, initial: EditForm, form: EditForm): SessionEditDraft {
  const fields: Partial<EditableSessionFields> = {};
  for (const key of FIELDS) {
    if (form[key] !== initial[key]) Object.assign(fields, { [key]: form[key] });
  }
  if (form.date !== initial.date || form.time !== initial.time) {
    fields.startedAt = startedAtIso(form.date, form.time) ?? '';
  }
  return {
    sessionId,
    fields,
    series: form.rows.map(({ id, text: rowText, isSighter, deleted }) => ({
      id,
      text: rowText,
      isSighter,
      deleted,
    })),
  };
}

export function addRow(form: EditForm): EditForm {
  return {
    ...form,
    rows: [
      ...form.rows,
      { key: nextKey(), id: null, text: '', isSighter: false, deleted: false, hasPhoto: false },
    ],
  };
}

export function setRow(form: EditForm, key: number, patch: Partial<EditRow>): EditForm {
  return { ...form, rows: form.rows.map((row) => (row.key === key ? { ...row, ...patch } : row)) };
}

/** One sighter in the main section, free format only; a deleted row holds none. */
export function canMarkSighter(form: EditForm, key: number, fixed: boolean): boolean {
  if (fixed) return false;
  return form.rows.every((row) => row.key === key || row.deleted || !row.isSighter);
}
