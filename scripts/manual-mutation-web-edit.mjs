// Manual mutation testing for the web session edit
// (docs/specs/web-session-edit-spec.md §7). Stryker covers session-edit.ts and
// web/src/edit/*.ts against their whole suites; this checks what that score
// cannot show: that the K10 and K18 properties alone kill real builder bugs,
// that the phone twin test (P1–P7) catches a builder that drifts from the
// phone's own functions, and named bugs in the page modules.
//
// FAILS CLOSED. Each suite must pass unmutated first; a mutant whose pattern
// does not match exactly once, a file that does not restore, or a run that
// fails without a failing test (a compile or transform error is not a kill)
// all exit nonzero.
//
// Run: node scripts/manual-mutation-web-edit.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const BUILDER = 'shared/src/sync-client/session-edit.ts';
const K10 = { tests: ['shared/src/sync-client/session-edit.test.ts'], only: 'K10' };
const K18 = { tests: ['shared/src/sync-client/session-edit.test.ts'], only: 'K18' };
const TWIN = { tests: ['app/src/db/queries/web-edit.test.ts'] };

/** Each mutant is a plausible bug, not a syntactic tweak. */
const MUTANTS = [
  {
    name: 'K10: a firearm change leaves the old firearm its rounds',
    file: BUILDER,
    find: '    [from, -before],\n',
    replace: '',
    ...K10,
  },
  {
    name: 'K10: a counter can go below zero',
    file: 'shared/src/sync-client/rows.ts',
    find: 'round_count: Math.max(0, counter(pulled.round_count) + delta),',
    replace: 'round_count: counter(pulled.round_count) + delta,',
    ...K10,
  },
  {
    name: 'K18: a deleted series keeps its shots live',
    file: BUILDER,
    find: "      writes.push(tombstone('series', context.series.get(plan.id)!));\n      for (const shot of live) writes.push(tombstone('shots', shot));\n",
    replace: "      writes.push(tombstone('series', context.series.get(plan.id)!));\n",
    ...K18,
  },
  {
    name: 'K18: a re-entered series keeps its old shots (a doubled series)',
    file: BUILDER,
    find: "    if (plan.shotsChanged) {\n      for (const shot of live) writes.push(tombstone('shots', shot));\n",
    replace: '    if (plan.shotsChanged) {\n',
    ...K18,
  },
  {
    name: 'K18: the new firearm does not get the rounds',
    file: BUILDER,
    find: '    [to, after],\n',
    replace: '',
    ...K18,
  },
  {
    name: 'K18: a second sighter is let through',
    file: BUILDER,
    find: '  if (sighters <= 1) return;',
    replace: '  return;',
    ...K18,
  },
  {
    name: 'twin: delete leaves the fält stations live',
    file: BUILDER,
    find: "    writes.push(tombstone('falt_stations', station));",
    replace: '    void station;',
    ...TWIN,
  },
  {
    name: 'twin: the name is stored untrimmed',
    file: BUILDER,
    find: "text('name', 'name', fields.name.trim() || (session.name as string));",
    replace: "text('name', 'name', fields.name || (session.name as string));",
    ...TWIN,
  },
  {
    name: 'twin: a free-format sighter cannot be cleared',
    file: BUILDER,
    find: 'const isSighter = fixed ? wasSighter : series.isSighter;',
    replace: 'const isSighter = wasSighter || series.isSighter;',
    ...TWIN,
  },
  {
    name: 'builder (R8): an untouched series is counted with the flag the form opened',
    file: BUILDER,
    find: 'if (plan?.touched ? plan.isSighter : row.is_sighter === 1) sighters += 1;',
    replace: 'if (plan ? plan.isSighter : row.is_sighter === 1) sighters += 1;',
    tests: ['shared/src/sync-client/session-edit.test.ts'],
  },
  {
    name: 'builder (E6): a stale form writes anyway',
    file: BUILDER,
    find: "  if (isStale(plans, opened, context)) return { ok: false, errors: [{ kind: 'stale' }] };",
    replace: '',
    tests: ['shared/src/sync-client/session-edit.test.ts'],
  },
  {
    name: 'builder (R10): a stale Delete sends anyway',
    file: BUILDER,
    find: "  if (isDeleteStale(opened, context)) return { ok: false, errors: [{ kind: 'stale' }] };\n",
    replace: '',
    tests: ['shared/src/sync-client/session-edit.test.ts'],
  },
  {
    name: 'builder (R10): Delete compares the session row only',
    file: BUILDER,
    find: '  const was = [...opened.series.values()];\n',
    replace: '  return false;\n  const was = [...opened.series.values()];\n',
    tests: ['shared/src/sync-client/session-edit.test.ts'],
  },
  {
    name: 'builder (R10): Delete compares only the series the page showed (one added passes)',
    file: BUILDER,
    find: '  if (!sameRows(wasRows, seriesOfSession(context, sessionId))) return true;',
    replace:
      '  if (wasRows.some((row) => { const now = context.series.get(row.id as string); return !isLiveRow(now) || !sameRow(row, now); })) return true;',
    tests: ['shared/src/sync-client/session-edit.test.ts'],
  },
  {
    name: "builder (R10): Delete ignores the series' live shot ids",
    file: BUILDER,
    find: '  if (was.some((s) => !sameIds(s.shots, shots.get(s.row.id) ?? []))) return true;\n',
    replace: '',
    tests: ['shared/src/sync-client/session-edit.test.ts'],
  },
  {
    name: 'builder (R10): Delete leaves the fält stations out',
    file: BUILDER,
    find: '  return !sameRows(opened.stations, stationsOfSession(context, sessionId));',
    replace: '  return false;',
    tests: ['shared/src/sync-client/session-edit.test.ts'],
  },
  {
    name: 'builder (R10): stale is checked before gone',
    file: BUILDER,
    find: "  if (!isLiveRow(session)) return { ok: false, errors: [{ kind: 'gone' }] };\n  if (isDeleteStale(opened, context)) return { ok: false, errors: [{ kind: 'stale' }] };\n",
    replace:
      "  if (isDeleteStale(opened, context)) return { ok: false, errors: [{ kind: 'stale' }] };\n  if (!isLiveRow(session)) return { ok: false, errors: [{ kind: 'gone' }] };\n",
    tests: ['shared/src/sync-client/session-edit.test.ts'],
  },
  {
    name: 'builder (R11): an edited date gets the shape guard only',
    file: BUILDER,
    find: '    const error = startedAtError(fields.startedAt, now);',
    replace:
      "    const error = startedAtError(fields.startedAt, now)?.kind === 'invalidStartedAt' ? { kind: 'invalidStartedAt' as const } : null;",
    tests: ['shared/src/sync-client/session-edit.test.ts'],
  },
  {
    name: 'builder (R11): the stored date is checked though the edit leaves it',
    file: BUILDER,
    find: '  if (fields.startedAt !== undefined) {\n',
    replace:
      "  if (startedAtError(session.started_at as string, now)) errors.push({ kind: 'startedAtOutOfRange' });\n  if (fields.startedAt !== undefined) {\n",
    tests: ['shared/src/sync-client/session-edit.test.ts'],
  },
  {
    name: 'page (R10): a stale Delete is reported as a stale Save',
    file: 'web/src/edit/save.ts',
    find: "    if (is('stale')) return { status: { kind: 'stale', action, fresh }, held: null };",
    replace:
      "    if (is('stale')) return { status: { kind: 'stale', action: 'save', fresh }, held: null };",
    tests: ['web/src/edit/save.test.ts'],
  },
  {
    name: 'page (R10): a stale Delete tells the user to copy a form it does not have',
    file: 'web/src/edit/messages.ts',
    find: "status.action === 'delete' ? 'web.edit.staleDelete' : 'web.edit.stale'",
    replace: "'web.edit.stale'",
    tests: ['web/src/edit/messages.test.ts'],
  },
  {
    name: 'builder (round-3 F2): Delete compares shot counts, not ids',
    file: BUILDER,
    find: '  if (was.some((s) => !sameIds(s.shots, shots.get(s.row.id) ?? []))) return true;',
    replace:
      '  if (was.some((s) => s.shots.length !== (shots.get(s.row.id) ?? []).length)) return true;',
    tests: ['shared/src/sync-client/session-edit.test.ts'],
  },
  {
    name: 'page (round-3 F1): Delete opens from the fresh pull, not what the page showed',
    file: 'web/src/edit/request.ts',
    find: '      : buildSessionDelete(shown, fresh, ids(io)),',
    replace:
      '      : buildSessionDelete(openedSession(sessionId, fresh) ?? shown, fresh, ids(io)),',
    tests: ['web/src/edit/request.test.ts'],
  },
  {
    name: 'page (round-3 F1): Delete Session sends without asking',
    file: 'web/src/edit/save.ts',
    find: "  return state.held === null ? 'ask' : 'resend';",
    replace: "  return 'resend';",
    tests: ['web/src/edit/save.test.ts'],
  },
  {
    name: 'page (round-3 F1): Reload pulls nothing',
    file: 'web/src/edit/save.ts',
    find: '  void refresh();\n  return IDLE;',
    replace: '  return IDLE;',
    tests: ['web/src/edit/save.test.ts'],
  },
  {
    name: 'page: a lost response drops the request instead of holding it',
    file: 'web/src/edit/save.ts',
    find: "new Set(['network', 'unauthenticated'])",
    replace: "new Set(['unauthenticated'])",
    tests: ['web/src/edit/save.test.ts'],
  },
  {
    name: 'page: Retry rebuilds the held request instead of resending it',
    file: 'web/src/edit/save.ts',
    find: '  if (held !== null) return send(deps, held);\n',
    replace: '',
    tests: ['web/src/edit/save.test.ts'],
  },
  {
    name: 'page: a held request goes to another account',
    file: 'web/src/edit/save.ts',
    find: '  if (held !== null && held.userId !== userId) {',
    replace: '  if (false) {',
    tests: ['web/src/edit/save.test.ts'],
  },
  {
    name: 'page (E8): every moved firearm is named, refused or not',
    file: 'web/src/edit/save.ts',
    find: '.filter((move) => move.rows.some((row) => refused.has(`${row.tableName}:${row.rowId}`)))',
    replace: '.filter(() => refused.size > 0)',
    tests: ['web/src/edit/save.test.ts'],
  },
  {
    name: 'page (U8): Delete sends without asking',
    file: 'web/src/edit/save.ts',
    find: "return { step: 'closed', send: event === 'confirm' && step === 'asking' };",
    replace: "return { step: 'closed', send: event === 'confirm' };",
    tests: ['web/src/edit/save.test.ts'],
  },
  {
    name: 'page: every field is sent, changed or not',
    file: 'web/src/edit/model.ts',
    find: 'if (form[key] !== initial[key]) Object.assign(fields, { [key]: form[key] });',
    replace: 'Object.assign(fields, { [key]: form[key] });',
    tests: ['web/src/edit/model.test.ts'],
  },
];

