#!/usr/bin/env node
// Manual mutation runner for shared/src/integrations/webshooter/api/schemas.ts.
// Mirrors scripts/mutate-schema.mjs: the zod schemas are built at module
// load, so Stryker's vitest runner cannot activate mutants in them once the
// module is cached (stryker.config.json sets `ignoreStatic`). This runner
// mutates the FILE ON DISK instead, so each mutant is really in effect when
// the suite re-imports the module.
//
// Fail-closed by construction: a mutant whose search text is not found is a
// hard error (an unapplied mutant would otherwise be reported as "survived"
// and mislead the report), any surviving mutant exits 1, and the original
// file is restored in a finally block.
//
// Run: node scripts/mutate-webshooter-schema.mjs   (or `pnpm mutation:webshooter-schema`)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'shared/src/integrations/webshooter/api/schemas.ts';
const TEST = 'shared/src/integrations/webshooter/api/schemas.test.ts';

/** [1-based line, search text, replacement, description] */
const MUTANTS = [
  [
    11,
    'id: z.number(),',
    'id: z.string(),',
    'weaponClassSchema.id accepts a string instead of a number',
  ],
  [
    22,
    'finals: z.union([z.literal(0), z.literal(1)]),',
    'finals: z.union([z.literal(0), z.literal(1), z.literal(2)]),',
    'stationResultSchema.finals admits an extra literal (2)',
  ],
  [
    29,
    'deleted_at: z.string().nullable(),',
    'deleted_at: z.string(),',
    'stationResultSchema.deleted_at loses its nullable() (real payloads send null)',
  ],
  [
    43,
    'shooting_card_number: z.string().nullable(),',
    'shooting_card_number: z.string(),',
    'userSchema.shooting_card_number loses its nullable()',
  ],
  [
    72,
    "std_medal: z.enum(['B', 'S']).nullable(),",
    "std_medal: z.enum(['B', 'S', 'G']).nullable(),",
    'resultRowSchema.std_medal admits an unmodeled code (G)',
  ],
  [
    87,
    ".enum(['precision', 'field', 'military', 'pointfield'])",
    ".enum(['precision', 'field', 'military'])",
    'competitionResultsTypeSchema loses the pointfield member',
  ],
  [
    98,
    'status: z.string(),',
    'status: z.number(),',
    'competitionSchema.status accepts a number instead of a string',
  ],
  [
    104,
    'competitions: competitionSchema,',
    'competitions: z.array(competitionSchema),',
    'competitionDetailResponseSchema.competitions becomes an array (the list envelope shape, not the detail one)',
  ],
  [
    116,
    'total: z.number(),',
    'total: z.string(),',
    'competitionsResponseSchema.competitions.total accepts a string instead of a number',
  ],
  [
    126,
    'patrol_size: z.number(),',
    'patrol_size: z.string(),',
    'patrolSchema.patrol_size accepts a string instead of a number',
  ],
  [
    150,
    'fullname: z.string().optional(),',
    'fullname: z.string(),',
    'authUserSchema.fullname loses its optional()',
  ],
];

const original = readFileSync(FILE, 'utf8');
const survivors = [];

try {
  for (const [line, from, to, description] of MUTANTS) {
    const lines = original.split('\n');
    const index = line - 1;
    const source = lines[index];
    if (source === undefined || !source.includes(from)) {
      throw new Error(
        `Mutant "${description}" did not apply: ${FILE}:${line} does not contain ${JSON.stringify(from)}. ` +
          `Got: ${JSON.stringify(source)}. Fix the mutant list — an unapplied mutant must never be reported as killed.`,
      );
    }
    lines[index] = source.replace(from, to);
    writeFileSync(FILE, lines.join('\n'));

    let killed;
    try {
      execFileSync('pnpm', ['exec', 'vitest', 'run', TEST], { stdio: 'ignore' });
      killed = false;
    } catch {
      killed = true;
    }
    console.log(`${killed ? 'KILLED  ' : 'SURVIVED'}  ${FILE}:${line} — ${description}`);
    if (!killed) survivors.push(`${FILE}:${line} — ${description}`);
  }
} finally {
  writeFileSync(FILE, original);
}

console.log(`\n${MUTANTS.length - survivors.length}/${MUTANTS.length} mutants killed.`);
if (survivors.length > 0) {
  console.error(`\nSurviving mutants:\n  ${survivors.join('\n  ')}`);
  process.exit(1);
}
