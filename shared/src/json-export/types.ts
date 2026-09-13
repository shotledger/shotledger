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

// Descriptions are not decoration: they are the published schema's only prose,
// generated straight from here so the documentation cannot drift from what the
// app accepts (scripts/generate-export-schema.mjs).
const shotSchema = z.object({
  position: z.number().int().min(1).describe('1-based position of the shot within its series.'),
  // 0..109 tenths: the CSV layer's range, kept so a value that was valid
  // before stays valid now.
  valueTenths: z
    .number()
    .int()
    .min(0)
    .max(109)
    .describe(
      'Score in tenths of a point, so a decimal 10.9 is 109 and a whole 9 is 90. ' + 'A miss is 0.',
    ),
  isInnerTen: z
    .boolean()
    .describe('Whether the shot counts as an inner ten (X), used for tie-breaks.'),
});

const seriesSchema = z.object({
  position: z.number().int().min(1).describe('1-based position of the series within its session.'),
  isSighter: z
    .boolean()
    .describe('A sighter (provserie) is shot but not counted towards the session total.'),
  isFinal: z.boolean().describe('Whether the series belongs to a championship final.'),
  shots: z.array(shotSchema).describe('The shots of this series, in the order they were entered.'),
});

export const sessionExportSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe(
      'Stable id of the session. An import matches on this to update rather than duplicate.',
    ),
  name: z.string().min(1).describe("The session's display name."),
  type: z
    .enum(['training', 'competition'])
    .describe('Whether the session was training or a competition.'),
  disciplineId: z
    .string()
    .min(1)
    .describe(
      'Discipline id, e.g. `spsf-precision`. Free text: an import may name one this build does not define.',
    ),
  programId: z
    .string()
    .nullable()
    .describe('Shot-program id within the discipline, or null for no fixed format.'),
  competitionLevel: z
    .string()
    .nullable()
    .describe(
      'Competition level (forening, krets, landsdel, national, riks), or null for training.',
    ),
  isChampionship: z
    .boolean()
    .describe(
      'Whether the competition was a mästerskap — KM, DM, SM. A flag on the level, not a level of its own.',
    ),
  competitionName: z.string().nullable().describe("The event's own name, if it had one."),
  weaponGroup: z
    .string()
    .nullable()
    .describe(
      'Federation-scoped vapengrupp id, e.g. `spsf:C`. A training session takes this from its ' +
        'firearm rather than being asked; null when it could not be determined.',
    ),
  shooterClass: z
    .string()
    .nullable()
    .describe(
      'Klass the shooter entered under, e.g. `2` or `VetY`. Null on a training session — klass is a competition entry attribute.',
    ),
  // Added after v1 shipped, so it defaults rather than being required: a file
  // written by an earlier build has no eventId and must still import.
  eventId: z
    .string()
    .nullable()
    .default(null)
    .describe(
      'ISSF event id, `<disciplineId>:<gender>:<age>`. Null for a discipline whose category ' +
        'rides on the klass instead, and for training sessions.',
    ),
  firearm: z
    .string()
    .nullable()
    .describe('`"{make} {model}"`, or null if the session has no firearm.'),
  ammoLot: z.string().nullable().describe("The ammunition lot's label, or null."),
  startedAt: z.iso.datetime().describe('When the session started, ISO 8601.'),
  location: z.string().nullable().describe('Where it was shot, as free text.'),
  notes: z.string().nullable().describe("The session's notes."),
  decimalScoring: z
    .boolean()
    .describe('Whether scores are decimal. Affects how `valueTenths` reads, never what it stores.'),
  extraRounds: z
    .number()
    .int()
    .min(0)
    .nullable()
    .describe('Rounds fired but never scored — the whole shot count of a rounds-only session.'),
  tags: z.array(z.string()).describe("The session's tags."),
  series: z.array(seriesSchema).describe('The series of this session, in order.'),
});

/** The envelope, with `sessions` left loose so one bad session can be
 *  rejected on its own rather than failing the whole file (criterion 12). */
export const envelopeSchema = z.object({
  format: z
    .literal(JSON_EXPORT_FORMAT)
    .describe('Identifies the file. Always `shotledger.sessions`.'),
  // NOT a literal: the parser must accept a higher version in order to refuse
  // it with `newer-format-version` rather than "not a ShotLedger file". The
  // PUBLISHED schema pins the value it describes; see the generator.
  formatVersion: z
    .number()
    .int()
    .min(1)
    .describe(
      'Bumped only for a breaking change. An importer must refuse a higher version rather than dropping fields it does not understand.',
    ),
  generatedAt: z.iso.datetime().describe('When the file was written, ISO 8601.'),
  app: z
    .object({
      name: z.string().describe('The application that wrote the file.'),
      version: z.string().describe("That application's version."),
    })
    .describe('What wrote the file — for support, never for import decisions.'),
  sessions: z
    .array(z.unknown())
    .describe(
      'The exported sessions. Typed loosely by the parser on purpose, so one bad session is rejected on its own rather than failing the whole file; the real shape is documented here.',
    ),
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
