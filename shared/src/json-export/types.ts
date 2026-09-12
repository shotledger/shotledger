// The JSON export's file format. Spec: docs/specs/json-export-spec.md §2.
//
// The session/series/shot shape is unchanged from the CSV layer this replaces
// — the spec changes the container, not the data model, so a session means
// exactly what it always meant.
import { z } from 'zod';

/** Identifies our export. Import refuses anything else rather than guessing. */
export const JSON_EXPORT_FORMAT = 'shotledger.sessions';

/**
 * Bumped only for a breaking change. Import refuses a HIGHER version rather
 * than dropping fields it does not understand — silently importing a subset
 * of a newer file is the data-loss mode this guards.
 */
export const JSON_EXPORT_VERSION = 1;

export interface ShotExport {
  position: number;
  valueTenths: number;
  isInnerTen: boolean;
}

export interface SeriesExport {
  position: number;
  isSighter: boolean;
  isFinal: boolean;
  shots: ShotExport[];
}

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
  /** ISSF event id; `null` for a discipline whose category rides on the klass. */
  eventId: string | null;
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

export interface JsonExportEnvelope {
  format: typeof JSON_EXPORT_FORMAT;
  formatVersion: number;
  generatedAt: string;
  app: { name: string; version: string };
  sessions: SessionExport[];
}

const shotSchema = z.object({
  position: z.number().int().min(1),
  // 0..109 tenths: the CSV layer's range, kept so a value that was valid
  // before stays valid now.
  valueTenths: z.number().int().min(0).max(109),
  isInnerTen: z.boolean(),
});

const seriesSchema = z.object({
  position: z.number().int().min(1),
  isSighter: z.boolean(),
  isFinal: z.boolean(),
  shots: z.array(shotSchema),
});

export const sessionExportSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['training', 'competition']),
  disciplineId: z.string().min(1),
  programId: z.string().nullable(),
  competitionLevel: z.string().nullable(),
  isChampionship: z.boolean(),
  competitionName: z.string().nullable(),
  weaponGroup: z.string().nullable(),
  shooterClass: z.string().nullable(),
  // Added after v1 shipped, so it defaults rather than being required: a file
  // written by an earlier build has no eventId and must still import.
  eventId: z.string().nullable().default(null),
  firearm: z.string().nullable(),
  ammoLot: z.string().nullable(),
  startedAt: z.string().min(1),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  decimalScoring: z.boolean(),
  extraRounds: z.number().int().min(0).nullable(),
  tags: z.array(z.string()),
  series: z.array(seriesSchema),
});

/** The envelope, with `sessions` left loose so one bad session can be
 *  rejected on its own rather than failing the whole file (criterion 12). */
export const envelopeSchema = z.object({
  format: z.literal(JSON_EXPORT_FORMAT),
  formatVersion: z.number().int().min(1),
  generatedAt: z.string(),
  app: z.object({ name: z.string(), version: z.string() }),
  sessions: z.array(z.unknown()),
});

/** Why an import was refused outright, or one session was skipped. */
export type ImportErrorCode =
  'malformed-json' | 'not-a-shotledger-file' | 'newer-format-version' | 'invalid-session';

export interface ImportError {
  code: ImportErrorCode;
  /** 0-based index into `sessions`, when the failure is one session's. */
  sessionIndex?: number;
  message: string;
}
