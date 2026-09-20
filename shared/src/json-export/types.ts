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
 *
 * Additive optional fields do not bump it: a reader of the older shape still
 * reads the newer file correctly (CLAUDE.md hard rule 8, pre-1.0.0).
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
  /** Id into the envelope's `firearms`, or `null`. */
  firearmId: string | null;
  /** `"{make} {model}"`, or `null` if the session has no firearm. Kept as the
   *  fallback for a file whose `firearms` array does not hold this one. */
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

/** A firearm, as the envelope carries it. Everything the firearms table holds
 *  except its row bookkeeping (created/updated/deleted timestamps). */
export interface FirearmExport {
  id: string;
  make: string;
  model: string;
  caliber: string | null;
  weaponType: 'pistol' | 'revolver' | 'rifle' | 'airgun' | null;
  isOwn: boolean;
  serialNumber: string | null;
  vapenId: string | null;
  loadSystem: string | null;
  notes: string | null;
  roundCount: number;
  maintenanceIntervalRounds: number | null;
  roundsSinceMaintenance: number;
}

/** One ISSUED license. A renewal is another row, not an edit of this one, so a
 *  firearm can carry several and the latest one wins. */
export interface LicenseExport {
  id: string;
  firearmId: string;
  licenseNumber: string | null;
  purpose: string | null;
  decidedOn: string | null;
  validUntil: string | null;
  conditions: string | null;
  authority: string | null;
}

export interface JsonExportEnvelope {
  format: typeof JSON_EXPORT_FORMAT;
  formatVersion: number;
  generatedAt: string;
  app: { name: string; version: string };
  sessions: SessionExport[];
  firearms: FirearmExport[];
  licenses: LicenseExport[];
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
  // Additive, so it defaults rather than being required: a file written
  // before the firearms array existed has no firearmId and must still import.
  firearmId: z
    .string()
    .nullable()
    .default(null)
    .describe("Id of an entry in the envelope's `firearms`, or null."),
  firearm: z
    .string()
    .nullable()
    .describe(
      '`"{make} {model}"`, or null if the session has no firearm. The fallback when ' +
        '`firearmId` names no firearm the file carries.',
    ),
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

export const firearmExportSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe('Stable id of the firearm. A session references it as `firearmId`.'),
  make: z.string().min(1).describe('Manufacturer, e.g. `Pardini`.'),
  model: z.string().describe('Model, e.g. `SP`. May be empty when only a make is known.'),
  caliber: z.string().nullable().describe('Caliber, e.g. `.22 LR`. One per firearm today.'),
  weaponType: z
    .enum(['pistol', 'revolver', 'rifle', 'airgun'])
    .nullable()
    .default(null)
    .describe('Vapentyp, or null when unstated.'),
  isOwn: z
    .boolean()
    .default(true)
    .describe('Whether the shooter owns it, as opposed to a borrowed or club firearm.'),
  serialNumber: z.string().nullable().default(null).describe('Serial number, or null.'),
  vapenId: z
    .string()
    .nullable()
    .default(null)
    .describe('National register id (`SE…` on the back of a Swedish license card), or null.'),
  loadSystem: z.string().nullable().default(null).describe('Laddsystem, e.g. `halvautomat`.'),
  notes: z.string().nullable().default(null).describe("The firearm's notes."),
  roundCount: z.number().int().min(0).default(0).describe('Rounds fired through it in total.'),
  maintenanceIntervalRounds: z
    .number()
    .int()
    .min(0)
    .nullable()
    .default(null)
    .describe('Rounds between cleanings, or null for no reminder.'),
  roundsSinceMaintenance: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Rounds fired since the last maintenance event.'),
});

export const licenseExportSchema = z.object({
  id: z.string().min(1).describe('Stable id of the license row.'),
  firearmId: z
    .string()
    .min(1)
    .describe('The firearm this license is for. An import drops a license naming no firearm.'),
  licenseNumber: z.string().nullable().default(null).describe('License number, e.g. `A123.456`.'),
  purpose: z.string().nullable().default(null).describe('Ändamål, e.g. `Målskjutning`.'),
  decidedOn: z.string().nullable().default(null).describe('Date of decision, `YYYY-MM-DD`.'),
  validUntil: z
    .string()
    .nullable()
    .default(null)
    .describe('Valid through, `YYYY-MM-DD`; null means tills vidare (no expiry).'),
  conditions: z.string().nullable().default(null).describe('Villkor, often empty.'),
  authority: z.string().nullable().default(null).describe('Issuing authority.'),
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
  // Loose and defaulted for the same two reasons as `sessions`: one bad entry
  // is rejected on its own, and a file written before these existed imports.
  firearms: z
    .array(z.unknown())
    .default([])
    .describe(
      'The firearms the sessions reference, so a file can be imported into an empty install without retyping the equipment. Loosely typed by the parser for the same reason as `sessions`.',
    ),
  licenses: z
    .array(z.unknown())
    .default([])
    .describe(
      'Weapon licenses, one entry per issued license, each naming its firearm. Loosely typed by the parser for the same reason as `sessions`.',
    ),
});

/** Why an import was refused outright, or one session was skipped. */
export type ImportErrorCode =
  | 'malformed-json'
  | 'not-a-shotledger-file'
  | 'newer-format-version'
  | 'invalid-session'
  | 'invalid-firearm'
  | 'invalid-license';

export interface ImportError {
  code: ImportErrorCode;
  /** 0-based index into `sessions`, when the failure is one session's. */
  sessionIndex?: number;
  /** 0-based index into `firearms` or `licenses`, for those two codes. */
  itemIndex?: number;
  message: string;
}
