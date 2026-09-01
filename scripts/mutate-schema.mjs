#!/usr/bin/env node
// Manual mutation runner for shared/src/disciplines/schema.ts.
//
// Why it exists: the zod schemas are built at module load, so Stryker's
// vitest runner cannot activate mutants in them once the module is cached
// (stryker.config.json sets `ignoreStatic`). This runner mutates the FILE ON
// DISK instead, so each mutant is really in effect when the suite re-imports
// the module.
//
// Fail-closed by construction: a mutant whose search text is not found is a
// hard error (an unapplied mutant would otherwise be reported as "survived"
// and mislead the report), any surviving mutant exits 1, and the original
// file is restored in a finally block.
//
// Run: node scripts/mutate-schema.mjs   (or `pnpm mutation:schema`)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'shared/src/disciplines/schema.ts';
const TEST = 'shared/src/disciplines';

/** [1-based line, search text, replacement, description] */
const MUTANTS = [
  [7, 'z.strictObject({', 'z.object({', 'localizedName accepts unknown keys'],
  [8, 'z.string().min(1)', 'z.string().max(1)', 'localized sv name allows the empty string'],
  [16, 'z.strictObject({', 'z.object({', 'discipline accepts unknown keys'],
  [17, 'z.string().min(1)', 'z.string().max(1)', 'discipline id allows the empty string'],
  [22, 'z.int().positive()', 'z.int()', 'defaultSeriesLength allows 0 and negatives'],
  [26, 'z.string().min(1)', 'z.string().max(1)', 'a weapon group id may be empty'],
  [23, "z.literal('rings')", "z.literal('')", 'scoring literal is wrong'],
  [
    12,
    "z.enum(['SPSF', 'ISSF', 'generic'])",
    "z.enum(['SPSF', 'ISSF', 'generic', 'NRA'])",
    'federation enum admits an extra federation',
  ],
  [35, 'z.strictObject({', 'z.object({', 'program accepts unknown keys'],
  [36, 'z.string().min(1)', 'z.string().max(1)', 'program id allows the empty string'],
  [40, 'z.int().positive()', 'z.int()', 'shotsPerSeries allows 0'],
  [44, '.strictObject({', '.object({', 'program structure accepts unknown keys'],
  [45, 'z.int().min(0)', 'z.int()', 'sighterSeries allows negatives'],
  [48, 'z.strictObject({', 'z.object({', 'structure group accepts unknown keys'],
  [49, 'z.int().positive()', 'z.int()', 'seriesCount allows 0'],
  [50, 'z.int().positive()', 'z.int()', 'timeLimitSeconds allows 0'],
  [53, '.min(1)', '.min(0)', 'a structure may declare zero groups'],
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
