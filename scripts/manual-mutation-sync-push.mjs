// Manual mutation testing for the sync push path (backend/src/db/queries.ts
// and backend/src/routes/sync.ts; docs/specs/sync-push-atomicity-spec.md §8,
// sync-payload-validation-spec.md §7, sync-family-refusal-spec.md §11) and
// the phone's refusal marks (app/src/db/queries/sync-store.ts, §11.6).
// Stryker runs in the root Node vitest pool and cannot reach code that only
// runs in workerd, nor the app's jest suite.
//
// FAILS CLOSED. The unmutated suites must pass first; a mutant whose pattern
// does not match exactly once, a file that does not restore, or a run that
// fails without a failing test (a compile or transform error is not a kill)
// all exit nonzero.
//
// Run: node scripts/manual-mutation-sync-push.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'backend/src/db/queries.ts';
const ROUTE = 'backend/src/routes/sync.ts';
const STORE = 'app/src/db/queries/sync-store.ts';

/** Each mutant is a plausible bug, not a syntactic tweak. */
const MUTANTS = [
  {
    name: 'a duplicate bumps the seq counter',
    find: '.where(sql`${syncSequence.userId} = ${userId} AND ${notDuplicate} AND ${ok}`)',
    replace: '.where(sql`${syncSequence.userId} = ${userId} AND ${ok}`)',
  },
  {
    name: 'a rejected change bumps the seq counter',
    find: '.where(sql`${syncSequence.userId} = ${userId} AND ${notDuplicate} AND ${ok}`)',
    replace: '.where(sql`${syncSequence.userId} = ${userId} AND ${notDuplicate}`)',
  },
  {
    name: 'a duplicate rewrites the row',
    find: '${deletedAt}, ${arrival}\n          WHERE ${notDuplicate} AND ${ok}',
    replace: '${deletedAt}, ${arrival}\n          WHERE ${ok}',
  },
  {
    name: 'a live edit resurrects a tombstone',
    find: '${deletedAt}, ${arrival}\n          WHERE ${notDuplicate} AND ${ok}',
    replace: '${deletedAt}, ${arrival}\n          WHERE ${notDuplicate}',
  },
  {
    name: 'the stored row does not keep its arrival',
    find: '${deletedAt}, ${arrival}\n          WHERE',
    replace: '${deletedAt}, 0\n          WHERE',
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
    find: '          WHERE ${notDuplicate} AND ${ok}`,\n      )\n      .onConflictDoUpdate({\n        target: [syncRows.userId, syncRows.tableName, syncRows.rowId],\n        set: {\n          seq: sql`excluded.seq`,\n          payload: sql`excluded.payload`,\n          updatedAt: sql`excluded.updated_at`,\n          deletedAt: sql`excluded.deleted_at`,\n',
    replace:
      '          WHERE ${notDuplicate} AND ${ok}`,\n      )\n      .onConflictDoUpdate({\n        target: [syncRows.userId, syncRows.tableName, syncRows.rowId],\n        set: {\n          seq: sql`excluded.seq`,\n          payload: sql`excluded.payload`,\n          updatedAt: sql`excluded.updated_at`,\n',
  },
  {
    name: 'an update keeps the old seq, below the pullers cursor',
    find: '          WHERE ${notDuplicate} AND ${ok}`,\n      )\n      .onConflictDoUpdate({\n        target: [syncRows.userId, syncRows.tableName, syncRows.rowId],\n        set: {\n          seq: sql`excluded.seq`,',
    replace:
      '          WHERE ${notDuplicate} AND ${ok}`,\n      )\n      .onConflictDoUpdate({\n        target: [syncRows.userId, syncRows.tableName, syncRows.rowId],\n        set: {\n          seq: sql`sync_rows.seq`,',
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
    find: 'const results = (await db.batch([first!, ...rest])) as unknown[];',
    replace:
      'const results: unknown[] = [];\n  for (const statement of [first!, ...rest]) results.push(await statement);',
  },
  {
    name: 'a delete is stored with its payload',
    find: 'deletedAt === null && change.payload != null ? JSON.stringify(change.payload) : null',
    replace: "deletedAt === null && change.payload != null ? JSON.stringify(change.payload) : '{}'",
  },
  // sync-payload-validation-spec.md: the payload verdict inside the batch.
  {
    name: 'the batch ignores the verdict',
    find: 'const ok = sql`(${reason} IS NULL AND ${notTombstoned})`;',
    replace: 'const ok = notTombstoned;',
  },
  {
    name: 'an invalid payload is reported as tombstoned',
    find: 'WHEN ${notTombstoned} THEN ${reason}',
    replace: 'WHEN ${notTombstoned} THEN ${REJECTED_TOMBSTONED}',
  },
  {
    name: 'an invalid payload outranks a tombstone',
    find: 'WHEN ${notTombstoned} THEN ${reason}\n            ELSE ${REJECTED_TOMBSTONED} END',
    replace:
      'WHEN ${reason} IS NOT NULL THEN ${reason}\n            ELSE ${REJECTED_TOMBSTONED} END',
  },
  {
    name: 'the batch records every refusal as invalid_payload',
    find: 'WHEN ${notTombstoned} THEN ${reason}',
    replace: 'WHEN ${notTombstoned} THEN ${REJECTED_INVALID_PAYLOAD}',
  },
  // sync-family-refusal-spec.md §11.4: the judge's verdict reaches the batch.
  {
    name: 'the batch is given no verdict',
    find: 'changeStatements(db, userId, change, plan.verdicts[i]!, plan.arrival)',
    replace: "changeStatements(db, userId, change, { kind: 'applied' }, plan.arrival)",
  },
  {
    name: 'a family refusal is reported as invalid_payload',
    find: 'const reason = refusalOf(verdict);',
    replace: 'const reason = refusalOf(verdict) && REJECTED_INVALID_PAYLOAD;',
  },
  {
    name: 'an invalid change is reported as family_refused',
    find: 'const reason = refusalOf(verdict);',
    replace: 'const reason = refusalOf(verdict) && REJECTED_FAMILY;',
  },
  {
    name: 'the route does not pass the validator verdicts on',
    file: ROUTE,
    find: '{ invalid, revalidate: stillValid }',
    replace: '{ revalidate: stillValid }',
  },
  // §11.8: the snapshot guard and its retries.
  {
    name: 'the guard never fails',
    find: 'CASE WHEN ${syncSequence.stateRev} = ${stateRev} THEN ${syncSequence.stateRev} + 1 END',
    replace: '${syncSequence.stateRev} + 1',
  },
  {
    name: 'a guard failure is not retried',
    find: 'if (!isGuardFailure(error)) throw error;',
    replace: 'throw error;',
  },
  {
    name: 'a guard failure is retried once only',
    find: 'attempt <= PUSH_RETRIES;',
    replace: 'attempt <= 1;',
  },
  {
    name: 'the busy answer is not a 503',
    file: ROUTE,
    find: "      if (error instanceof PushBusyError) return c.json({ error: 'busy' }, 503);\n",
    replace: '',
  },
  // §11.3, §11.5: the records follow the push.
  {
    name: 'an applied change leaves its record',
    find: '.where(sql`${thisRow} AND ${notDuplicate} AND ${ok}`)',
    replace: '.where(sql`false`)',
  },
  {
    name: 'a duplicate rewrites the record',
    find: 'WHERE ${notDuplicate} AND ${notTombstoned}`,',
    replace: 'WHERE ${notTombstoned}`,',
  },
  {
    name: 'a waiting record keeps no payload',
    find: '${reason === REJECTED_FAMILY ? payload : null},',
    replace: '${null},',
  },
  {
    name: 'the record keeps no arrival of its own',
    find: '${arrival}, ${blocker?.tableName ?? null}, ${blocker?.rowId ?? null},',
    replace: '${0}, ${blocker?.tableName ?? null}, ${blocker?.rowId ?? null},',
  },
  {
    name: 'a still-blocked row keeps its old blocker',
    find: '.where(sql`${mine} AND ${inList(blockers)}`)',
    replace: '.where(sql`false`)',
  },
  // §11.5: the release.
  {
    name: 'the release applies in id order, not arrival order',
    find: 'ORDER BY r.arrival, r.table_name, r.row_id',
    replace: 'ORDER BY r.row_id DESC',
  },
  {
    name: 'a release overwrites a later stored version',
    find: 'AND (s.deleted_at IS NOT NULL OR s.arrival_rev >= r.arrival))',
    replace: 'AND s.deleted_at IS NOT NULL)',
  },
  {
    name: 'a release resurrects a tombstone',
    find: 'AND (s.deleted_at IS NOT NULL OR s.arrival_rev >= r.arrival))',
    replace: 'AND s.arrival_rev >= r.arrival)',
  },
  {
    name: 'last_seq is not raised past the released rows',
    find: 'lastSeq: sql`MAX(${syncSequence.lastSeq}, (SELECT COALESCE(MAX(seq), 0) FROM sync_rows WHERE user_id = ${userId}))`,',
    replace: 'lastSeq: sql`${syncSequence.lastSeq}`,',
  },
  {
    name: 'released records are kept',
    find: 'inList(refs([...plan.release, ...plan.inert]))',
    replace: 'inList(refs(plan.inert))',
  },
  {
    name: 'inert records are kept',
    find: 'inList(refs([...plan.release, ...plan.inert]))',
    replace: 'inList(refs(plan.release))',
  },
  {
    name: 'the walk stops one step short of the session',
    find: 'WHERE w.depth < 2 AND',
    replace: 'WHERE w.depth < 1 AND',
  },
  // §11.5: re-validation before release.
  {
    name: 'a waiting row is released without re-validation',
    find: 'waiting.filter((row) => !revalidate(row))',
    replace: 'waiting.filter(() => false)',
  },
  {
    name: 'a demoted row stays a waiting row',
    find: '.where(sql`${mine} AND ${inList(refs(plan.demoted))}`)',
    replace: '.where(sql`false`)',
  },
  {
    name: 'the route does not re-validate',
    file: ROUTE,
    find: '{ invalid, revalidate: stillValid }',
    replace: '{ invalid }',
  },
  // §11.7: the protocol fields.
  {
    name: 'a duplicate ack carries no current row',
    find: 'current.get(keyOf(change)) ?? null',
    replace: 'null',
  },
  {
    name: 'a refused ack names no blocker',
    find: 'CASE WHEN NOT ${ok} AND ${notTombstoned} THEN ${blocker?.tableName ?? null} END',
    replace: 'NULL',
  },
  {
    name: 'the pull lists no refusals',
    file: ROUTE,
    find: '      refusals,\n',
    replace: '      refusals: [],\n',
  },
  // N6: the log lines.
  {
    name: 'the family log line names row ids',
    file: ROUTE,
    find: '? [parsed.data.changes[index]!.tableName]',
    replace: '? [parsed.data.changes[index]!.rowId]',
  },
  {
    name: 'the family refusal is not logged',
    file: ROUTE,
    find: 'if (family.length > 0) {',
    replace: 'if (family.length < 0) {',
  },
  {
    name: 'the re-validation log names the row id',
    file: ROUTE,
    find: '`sync push: a waiting ${row.tableName} row no longer validates',
    replace: '`sync push: a waiting ${row.rowId} row no longer validates',
  },
  {
    name: 'the route skips validating settings',
    file: ROUTE,
    find: '      const verdict = validatePayload(change);\n',
    replace:
      "      if (change.tableName === 'settings') continue;\n      const verdict = validatePayload(change);\n",
  },
  {
    name: 'the route logs the payload',
    file: ROUTE,
    find: "payload (${columns.join(', ')})`",
    replace: 'payload (${JSON.stringify(change)})`',
  },
  // §11.6: the phone's marks.
  {
    name: 'a pull does not replace the marks',
    file: STORE,
    find: '    if (marks !== undefined) replaceMarks(inner, marks);\n',
    replace: '',
  },
  {
    name: 'an ack writes no mark',
    file: STORE,
    find: 'const marks = applyMarkUpdate(readMarksSync(db), outcome.mark);',
    replace: 'const marks = readMarksSync(db);',
  },
  {
    name: 'an ack clears its entry outside the mark transaction',
    file: STORE,
    find: '      db.transaction((tx) => {\n        const inner = tx as unknown as Database;\n        inner.delete(syncOutbox).where(matches(entry)).run();\n        writeAckOutcome(inner, outcome);\n      });',
    replace:
      '      db.delete(syncOutbox).where(matches(entry)).run();\n      writeAckOutcome(db, outcome);',
  },
  {
    name: "a duplicate's current row ignores the queued entry",
    file: STORE,
    find: 'const shadow = shadowPull([outcome.current], pending, marks);',
    replace: 'const shadow = shadowPull([outcome.current], new Set<string>(), marks);',
  },
  {
    name: "a duplicate's current row is never applied",
    file: STORE,
    find: '  applyRows(db, shadow.applicable);\n',
    replace: '',
  },
  {
    name: 'sign-out keeps the marks',
    file: STORE,
    find: '  db.delete(syncState).run();\n  db.delete(syncRefusalMarks).run();\n',
    replace: '  db.delete(syncState).run();\n',
  },
  {
    name: 'a restore keeps the marks',
    file: STORE,
    find: '    tx.delete(syncRefusalMarks).run();\n',
    replace: '',
  },
];

