// Manual mutation testing for the sync push path (backend/src/db/queries.ts
// and backend/src/routes/sync.ts; docs/specs/sync-push-atomicity-spec.md §8,
// sync-payload-validation-spec.md §7, sync-family-refusal-spec.md §11) and
// the phone's refusal marks (app/src/db/queries/sync-store.ts, §11.6).
// Stryker runs in the root Node vitest pool and cannot reach code that only
// runs in workerd; the store's mutants run its own suite on the root vitest.
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

/**
 * Each mutant is a plausible bug, not a syntactic tweak. Two earlier mutants
 * are retired as equivalent under Revision 3, where the judge decides before
 * the batch from a snapshot the guard keeps current:
 * - "an invalid payload outranks a tombstone": the judge acks a live change
 *   over a tombstone `tombstoned` (precedence 2), so its `reason` is null and
 *   the SQL CASE never sees an invalid change over a tombstone;
 * - "a duplicate rewrites the record": a replay is judged `duplicate`, which
 *   takes the record's delete branch, never the upsert's.
 */
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
    name: 'a push judged before an account deletion recreates the user',
    find: 'OR EXISTS (SELECT 1 FROM sync_sequence WHERE user_id = ${userId})) THEN 0 END`,',
    replace: 'OR true) THEN 0 END`,',
  },
  {
    name: 'a push judged again after an account deletion recreates the user',
    find: 'CASE WHEN EXISTS (SELECT 1 FROM "user" WHERE id = ${userId})\n        AND (',
    replace: 'CASE WHEN true\n        AND (',
  },
  {
    // Round 8, V8-1 (M8b): the account is checked with the snapshot's
    // state_rev read, in the same query (SNAP's hook still matches it), and
    // not in the batch. A deletion between the reads and the batch goes
    // unseen on a first push.
    name: 'the account is checked with the snapshot reads, not in the batch',
    find: `  const [row] = await db
    .select({ stateRev: syncSequence.stateRev })
    .from(syncSequence)
    .where(eq(syncSequence.userId, userId));
  return row?.stateRev ?? 0;`,
    replace: `  const [row] = await db.all<{ state_rev: number | null; account: number }>(
    sql\`select (select "state_rev" from "sync_sequence" where "user_id" = \${userId}) AS state_rev,
      EXISTS (SELECT 1 FROM "user" WHERE id = \${userId}) AS account\`,
  );
  if (!row?.account) throw new PushAccountGoneError();
  return row.state_rev ?? 0;`,
    also: [
      {
        find: 'CASE WHEN EXISTS (SELECT 1 FROM "user" WHERE id = ${userId})\n        AND (',
        replace: 'CASE WHEN true\n        AND (',
      },
    ],
  },
  {
    name: 'the guard checks whether any account exists, not the pushing user’s',
    find: 'EXISTS (SELECT 1 FROM "user" WHERE id = ${userId})',
    replace: 'EXISTS (SELECT 1 FROM "user")',
  },
  {
    name: 'a push after an account deletion is not answered 401',
    file: ROUTE,
    find: "        return c.json({ error: 'unauthenticated' }, 401);\n      }",
    replace: "        return c.json({ error: 'busy' }, 503);\n      }",
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
    find: 'AND ${syncRefusals.tableName} = b.t AND ${syncRefusals.rowId} = b.r`,',
    replace: 'AND false`,',
  },
  // §11.5: every record statement keeps to the pushing user (round 6, V6-2).
  {
    name: 'the demotion reaches another user’s records',
    find: '.where(sql`${mine} AND ${inList(refs(plan.demoted))}`)',
    replace: '.where(sql`${inList(refs(plan.demoted))}`)',
  },
  {
    name: 'the blocker update reaches another user’s records',
    find: 'sql`${syncRefusals.userId} = ${userId}\n          AND ${syncRefusals.tableName} = b.t',
    replace: 'sql`${syncRefusals.tableName} = b.t',
  },
  {
    name: 'the release reads another user’s records',
    find: 'CROSS JOIN sync_refusals r ON r.user_id = ${userId}\n',
    replace: 'CROSS JOIN sync_refusals r ON true\n',
  },
  {
    name: 'the release and inert delete reaches another user’s records',
    find: '.where(sql`${mine} AND ${inList(refs([...plan.release, ...plan.inert]))}`)',
    replace: '.where(sql`${inList(refs([...plan.release, ...plan.inert]))}`)',
  },
  // §11.5: the release.
  {
    name: 'the release applies in id order, not arrival order',
    find: 'ORDER BY r.arrival, r.table_name, r.row_id',
    replace: 'ORDER BY r.row_id DESC',
  },
  {
    name: 'the release joins its list on the table alone',
    find: "            AND r.row_id = json_extract(j.value, '$[1]')\n",
    replace: '',
  },
  {
    name: 'a release overwrites a later stored version',
    find: 'AND (s.deleted_at IS NOT NULL OR s.arrival_rev >= r.arrival))',
    replace: 'AND s.deleted_at IS NOT NULL)',
  },
  {
    name: 'a release overwrites a stored version of its own arrival',
    find: 'AND (s.deleted_at IS NOT NULL OR s.arrival_rev >= r.arrival))',
    replace: 'AND (s.deleted_at IS NOT NULL OR s.arrival_rev > r.arrival))',
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
  // §11.8: the snapshot is read after state_rev, so the guard covers every read.
  {
    name: 'the snapshot reads state_rev last',
    find: '  const stateRev = await readStateRev(db, userId);\n  const recorded = await readRecorded(db, userId, changes);\n  const records = await readRecords(db, userId);\n  const stored = await readWalk(db, userId, changes, records);\n',
    replace:
      '  const recorded = await readRecorded(db, userId, changes);\n  const records = await readRecords(db, userId);\n  const stored = await readWalk(db, userId, changes, records);\n  const stateRev = await readStateRev(db, userId);\n',
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
    name: 'a stored mark reads back as this device’s own',
    file: STORE,
    find: '      own: row.own,\n',
    replace: '      own: true,\n',
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
  [STORE]: 'store',
};

const BACKEND_TESTS = [
  'test/sync-concurrency.spec.ts',
  'test/sync.spec.ts',
  'test/sync-client.spec.ts',
  'test/sync-contract.spec.ts',
  'test/sync-payload-validation.spec.ts',
  'test/sync-family-refusal.spec.ts',
  'test/sync-family-refusal.property.spec.ts',
];
// The phone's SQLite store runs on the root vitest, not the app's jest
// (app/jest.config.js ignores src/db/).
const STORE_TESTS = [
  'app/src/db/queries/sync-store.test.ts',
  'app/src/db/backup/sync-bookkeeping.test.ts',
];

/** The end of the last run that failed without a failing test, to show. */
let lastError = '';

/**
 * Runs one suite, stopping at the first failing test, since one is a kill;
 * returns 'pass', 'fail' (a test failed) or 'error'. The backend files run
 * one at a time: a bail while workerd pool workers are still starting
 * crashes the run ("Message sent to Worker before initialisation").
 */
function runSuite(suite) {
  const [cwd, args] =
    suite === 'store'
      ? ['.', ['vitest', 'run', '--bail=1', ...STORE_TESTS]]
      : ['backend', ['vitest', 'run', '--bail=1', '--no-file-parallelism', ...BACKEND_TESTS]];
  try {
    execFileSync('npx', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
    return 'pass';
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    if (/Tests\s+\d+ failed/.test(output)) return 'fail';
    lastError = output.split('\n').slice(-40).join('\n');
    return 'error';
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
  // A mutant may need more than one edit (`also`); each must match once.
  const edits = [{ find: mutant.find, replace: mutant.replace }, ...(mutant.also ?? [])];
  let mutated = original;
  for (const edit of edits) {
    const occurrences = original.split(edit.find).length - 1;
    if (occurrences !== 1) {
      console.error(
        `FAIL: mutant "${mutant.name}" matched ${occurrences} times (expected exactly 1). ` +
          'The source moved; fix the mutant rather than trusting this run.',
      );
      process.exit(1);
    }
    mutated = mutated.replace(edit.find, edit.replace);
  }

  writeFileSync(file, mutated);
  let result;
  try {
    result = runSuite(SUITES[file]);
  } finally {
    writeFileSync(file, original);
  }
  assertClean();

  if (result === 'error') {
    console.error(`FAIL: mutant "${mutant.name}" broke the run without failing a test.`);
    console.error(lastError);
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
