#!/usr/bin/env node
// Manual mutation runner for shared/src/disciplines/schema.ts.
//
// Why it exists: the zod schemas are built at module load, so Stryker's
// vitest runner cannot activate mutants in them once the module is cached
// (stryker.config.json sets `ignoreStatic`). This runner mutates the FILE ON
// DISK instead, so each mutant is really in effect when the suite re-imports
// the module. Mutants are addressed by text; scripts/lib/zod-file-mutants.mjs
// fails closed when one does not apply.
//
// Run: node scripts/mutate-schema.mjs   (or `pnpm mutation:schema`)
import { runZodFileMutants } from './lib/zod-file-mutants.mjs';

/** [unique context, search text inside it, replacement, description] */
runZodFileMutants('shared/src/disciplines/schema.ts', 'shared/src/disciplines', [
  [
    'const localizedName = z.strictObject({',
    'z.strictObject({',
    'z.object({',
    'localizedName accepts unknown keys',
  ],
  [
    'sv: z.string().min(1),',
    'z.string().min(1)',
    'z.string().max(1)',
    'localized sv name allows the empty string',
  ],
  [
    'disciplineSchema = z\n  .strictObject({',
    '.strictObject({',
    '.object({',
    'discipline accepts unknown keys',
  ],
  [
    'id: z.string().min(1),\n    federation: federationSchema,',
    'z.string().min(1)',
    'z.string().max(1)',
    'discipline id allows the empty string',
  ],
  [
    'defaultSeriesLength: z.int().positive(),',
    'z.int().positive()',
    'z.int()',
    'defaultSeriesLength allows 0 and negatives',
  ],
  [
    'weaponGroups: z.array(z.string().min(1)),',
    'z.string().min(1)',
    'z.string().max(1)',
    'a weapon group id may be empty',
  ],
  [
    "scoringModelSchema = z.enum(['rings', 'hits']);",
    "z.enum(['rings', 'hits'])",
    "z.enum(['rings', 'hits', 'points'])",
    'the scoring enum admits a model nothing implements',
  ],
  [
    'targetFace: z.string().min(1).optional(),\n    defaultSeriesLength',
    'z.string().min(1).optional()',
    'z.string().optional()',
    'targetFace may be empty',
  ],
  [
    "if (discipline.scoring === 'rings' && discipline.targetFace === undefined) {",
    "if (discipline.scoring === 'rings' && discipline.targetFace === undefined) {",
    'if (false) {',
    'a rings discipline may ship without a targetFace',
  ],
  [
    "if (discipline.scoring === 'hits' && discipline.targetFace !== undefined) {",
    "if (discipline.scoring === 'hits' && discipline.targetFace !== undefined) {",
    'if (false) {',
    'a hits discipline may claim a single targetFace',
  ],
  [
    "if (discipline.scoring === 'hits' && discipline.allowsDecimal) {",
    "if (discipline.scoring === 'hits' && discipline.allowsDecimal) {",
    'if (false) {',
    'a hits discipline may allow decimals',
  ],
  [
    "federationSchema = z.enum(['SPSF', 'ISSF', 'SvSF', 'generic']);",
    "z.enum(['SPSF', 'ISSF', 'SvSF', 'generic'])",
    "z.enum(['SPSF', 'ISSF', 'SvSF', 'generic', 'NRA'])",
    'federation enum admits an extra federation',
  ],
  [
    'programSchema = z.strictObject({',
    'z.strictObject({',
    'z.object({',
    'program accepts unknown keys',
  ],
  [
    'id: z.string().min(1),\n  disciplineId:',
    'z.string().min(1)',
    'z.string().max(1)',
    'program id allows the empty string',
  ],
  [
    'shotsPerSeries: z.int().positive(),',
    'z.int().positive()',
    'z.int()',
    'shotsPerSeries allows 0',
  ],
  [
    'structure: z\n    .strictObject({',
    '.strictObject({',
    '.object({',
    'program structure accepts unknown keys',
  ],
  ['sighterSeries: z.int().min(0)', 'z.int().min(0)', 'z.int()', 'sighterSeries allows negatives'],
  [
    '.array(\n          z.strictObject({',
    'z.strictObject({',
    'z.object({',
    'structure group accepts unknown keys',
  ],
  ['seriesCount: z.int().positive(),', 'z.int().positive()', 'z.int()', 'seriesCount allows 0'],
  [
    'timeLimitSeconds: z.int().positive()',
    'z.int().positive()',
    'z.int()',
    'timeLimitSeconds allows 0',
  ],
  [
    '        )\n        .min(1),\n    })\n    .optional(),',
    '.min(1)',
    '.min(0)',
    'a structure may declare zero groups',
  ],
]);
