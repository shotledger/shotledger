// Manual mutation testing for foreign-key enforcement and the pending table
// (docs/specs/phone-foreign-keys-spec.md). It lives in app/src/db, which
// Stryker's `mutate` list does not reach.
//
// FAILS CLOSED, on the same rules as manual-mutation-backup-sync.mjs: the
// unmutated suite must pass first; a pattern that does not match exactly once,
// a file that does not restore, a run with runner errors, or a run that fails
// without a failing test all exit nonzero.
//
// Run: node scripts/manual-mutation-foreign-keys.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const FK = 'app/src/db/foreign-keys.ts';
const STORE = 'app/src/db/queries/sync-store.ts';
const SOURCES = [FK, STORE];
const TESTS = [
  'app/src/db/foreign-keys.test.ts',
  'app/src/db/queries/sync-pending.test.ts',
  'app/src/db/queries/sync-pending.property.test.ts',
  'app/src/db/queries/sync-store.test.ts',
];

/** Each mutant is a plausible bug, not a syntactic tweak. */
const MUTANTS = [
  {
    name: 'FK1 any defined value passes the read-back',
    file: FK,
    find: '.foreign_keys === 1',
    replace: '.foreign_keys !== 0',
  },
  {
    name: 'FK3 foreign keys are never turned on',
    file: FK,
    find: 'PRAGMA foreign_keys = ON',
    replace: 'PRAGMA foreign_keys = OFF',
  },
  {
    name: 'FK3 the read-back is not checked',
    file: FK,
    find: '  checkForeignKeysOn(db.get<unknown>(sql`PRAGMA foreign_keys`));',
    replace: '  db.get<unknown>(sql`PRAGMA foreign_keys`);',
  },
  {
    name: 'FK3 the sweep is skipped at open',
    file: FK,
    find: '  const moved = sweepOrphanRows(db);',
    replace: '  const moved = 0;',
  },
  {
    name: 'AP1 a null foreign key counts as a missing parent',
    file: STORE,
    find: '    if (value === null || value === undefined) continue;\n',
    replace: '',
  },
  {
    name: 'AP2 a missing parent is ignored (orphans written, commit fails)',
    file: STORE,
    find: '    if (found === undefined) return true;',
    replace: '    if (found === undefined) return false;',
  },
  {
    name: 'AP2 a newer pending version does not replace the older',
    file: STORE,
    find: '      set: { payload },',
    replace: '      set: { tableName: change.tableName },',
  },
  {
    name: 'AP3/AP4 a written row or tombstone keeps its stale pending entry',
    file: STORE,
    find: '  dropPending(db, change.tableName, change.rowId);\n  applyOne(db, change);\n}',
    replace: '  applyOne(db, change);\n}',
  },
  {
    name: 'AP5 promotion runs children before parents',
    file: STORE,
    find: '.sort((a, b) => order(a.tableName) - order(b.tableName));',
    replace: '.sort((a, b) => order(b.tableName) - order(a.tableName));',
  },
  {
    name: 'AP5 promotion leaves the promoted entry behind',
    file: STORE,
    find: '    dropPending(db, change.tableName, change.rowId);\n    applyOne(db, change);\n  }\n}',
    replace: '    applyOne(db, change);\n  }\n}',
  },
  {
    name: 'AP6 a queued local edit is overwritten by its pending version',
    file: STORE,
    find: '      rowExists(db, change.tableName, change.rowId) &&',
    replace: '      false &&',
  },
  {
    name: 'FK7 the sweep moves a row with a queued edit (the edit is lost)',
    file: STORE,
    find: '        if (hasQueuedEdit(inner, tableName, rowId)) continue;\n',
    replace: '',
  },
  {
    name: 'FK7 the sweep moves rows of local-only tables',
    file: STORE,
    find: '        if (tableName === undefined) continue;\n',
    replace: '',
  },
  {
    name: 'FK7 the sweep runs one pass only (children stay dangling)',
    file: STORE,
    find: '      if (pass === 0) return;',
    replace: '      return;',
  },
  {
    name: 'FK7 the swept change loses its updated_at',
    file: STORE,
    find: '          updatedAt: row.updated_at as string,',
    replace: "          updatedAt: '',",
  },
  {
    name: 'a backup reset keeps the pending table',
    file: STORE,
    find: '    tx.delete(syncPendingRows).run();\n',
    replace: '',
  },
  {
    name: 'sign-out keeps the pending table',
    file: STORE,
    find: '  db.delete(syncPendingRows).run();\n',
    replace: '',
  },
];

/** Runs the suite; returns 'pass', 'fail' (a test failed) or 'error'. */
function runSuite() {
  try {
    execFileSync('npx', ['vitest', 'run', ...TESTS], { encoding: 'utf8', stdio: 'pipe' });
    return 'pass';
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    // A runner error (Vitest's "Errors" summary line) is never a kill, even
    // when a test failed too.
    if (/^\s*Errors\s+\d+/m.test(output)) return 'error';
    return /Tests\s+\d+ failed/.test(output) ? 'fail' : 'error';
  }
}

function assertClean() {
  const dirty = execFileSync('git', ['status', '--porcelain', '--', ...SOURCES], {
    encoding: 'utf8',
  }).trim();
  if (dirty) {
    console.error(`FAIL: ${SOURCES.join(', ')} not committed and pristine:\n${dirty}`);
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
  const original = readFileSync(mutant.file, 'utf8');
  const occurrences = original.split(mutant.find).length - 1;
  if (occurrences !== 1) {
    console.error(
      `FAIL: mutant "${mutant.name}" matched ${occurrences} times (expected exactly 1). ` +
        'The source moved; fix the mutant rather than trusting this run.',
    );
    process.exit(1);
  }

  writeFileSync(mutant.file, original.replace(mutant.find, mutant.replace));
  let result;
  try {
    result = runSuite();
  } finally {
    writeFileSync(mutant.file, original);
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
