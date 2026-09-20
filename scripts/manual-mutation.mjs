// Manual mutation testing for shared/src/json-export.
//
// Why this exists: `pnpm mutation` (Stryker) reports a 0.00 score and kills
// nothing since vitest was bumped to 5.0.0 in #144 — on `main` as well as on
// any branch, for every module, not just this one. A mutation layer that
// cannot activate a mutant is not a layer, so this substitutes for it here
// until Stryker's vitest runner is fixed.
//
// FAILS CLOSED, deliberately. Every way this can go wrong — a pattern that no
// longer matches, a file that will not restore, a test run that cannot be
// launched — exits nonzero. A mutation checker that fails open is worse than
// none, because it reports a kill it never observed.
//
// Run: node scripts/manual-mutation.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

/** Each mutant is a plausible bug, not a syntactic tweak. */
const MUTANTS = [
  {
    name: 'accepts a file from a newer app instead of refusing it',
    file: 'shared/src/json-export/import.ts',
    find: 'if (envelope.data.formatVersion > JSON_EXPORT_VERSION) {',
    replace: 'if (false) {',
  },
  {
    name: 'refuses files written by this very version',
    file: 'shared/src/json-export/import.ts',
    find: 'if (envelope.data.formatVersion > JSON_EXPORT_VERSION) {',
    replace: 'if (envelope.data.formatVersion >= JSON_EXPORT_VERSION) {',
  },
  {
    name: 'a session that fails validation is imported anyway',
    file: 'shared/src/json-export/import.ts',
    find: '    if (parsed.success) {',
    replace: '    if (true) {',
  },
  {
    name: 'a skipped session is reported with an empty reason',
    file: 'shared/src/json-export/import.ts',
    find: "issue.path.join('.') || 'session'",
    replace: "issue.path.join('.')",
  },
  {
    name: 'stamps the wrong format version on every export',
    file: 'shared/src/json-export/export.ts',
    find: 'formatVersion: JSON_EXPORT_VERSION,',
    replace: 'formatVersion: JSON_EXPORT_VERSION + 1,',
  },
  {
    name: 'stamps an unrecognizable format id',
    file: 'shared/src/json-export/export.ts',
    find: 'format: JSON_EXPORT_FORMAT,',
    replace: "format: 'shotledger.something-else',",
  },
  {
    name: 'plans an existing session as create, duplicating it',
    file: 'shared/src/json-export/plan.ts',
    find: "index.sessionIds.has(group.sessionId) ? 'update' : 'create'",
    replace: "'create'",
  },
  {
    name: 'counts series instead of shots in the dry run',
    file: 'shared/src/json-export/plan.ts',
    find: 'group.series.reduce((sum, s) => sum + s.shots.length, 0)',
    replace: 'group.series.length',
  },
];

const TESTS = ['shared/src/json-export', 'app/src/db/json-export'];

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe' });
}

/**
 * Only the files this script edits have to be pristine. Scoping it to those
 * keeps the guard meaningful (a mutant left behind is caught) without
 * refusing to run because a test file is mid-edit — which is exactly when
 * you most want to rerun mutation.
 */
const MUTATED_FILES = [...new Set(MUTANTS.map((m) => m.file))];

function assertClean() {
  const dirty = run('git', ['status', '--porcelain', '--', ...MUTATED_FILES]).trim();
  if (dirty) {
    console.error(`FAIL: a mutated source file is not pristine:\n${dirty}`);
    process.exit(1);
  }
}

assertClean();

let killed = 0;
const survivors = [];

for (const mutant of MUTANTS) {
  const original = readFileSync(mutant.file, 'utf8');
  const occurrences = original.split(mutant.find).length - 1;
  if (occurrences !== 1) {
    console.error(
      `FAIL: mutant "${mutant.name}" matched its pattern ${occurrences} times in ${mutant.file} (expected exactly 1). ` +
        `The source moved; fix the mutant rather than trusting this run.`,
    );
    process.exit(1);
  }

  writeFileSync(mutant.file, original.replace(mutant.find, mutant.replace));

  let testsFailed;
  try {
    run('npx', ['vitest', 'run', ...TESTS]);
    testsFailed = false;
  } catch {
    testsFailed = true;
  } finally {
    writeFileSync(mutant.file, original);
  }

  // Restoration is verified, not assumed: a mutant left in the tree would
  // poison every later result and the final commit.
  assertClean();

  if (testsFailed) {
    killed += 1;
    console.log(`killed:   ${mutant.name}`);
  } else {
    survivors.push(mutant.name);
    console.log(`SURVIVED: ${mutant.name}`);
  }
}

console.log(`\n${killed}/${MUTANTS.length} mutants killed`);
if (survivors.length > 0) {
  console.error(`FAIL: ${survivors.length} survived:\n  ${survivors.join('\n  ')}`);
  process.exit(1);
}