/** Runs one suite; returns 'pass', 'fail' (a test failed) or 'error'. */
function runSuite(mutant) {
  const args = ['vitest', 'run', ...mutant.tests, ...(mutant.only ? ['-t', mutant.only] : [])];
  try {
    execFileSync('npx', args, { encoding: 'utf8', stdio: 'pipe' });
    return 'pass';
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    return /Tests\s+\d+ failed/.test(output) ? 'fail' : 'error';
  }
}

const files = [...new Set(MUTANTS.map((m) => m.file))];

function assertClean() {
  const dirty = execFileSync('git', ['status', '--porcelain', '--', ...files], {
    encoding: 'utf8',
  }).trim();
  if (dirty) {
    console.error(`FAIL: mutated files are not committed and pristine:\n${dirty}`);
    process.exit(1);
  }
}

assertClean();

const label = (m) => `${m.tests.join(' ')}${m.only ? ` -t ${m.only}` : ''}`;
const suites = new Map(MUTANTS.map((m) => [label(m), m]));
for (const [name, mutant] of suites) {
  const result = runSuite(mutant);
  if (result !== 'pass') {
    console.error(`FAIL: the unmutated suite "${name}" did not pass (${result}).`);
    process.exit(1);
  }
}
console.log(`baseline: ${suites.size} unmutated suites pass`);

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
    result = runSuite(mutant);
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
