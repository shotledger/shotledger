// Manual mutation testing for the sync-bookkeeping reset a backup and a restore
// run (docs/specs/backup-sync-bookkeeping-spec.md). It lives in app/src/db,
// which Stryker's `mutate` list does not reach.
//
// FAILS CLOSED, on the same rules as manual-mutation-sync-tags-settings.mjs:
// the unmutated suite must pass first; a pattern that does not match exactly
// once, a file that does not restore, or a run that fails without a failing
// test all exit nonzero.
//
// Run: node scripts/manual-mutation-backup-sync.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const STORE = 'app/src/db/queries/sync-store.ts';
const TESTS = [
  'app/src/db/queries/sync-store.test.ts',
  'app/src/db/backup/sync-bookkeeping.test.ts',
];

const CONTROL_UPSERT =
  'tx.insert(syncControl)\n' +
  '      .values({ id: 0, applying: 0, lastRev: 0 })\n' +
  '      .onConflictDoUpdate({ target: syncControl.id, set: { applying: 0, lastRev: 0 } })\n' +
  '      .run();';

/** Each mutant is a plausible bug, not a syntactic tweak. */
const MUTANTS = [
  {
    name: 'a queued edit is kept and replayed after a restore',
    find: '    tx.delete(syncOutbox).run();\n',
    replace: '',
  },
  {
    name: "another account's cursors are kept",
    find: '    tx.delete(syncState).run();\n',
    replace: '',
  },
  {
    name: "the exporting device's photo uploads are kept",
    find: '    tx.delete(photoQueue).run();\n',
    replace: '',
  },
  {
    name: 'sync_control is deleted, so the triggers stop queueing edits',
    find: CONTROL_UPSERT,
    replace: 'tx.delete(syncControl).run();',
  },
  {
    name: 'a missing sync_control row is not recreated',
    find: CONTROL_UPSERT,
    replace:
      'tx.update(syncControl).set({ applying: 0, lastRev: 0 }).where(eq(syncControl.id, 0)).run();',
  },
  {
    name: 'applying is left as the bundle had it',
    find: 'set: { applying: 0, lastRev: 0 } })',
    replace: 'set: { lastRev: 0 } })',
  },
  {
    name: 'last_rev is left as the bundle had it',
    find: 'set: { applying: 0, lastRev: 0 } })',
    replace: 'set: { applying: 0 } })',
  },
];

/** Runs the suite; returns 'pass', 'fail' (a test failed) or 'error'. */
function runSuite() {
  try {
    execFileSync('npx', ['vitest', 'run', ...TESTS], { encoding: 'utf8', stdio: 'pipe' });
    return 'pass';
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    return /Tests\s+\d+ failed/.test(output) ? 'fail' : 'error';
  }
}

function assertClean() {
  const dirty = execFileSync('git', ['status', '--porcelain', '--', STORE], {
    encoding: 'utf8',
  }).trim();
  if (dirty) {
    console.error(`FAIL: ${STORE} is not committed and pristine:\n${dirty}`);
    process.exit(1);
  }
}

assertClean();
const baseline = runSuite();
if (baseline !== 'pass') {
  console.error(`FAIL: the unmutated suite did not pass (${baseline}).`);
  process.exit(1);
}
console.log('baseline: unmutated suite passes');

let killed = 0;
const survivors = [];

for (const mutant of MUTANTS) {
  const original = readFileSync(STORE, 'utf8');
  const occurrences = original.split(mutant.find).length - 1;
  if (occurrences !== 1) {
    console.error(
      `FAIL: mutant "${mutant.name}" matched ${occurrences} times (expected exactly 1). ` +
        'The source moved; fix the mutant rather than trusting this run.',
    );
    process.exit(1);
  }

  writeFileSync(STORE, original.replace(mutant.find, mutant.replace));
  let result;
  try {
    result = runSuite();
  } finally {
    writeFileSync(STORE, original);
  }
  assertClean();

  if (result === 'error') {
    console.error(`FAIL: mutant "${mutant.name}" broke the run without failing a test.`);
    process.exit(1);
  }
  if (result === 'fail') {
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