/** The suite each file's mutants run against. */
const SUITES = {
  [FILE]: 'backend',
  [ROUTE]: 'backend',
  [STORE]: 'app',
};

const BACKEND_TESTS = [
  'test/sync-concurrency.spec.ts',
  'test/sync.spec.ts',
  'test/sync-client.spec.ts',
  'test/sync-contract.spec.ts',
  'test/sync-payload-validation.spec.ts',
  'test/sync-family-refusal.spec.ts',
];
const APP_TESTS = [
  'src/db/queries/sync-store.test.ts',
  'src/db/backup/sync-bookkeeping.test.ts',
  'src/features/sync/',
];

/**
 * Runs one suite, stopping at the first failing test, since one is a kill;
 * returns 'pass', 'fail' (a test failed) or 'error'.
 */
function runSuite(suite) {
  const [cwd, command, args, failed] =
    suite === 'app'
      ? ['app', 'npx', ['jest', '--bail', ...APP_TESTS], /Tests:\s+\d+ failed/]
      : ['backend', 'npx', ['vitest', 'run', '--bail=1', ...BACKEND_TESTS], /Tests\s+\d+ failed/];
  try {
    execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
    return 'pass';
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    return failed.test(output) ? 'fail' : 'error';
  }
}

const dirty = execFileSync('git', ['status', '--porcelain', '--', ...Object.keys(SUITES)], {
  encoding: 'utf8',
}).trim();
if (dirty) {
  console.error(`FAIL: the files under mutation are not committed:\n${dirty}`);
  process.exit(1);
}

const pristine = new Map(Object.keys(SUITES).map((file) => [file, readFileSync(file, 'utf8')]));

function assertClean() {
  for (const [file, text] of pristine) {
    if (readFileSync(file, 'utf8') !== text) {
      console.error(`FAIL: ${file} was not restored.`);
      process.exit(1);
    }
  }
}

for (const suite of new Set(Object.values(SUITES))) {
  const baseline = runSuite(suite);
  if (baseline !== 'pass') {
    console.error(
      `FAIL: the unmutated ${suite} suite did not pass (${baseline}); no mutant can be judged.`,
    );
    process.exit(1);
  }
  console.log(`baseline: the unmutated ${suite} suite passes`);
}

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
    result = runSuite(SUITES[file]);
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
