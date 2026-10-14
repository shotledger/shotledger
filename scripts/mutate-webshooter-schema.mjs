#!/usr/bin/env node
// Manual mutation runner for shared/src/integrations/webshooter/api/schemas.ts.
// Mirrors scripts/mutate-schema.mjs: the zod schemas are built at module
// load, so Stryker's vitest runner cannot activate mutants in them once the
// module is cached (stryker.config.json sets `ignoreStatic`). This runner
// mutates the FILE ON DISK instead, so each mutant is really in effect when
// the suite re-imports the module. Mutants are addressed by text;
// scripts/lib/zod-file-mutants.mjs fails closed when one does not apply.
//
// Run: node scripts/mutate-webshooter-schema.mjs   (or `pnpm mutation:webshooter-schema`)
import { runZodFileMutants } from './lib/zod-file-mutants.mjs';

/** [unique context, search text inside it, replacement, description] */
runZodFileMutants(
  'shared/src/integrations/webshooter/api/schemas.ts',
  'shared/src/integrations/webshooter/api/schemas.test.ts',
  [
    [
      'weaponClassSchema = z.object({\n  id: z.number(),',
      'id: z.number(),',
      'id: z.string(),',
      'weaponClassSchema.id accepts a string instead of a number',
    ],
    [
      'signups_id: z.number(),\n  finals: z.union([z.literal(0), z.literal(1)]),',
      'finals: z.union([z.literal(0), z.literal(1)]),',
      'finals: z.union([z.literal(0), z.literal(1), z.literal(2)]),',
      'stationResultSchema.finals admits an extra literal (2)',
    ],
    [
      'station_figure_hits: z.unknown(),\n  deleted_at: z.string().nullable(),',
      'deleted_at: z.string().nullable(),',
      'deleted_at: z.string(),',
      'stationResultSchema.deleted_at loses its nullable() (real payloads send null)',
    ],
    [
      'fullname: z.string(),\n  shooting_card_number: z.string().nullable(),',
      'shooting_card_number: z.string().nullable(),',
      'shooting_card_number: z.string(),',
      'userSchema.shooting_card_number loses its nullable()',
    ],
    [
      "std_medal: z.enum(['B', 'S']).nullable(),",
      "std_medal: z.enum(['B', 'S']).nullable(),",
      "std_medal: z.enum(['B', 'S', 'G']).nullable(),",
      'resultRowSchema.std_medal admits an unmodeled code (G)',
    ],
    [
      ".enum(['precision', 'field', 'military', 'pointfield'])",
      ".enum(['precision', 'field', 'military', 'pointfield'])",
      ".enum(['precision', 'field', 'military'])",
      'competitionResultsTypeSchema loses the pointfield member',
    ],
    [
      'contact_venue: z.string(),\n  status: z.string(),',
      'status: z.string(),',
      'status: z.number(),',
      'competitionSchema.status accepts a number instead of a string',
    ],
    [
      'competitionDetailResponseSchema = z.object({\n  competitions: competitionSchema,',
      'competitions: competitionSchema,',
      'competitions: z.array(competitionSchema),',
      'competitionDetailResponseSchema.competitions becomes an array (the list envelope shape, not the detail one)',
    ],
    [
      'total: z.number(),',
      'total: z.number(),',
      'total: z.string(),',
      'competitionsResponseSchema.competitions.total accepts a string instead of a number',
    ],
    [
      'patrol_size: z.number(),',
      'patrol_size: z.number(),',
      'patrol_size: z.string(),',
      'patrolSchema.patrol_size accepts a string instead of a number',
    ],
    [
      'fullname: z.string().optional(),',
      'fullname: z.string().optional(),',
      'fullname: z.string(),',
      'authUserSchema.fullname loses its optional()',
    ],
  ],
);
