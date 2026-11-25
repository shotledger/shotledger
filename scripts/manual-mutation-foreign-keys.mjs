// Manual mutation testing for the phone's foreign-key pin
// (docs/specs/phone-foreign-keys-spec.md). It lives in app/src/db, which
// Stryker's `mutate` list does not reach.
//
// FAILS CLOSED, on the same rules as manual-mutation-backup-sync.mjs: the
// unmutated suite must pass first; a pattern that does not match exactly once,
// a file that does not restore, or a run that fails without a failing test all
// exit nonzero.
//
// Run: node scripts/manual-mutation-foreign-keys.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'app/src/db/foreign-keys.ts';
const TESTS = ['app/src/db/foreign-keys.test.ts', 'app/src/db/queries/sync-store.test.ts'];

/** Each mutant is a plausible bug, not a syntactic tweak. */
const MUTANTS = [
  {
    name: 'the sync pin only reads, never sets',
    find: '  conn.execSync(SET_OFF);\n',
    replace: '',
  },
  {
    name: 'the async pin only reads, never sets',
    find: '  await conn.execAsync(SET_OFF);\n',
    replace: '',
  },
  {
    name: 'the pin turns foreign keys on',
    find: "const SET_OFF = 'PRAGMA foreign_keys = OFF';",
    replace: "const SET_OFF = 'PRAGMA foreign_keys = ON';",
  },
  {
    name: 'the sync pin never checks the read-back',
    find: '  checkForeignKeysOff(conn.getFirstSync(READ));',
    replace: '  conn.getFirstSync(READ);',
  },
  {
    name: 'the async pin never checks the read-back',
    find: '  checkForeignKeysOff(await conn.getFirstAsync(READ));',
    replace: '  await conn.getFirstAsync(READ);',
  },
  {
    name: 'foreign keys on passes the check',
    find: '.foreign_keys === 0) return;',
    replace: '.foreign_keys !== undefined) return;',
  },
  {
    name: 'only an explicit 1 fails (fail-open on odd answers)',
    find: '.foreign_keys === 0) return;',
    replace: '.foreign_keys !== 1) return;',
  },
  {
    name: 'no row (no foreign-key support) is treated as on',
    find: '  if (row === null) return;\n',
    replace: '',
  },
  {
    name: 'an unreadable answer passes',
    find: '  throw new Error(ON_ERROR);\n}',
    replace: '  return;\n}',
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
  const dirty = execFileSync('git', ['status', '--porcelain', '--', SOURCE], {
    encoding: 'utf8',
  }).trim();
  if (dirty) {
    console.error(`FAIL: ${SOURCE} is not committed and pristine:\n${dirty}`);
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
  const original = readFileSync(SOURCE, 'utf8');
  const occurrences = original.split(mutant.find).length - 1;
  if (occurrences !== 1) {
    console.error(
      `FAIL: mutant "${mutant.name}" matched ${occurrences} times (expected exactly 1). ` +
        'The source moved; fix the mutant rather than trusting this run.',
    );
    process.exit(1);
  }

  writeFileSync(SOURCE, original.replace(mutant.find, mutant.replace));
  let result;
  try {
    result = runSuite();
  } finally {
    writeFileSync(SOURCE, original);
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
