// Discipline and program definitions are DATA, not code (implementation plan
// §6.2 / §6.3). These zod schemas are the contract every shipped JSON file is
// validated against at module load — a malformed data file fails loudly at
// startup and in the test suite, never silently at scoring time.
import { z } from 'zod';

const localizedName = z.strictObject({
  sv: z.string().min(1),
  en: z.string().min(1),
});

export const federationSchema = z.enum(['SPSF', 'ISSF', 'SvSF', 'generic']);
export type Federation = z.infer<typeof federationSchema>;

/**
 * How a shot is worth something: a ring value, or a hit on a figure.
 * `hits` is fältskjutning's model (SHB Del D) — nothing is scored per shot
 * there, so a `hits` discipline's results live at station level.
 */
export const scoringModelSchema = z.enum(['rings', 'hits']);
export type ScoringModel = z.infer<typeof scoringModelSchema>;

/** §6.2 disciplineSchema. */
export const disciplineSchema = z
  .strictObject({
    id: z.string().min(1),
    federation: federationSchema,
    name: localizedName,
    /** Target face id — see §6.5c for the SPSF dimensions. Rings only. */
    targetFace: z.string().min(1).optional(),
    defaultSeriesLength: z.int().positive(),
    scoring: scoringModelSchema,
    allowsDecimal: z.boolean(),
    /** Federation-scoped vapengrupp ids valid for this discipline (§6.4a). */
    weaponGroups: z.array(z.string().min(1)),
  })
  .superRefine((discipline, ctx) => {
    if (discipline.scoring === 'rings' && discipline.targetFace === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetFace'],
        message: 'a rings discipline must name its targetFace',
      });
    }
    // A fält round is shot against a catalogue of figures the banläggare
    // picks from per station (D.7.1 pp. 99-109), so one face per discipline
    // is not a value that exists to fill in.
    if (discipline.scoring === 'hits' && discipline.targetFace !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetFace'],
        message: 'a hits discipline has no single targetFace',
      });
    }
    if (discipline.scoring === 'hits' && discipline.allowsDecimal) {
      ctx.addIssue({
        code: 'custom',
        path: ['allowsDecimal'],
        message: 'a hits discipline has no ring value to score decimally',
      });
    }
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
