// Manual mutation testing for the sync push path (backend/src/db/queries.ts
// and backend/src/routes/sync.ts; docs/specs/sync-push-atomicity-spec.md §8,
// sync-payload-validation-spec.md §7). Stryker runs in the root Node
// vitest pool and cannot reach code that only runs in workerd.
//
// FAILS CLOSED. The unmutated suite must pass first; a mutant whose pattern
// does not match exactly once, a file that does not restore, or a run that
// fails without a failing test (a compile or transform error is not a kill)
// all exit nonzero.
//
// Run: node scripts/manual-mutation-sync-push.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'backend/src/db/queries.ts';
const ROUTE = 'backend/src/routes/sync.ts';

/** Each mutant is a plausible bug, not a syntactic tweak. */
const MUTANTS = [
  {
    name: 'a duplicate bumps the seq counter',
    find: 'SELECT ${userId}, 1 WHERE ${notDuplicate} AND ${ok}',
    replace: 'SELECT ${userId}, 1 WHERE ${ok}',
  },
  {
    name: 'a rejected change bumps the seq counter',
    find: 'SELECT ${userId}, 1 WHERE ${notDuplicate} AND ${ok}',
    replace: 'SELECT ${userId}, 1 WHERE ${notDuplicate}',
  },
  {
    name: 'a duplicate rewrites the row',
    find: '${deletedAt}\n          WHERE ${notDuplicate} AND ${ok}',
    replace: '${deletedAt}\n          WHERE ${ok}',
  },
  {
    name: 'a live edit resurrects a tombstone',
    find: '${deletedAt}\n          WHERE ${notDuplicate} AND ${ok}',
    replace: '${deletedAt}\n          WHERE ${notDuplicate}',
  },
  {
    name: 'applied and rejected are swapped in the record',
    find: "THEN 'applied' ELSE 'rejected' END",
    replace: "THEN 'rejected' ELSE 'applied' END",
  },
  {
    name: 'the tombstone test looks for live rows',
    find: 'AND deleted_at IS NOT NULL))',
    replace: 'AND deleted_at IS NULL))',
  },
  {
    name: 'a delete over a live row leaves it live',
    find: '          deletedAt: sql`excluded.deleted_at`,\n',
    replace: '',
  },
  {
    name: 'an update keeps the old seq, below the pullers cursor',
    find: 'seq: sql`excluded.seq`',
    replace: 'seq: sql`sync_rows.seq`',
  },
  {
    name: 'the ack reports a seq one past the row',
    find: 'CASE WHEN ${ok} THEN ${lastSeq} END',
    replace: 'CASE WHEN ${ok} THEN ${lastSeq} + 1 END',
  },
  {
    name: 'duplicates are not detected from the pre-read',
    find: 'const before = (results[base] as IdempotencyRecord[])[0];',
    replace: 'const before = undefined as IdempotencyRecord | undefined;',
  },
  {
    name: 'the batch is split back into separately awaited statements',
    find: 'const results = (await db.batch([first, ...rest])) as unknown[];',
    replace:
      'const results: unknown[] = [];\n  for (const statement of [first, ...rest]) results.push(await statement);',
  },
  {
    name: 'a delete is stored with its payload',
    find: 'deletedAt === null && change.payload != null ? JSON.stringify(change.payload) : null',
    replace: "deletedAt === null && change.payload != null ? JSON.stringify(change.payload) : '{}'",
  },
  // sync-payload-validation-spec.md: the payload verdict inside the batch.
  {
    name: 'the batch ignores the payload verdict',
    find: 'const ok = sql`(${valid ? 1 : 0} = 1 AND ${notTombstoned})`;',
    replace: 'const ok = notTombstoned;',
  },
  {
    name: 'an invalid payload is reported as tombstoned',
    find: 'WHEN ${notTombstoned} THEN ${REJECTED_INVALID_PAYLOAD}',
    replace: 'WHEN ${notTombstoned} THEN ${REJECTED_TOMBSTONED}',
  },
  {
    name: 'an invalid payload outranks a tombstone',
    find: 'WHEN ${notTombstoned} THEN ${REJECTED_INVALID_PAYLOAD}\n            ELSE ${REJECTED_TOMBSTONED} END',
    replace:
      'WHEN ${valid ? 0 : 1} = 1 THEN ${REJECTED_INVALID_PAYLOAD}\n            ELSE ${REJECTED_TOMBSTONED} END',
  },
  {
    name: 'applyPush marks every change valid',
    find: 'changeStatements(db, userId, change, !invalid.has(index)),',
    replace: 'changeStatements(db, userId, change, true),',
  },
  {
    name: 'the route does not pass its verdicts on',
    file: ROUTE,
    find: 'applyPush(db, userId, parsed.data.changes, invalid)',
    replace: 'applyPush(db, userId, parsed.data.changes)',
  },
  {
    name: 'the route logs the payload',
    file: ROUTE,
    find: "(${columns.join(', ')})`",
    replace: '(${JSON.stringify(change)})`',
  },
];

const TESTS = [
  'test/sync-concurrency.spec.ts',
  'test/sync.spec.ts',
  'test/sync-client.spec.ts',
  'test/sync-payload-validation.spec.ts',
];

/** Runs the backend sync suites; returns 'pass', 'fail' (a test failed) or 'error'. */
function runSuite() {
  try {
    execFileSync('npx', ['vitest', 'run', ...TESTS], {
      cwd: 'backend',
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return 'pass';
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    return /Tests\s+\d+ failed/.test(output) ? 'fail' : 'error';
  }
}

const dirty = execFileSync('git', ['status', '--porcelain', '--', FILE, ROUTE], {
  encoding: 'utf8',
}).trim();
if (dirty) {
  console.error(`FAIL: the files under mutation are not committed:\n${dirty}`);
  process.exit(1);
}

const pristine = new Map([FILE, ROUTE].map((file) => [file, readFileSync(file, 'utf8')]));

function assertClean() {
  for (const [file, text] of pristine) {
    if (readFileSync(file, 'utf8') !== text) {
      console.error(`FAIL: ${file} was not restored.`);
      process.exit(1);
    }
  }
}

const baseline = runSuite();
if (baseline !== 'pass') {
  console.error(`FAIL: the unmutated suite did not pass (${baseline}); no mutant can be judged.`);
  process.exit(1);
}
console.log('baseline: unmutated suite passes');

let killed = 0;
const survivors = [];

for (const mutant of MUTANTS) {
  const file = mutant.file ?? FILE;
  const original = pristine.get(file);
  const occurrences = original.split(mutant.find).length - 1;
  if (occurrences !== 1) {
    console.error(
      `FAIL: mutant "${mutant.name}" matched ${occurrences} times (expected exactly 1). ` +
        'The source moved; fix the mutant rather than trusting this run.',
    );
    process.exit(1);
  }

  writeFileSync(file, original.replace(mutant.find, mutant.replace));
  let result;
  try {
    result = runSuite();
  } finally {
    writeFileSync(file, original);
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
