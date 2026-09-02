// CSV row shape — docs/implementation-plan.md §6.8, extended per
// docs/specs/m7-csv-spec.md for the schema fields §6.8 predates.
import { z } from 'zod';

export const CSV_COLUMNS = [
  'session_id',
  'session_name',
  'session_type',
  'discipline_id',
  'program_id',
  'competition_level',
  'is_championship',
  'competition_name',
  'weapon_group',
  'shooter_class',
  'firearm',
  'ammo_lot',
  'started_at',
  'location',
  'notes',
  'decimal_scoring',
  'extra_rounds',
  'tags',
  'series_position',
  'is_sighter',
  'is_final',
  'shot_position',
  'value_tenths',
  'is_inner_ten',
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

/** One session's worth of exportable data, as the app layer assembles it. */
export interface SessionExport {
  id: string;
  name: string;
  type: 'training' | 'competition';
  disciplineId: string;
  programId: string | null;
  competitionLevel: string | null;
  isChampionship: boolean;
  competitionName: string | null;
  weaponGroup: string | null;
  shooterClass: string | null;
  /** `"{make} {model}"`, or `null` if the session has no firearm. */
  firearm: string | null;
  /** Ammo lot `label`, or `null`. */
  ammoLot: string | null;
  startedAt: string;
  location: string | null;
  notes: string | null;
  decimalScoring: boolean;
  extraRounds: number | null;
  tags: string[];
  series: SeriesExport[];
}

export interface SeriesExport {
  position: number;
  isSighter: boolean;
  isFinal: boolean;
  shots: ShotExport[];
}

export interface ShotExport {
  position: number;
  valueTenths: number;
  isInnerTen: boolean;
}

const booleanField = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.enum(['1', '0', 'true', 'false']))
  .transform((s) => s === '1' || s === 'true');

const optionalBooleanField = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.union([z.literal('').transform(() => false), booleanField]));

const blankableInt = (min: number, max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z.union([
        z.literal('').transform(() => null),
        z
          .string()
          .regex(/^-?\d+$/, 'not an integer')
          .transform((s) => Number.parseInt(s, 10))
          .pipe(z.number().int().min(min).max(max)),
      ]),
    );

const blankableString = z.string().transform((s) => (s.trim().length === 0 ? null : s));

/** Zod schema for one raw parsed row (all fields are strings pre-coercion). */
export const csvRowSchema = z.object({
  session_id: z.string().min(1, 'session_id is required'),
  session_name: z.string().min(1, 'session_name is required'),
  session_type: z.enum(['training', 'competition']),
  discipline_id: z.string().min(1, 'discipline_id is required'),
  program_id: blankableString,
  competition_level: blankableString,
  is_championship: optionalBooleanField,
  competition_name: blankableString,
  weapon_group: blankableString,
  shooter_class: blankableString,
  firearm: blankableString,
  ammo_lot: blankableString,
  started_at: z.string().min(1, 'started_at is required'),
  location: blankableString,
  notes: blankableString,
  decimal_scoring: optionalBooleanField,
  extra_rounds: blankableInt(0, 1_000_000),
  tags: z.string(),
  series_position: blankableInt(1, 1_000_000),
  is_sighter: optionalBooleanField,
  is_final: optionalBooleanField,
  shot_position: blankableInt(1, 1_000_000),
  value_tenths: blankableInt(0, 109),
  is_inner_ten: optionalBooleanField,
});

export type CsvRow = z.infer<typeof csvRowSchema>;

export interface RowError {
  /** 1-based data row number (header is not counted). */
  row: number;
  column?: string;
  message: string;
}
