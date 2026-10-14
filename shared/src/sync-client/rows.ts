// Whole-row payloads for the rows the web creates
// (docs/specs/web-series-entry-spec.md §3.2). A push replaces the whole row
// (ADR 0019), so every column of the app's table is present, with the values
// the app's own createSession / addSeries / addShot write. Keys are the
// app's column names; app/src/db/queries/web-rows.test.ts holds them to
// shared/src/sync/schema.ts.
import { MAX_VALUE_TENTHS } from '../scoring/entry';

export type Payload = Record<string, unknown>;

export interface SessionFields {
  name: string;
  type: 'training' | 'competition';
  disciplineId: string;
  programId: string | null;
  competitionLevel: string | null;
  isChampionship: boolean;
  competitionName: string | null;
  weaponGroup: string | null;
  shooterClass: string | null;
  eventId: string | null;
  firearmId: string | null;
  ammoLotId: string | null;
  /** UTC ISO-8601. */
  startedAt: string;
  location: string | null;
  decimalScoring: boolean;
  seriesLength: number | null;
  /** Absent is a series session; a rounds session carries its count in extraRounds. */
  kind?: 'series' | 'rounds';
  extraRounds?: number | null;
}

const common = (id: string, now: string) => ({
  id,
  created_at: now,
  updated_at: now,
  deleted_at: null,
});

export function newSessionRow(id: string, now: string, fields: SessionFields): Payload {
  return {
    ...common(id, now),
    name: fields.name,
    type: fields.type,
    kind: fields.kind ?? 'series',
    series_entry_mode: 'ask',
    discipline_id: fields.disciplineId,
    program_id: fields.programId,
    competition_level: fields.competitionLevel,
    is_championship: fields.isChampionship ? 1 : 0,
    competition_name: fields.competitionName,
    weapon_group: fields.weaponGroup,
    shooter_class: fields.shooterClass,
    event_id: fields.eventId,
    firearm_id: fields.firearmId,
    ammo_lot_id: fields.ammoLotId,
    started_at: fields.startedAt,
    location: fields.location,
    notes: null,
    ten_count: null,
    inner_ten_count: null,
    decimal_scoring: fields.decimalScoring ? 1 : 0,
    series_length: fields.seriesLength,
    falt_result_mode: null,
    extra_rounds: fields.extraRounds ?? null,
    external_source: null,
    external_ref: null,
    official_placement: null,
    official_standardmedalj: null,
  };
}

export interface SeriesFields {
  sessionId: string;
  position: number;
  isSighter: boolean;
  isFinal?: boolean;
  /** A synced photo's marker (docs/specs/web-entry-photo-spec.md C2); absent is none. */
  photoUri?: string | null;
}

export function newSeriesRow(id: string, now: string, fields: SeriesFields): Payload {
  return {
    ...common(id, now),
    session_id: fields.sessionId,
    position: fields.position,
    is_sighter: fields.isSighter ? 1 : 0,
    is_final: fields.isFinal ? 1 : 0,
    photo_uri: fields.photoUri ?? null,
    photo_geometry: null,
    is_total_override: 0,
    total_override_tenths: null,
    total_override_shot_count: null,
    is_shoot_off: 0,
  };
}

export interface ShotFields {
  seriesId: string;
  position: number;
  valueTenths: number;
  isInnerTen: boolean;
}

export function newShotRow(id: string, now: string, fields: ShotFields): Payload {
  const { valueTenths } = fields;
  if (!Number.isInteger(valueTenths) || valueTenths < 0 || valueTenths > MAX_VALUE_TENTHS) {
    throw new RangeError(`value_tenths must be an integer 0..${MAX_VALUE_TENTHS}`);
  }
  return {
    ...common(id, now),
    series_id: fields.seriesId,
    position: fields.position,
    value_tenths: valueTenths,
    is_inner_ten: fields.isInnerTen ? 1 : 0,
    // Deprecated column (A1 §A1.1.4): always 0, as addShot writes it.
  };
}

const counter = (value: unknown): number => (typeof value === 'number' ? value : 0);

/**
 * The pulled firearm with `n` more rounds on its counter, as the phone's
 * applyRoundCountDelta moves it (rounds since maintenance is derived, #727
 * M4); null when there is nothing to add. The pulled payload is spread so a
 * column this build does not know survives.
 */
export function withRoundsAdded(pulled: Payload, n: number, now: string): Payload | null {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`rounds must be a non-negative integer, got ${n}`);
  }
  if (n === 0) return null;
  return {
    ...pulled,
    round_count: counter(pulled.round_count) + n,
    updated_at: now,
  };
}

/**
 * The pulled firearm with its counter moved by `delta` (signed), floored at
 * 0, as the phone's applyRoundCountDelta; null when `delta` is 0.
 * The pulled payload is spread so a column this build does not know survives.
 */
export function withRoundsMoved(pulled: Payload, delta: number, now: string): Payload | null {
  if (!Number.isInteger(delta)) throw new RangeError(`rounds must be an integer, got ${delta}`);
  if (delta === 0) return null;
  return {
    ...pulled,
    round_count: Math.max(0, counter(pulled.round_count) + delta),
    updated_at: now,
  };
}

/**
 * A synced setting's whole row, as the phone's setSetting writes it: `value`
 * is the JSON text, `created_at` survives from the pulled row (spread, so a
 * column this build does not know survives too), never a tombstone.
 */
export function newSettingRow(key: string, value: unknown, now: string, pulled?: Payload): Payload {
  return {
    ...pulled,
    id: key,
    value: JSON.stringify(value),
    created_at: typeof pulled?.created_at === 'string' ? pulled.created_at : now,
    updated_at: now,
    deleted_at: null,
  };
}
