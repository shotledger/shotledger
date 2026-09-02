// Discipline and program definitions are DATA, not code (implementation plan
// §6.2 / §6.3). These zod schemas are the contract every shipped JSON file is
// validated against at module load — a malformed data file fails loudly at
// startup and in the test suite, never silently at scoring time.
import { z } from 'zod';

const localizedName = z.strictObject({
  sv: z.string().min(1),
  en: z.string().min(1),
});

export const federationSchema = z.enum(['SPSF', 'ISSF', 'generic']);
export type Federation = z.infer<typeof federationSchema>;

/** §6.2 disciplineSchema. */
export const disciplineSchema = z.strictObject({
  id: z.string().min(1),
  federation: federationSchema,
  name: localizedName,
  /** Target face id — see §6.5c for the SPSF dimensions. */
  targetFace: z.string().min(1),
  defaultSeriesLength: z.int().positive(),
  scoring: z.literal('rings'),
  allowsDecimal: z.boolean(),
  /** Federation-scoped vapengrupp ids valid for this discipline (§6.4a). */
  weaponGroups: z.array(z.string().min(1)),
});
export type Discipline = z.infer<typeof disciplineSchema>;

/**
 * §6.3 programSchema. `structure` is present ONLY for fixed-format programs
 * (milsnabb); its absence means the program is freeform and pre-creates
 * nothing — series counts are never fixed for those.
 */
export const programSchema = z.strictObject({
  id: z.string().min(1),
  disciplineId: z.string().min(1),
  federation: federationSchema,
  name: localizedName,
  shotsPerSeries: z.int().positive(),
  scoring: z.enum(['integer', 'decimal']),
  supportsFinal: z.boolean(),
  structure: z
    .strictObject({
      sighterSeries: z.int().min(0),
      groups: z
        .array(
          z.strictObject({
            seriesCount: z.int().positive(),
            timeLimitSeconds: z.int().positive().optional(),
          }),
        )
        .min(1),
    })
    .optional(),
});
export type Program = z.infer<typeof programSchema>;
export type ProgramStructure = NonNullable<Program['structure']>;
