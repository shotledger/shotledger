// Manual mutation testing for the web bulk edit
// (docs/specs/web-bulk-edit-spec.md). Stryker covers bulk-edit.ts against its
// whole suite; this checks what that score cannot show: that the K17 property
// alone kills real builder bugs, that the phone twin test (P1–P4) catches a
// builder that drifts from the phone, and the web page modules, which are
// outside Stryker's list.
//
// FAILS CLOSED. Each suite must pass unmutated first; a mutant whose pattern
// does not match exactly once, a file that does not restore, or a run that
// fails without a failing test (a compile or transform error is not a kill)
// all exit nonzero.
//
// Run: node scripts/manual-mutation-web-bulk.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const BUILDER = 'shared/src/sync-client/bulk-edit.ts';
const PROPERTY = { tests: ['shared/src/sync-client/bulk-edit.test.ts'], only: 'K17' };
const TWIN = { tests: ['app/src/db/queries/web-bulk.test.ts'] };

/** Each mutant is a plausible bug, not a syntactic tweak. */
const MUTANTS = [
  {
    name: 'property: a counter can go below zero',
    file: BUILDER,
    find: 'result.set(firearmId, [Math.max(0, total + rounds), Math.max(0, since + rounds)]);',
    replace: 'result.set(firearmId, [total + rounds, Math.max(0, since + rounds)]);',
    ...PROPERTY,
  },
  {
    name: 'property: a deleted tag of the name is reused for the new links',
    file: BUILDER,
    find: 'const named = new Set(liveTags.filter((t) => t.name === name)',
    replace: 'const named = new Set([...context.tags.values()].filter((t) => t.name === name)',
    ...PROPERTY,
  },
  {
    name: 'property: the location is stored untrimmed',
    file: BUILDER,
    find: 'return setLocation(action.location.trim() || null, sessions, now);',
    replace: 'return setLocation(action.location || null, sessions, now);',
    ...PROPERTY,
  },
  {
    name: 'property: a source firearm keeps its rounds',
    file: BUILDER,
    find: '    add(move.from, -move.rounds);\n',
    replace: '',
    ...PROPERTY,
  },
  {
    name: 'twin: a source firearm keeps its rounds',
    file: BUILDER,
    find: '    add(move.from, -move.rounds);\n',
    replace: '',
    ...TWIN,
  },
  {
    name: 'twin: an unlink leaves the links to a same-name copy',
    file: BUILDER,
    find: '[...context.tags.values()].filter((t) => t.name === name).map((t) => t.id as string),',
    replace:
      '[...context.tags.values()].filter((t) => t.name === name).map((t) => t.id as string).sort().slice(0, 1),',
    ...TWIN,
  },
  {
    name: 'twin: the volume leaves out shot rows',
    file: BUILDER,
    find: 'shotCount: shotsBySeries.get(s.id) ?? 0,',
    replace: 'shotCount: 0,',
    ...TWIN,
  },
  {
    name: 'builder: a total-only series always counts five (R9)',
    file: BUILDER,
    find: 'seriesLength: disciplineSeriesLength(session.discipline_id as string),',
    replace: 'seriesLength: 5,',
    tests: ['shared/src/sync-client/bulk-edit.test.ts'],
  },
  {
    name: 'property K21: the correction takes nothing back',
    file: BUILDER,
    find: 'plan.moves.filter((move) => !refused.sessions.has(move.sessionId)),',
    replace: 'plan.moves,',
    tests: ['shared/src/sync-client/bulk-edit.test.ts'],
    only: 'K21',
  },
  {
    name: 'property K21: every session refused leaves the counters as written',
    file: BUILDER,
    find: '?? plan.original[firearmId]!;',
    replace: '?? [total, since];',
    tests: ['shared/src/sync-client/bulk-edit.test.ts'],
    only: 'K21',
  },
  {
    name: 'page: a lost response drops the request instead of holding it',
    file: 'web/src/bulk/apply.ts',
    find: "new Set(['network', 'unauthenticated'])",
    replace: "new Set(['unauthenticated'])",
    tests: ['web/src/bulk/apply.test.ts'],
  },
  {
    name: 'page: Retry rebuilds a held correction',
    file: 'web/src/bulk/apply.ts',
    find: '  let changes = held.changes;\n',
    replace: '  let changes: ClientChange[] | null = null;\n',
    tests: ['web/src/bulk/apply.test.ts'],
  },
  {
    name: 'page: a refused moved session is not corrected',
    file: 'web/src/bulk/apply.ts',
    find: 'if (built.counters !== null && refused.sessions.size > 0) {',
    replace: 'if (false) {',
    tests: ['web/src/bulk/apply.test.ts'],
  },
  {
    name: 'page: the request leaves out fält stations',
    file: 'web/src/bulk/request.ts',
    find: "'series', 'shots', 'falt_stations']",
    replace: "'series', 'shots']",
    tests: ['web/src/bulk/request.test.ts'],
  },
  {
    name: 'page: the request leaves out shots',
    file: 'web/src/bulk/request.ts',
    find: "'series', 'shots', 'falt_stations']",
    replace: "'series', 'falt_stations']",
    tests: ['web/src/bulk/request.test.ts'],
  },
  {
    name: 'page: the request edits hidden selected sessions too',
    file: 'web/src/bulk/request.ts',
    find: 'const targets = targetIds(selected, shown);',
    replace: 'const targets = [...selected];',
    tests: ['web/src/bulk/request.test.ts'],
  },
  {
    name: 'page: a failed correction is said as a plain failure',
    file: 'web/src/bulk/messages.ts',
    find: "return status.stage === 'correction'",
    replace: 'return false',
    tests: ['web/src/bulk/messages.test.ts'],
  },
  {
    name: 'page: the To day is exclusive',
    file: 'web/src/bulk/model.ts',
    find: "if (filter.to !== '' && row.day > filter.to) return false;",
    replace: "if (filter.to !== '' && row.day >= filter.to) return false;",
    tests: ['web/src/bulk/model.test.ts'],
  },
  {
    name: 'page: hidden selected sessions are edited too',
    file: 'web/src/bulk/model.ts',
    find: 'return shown.filter((row) => selected.has(row.id)).map((row) => row.id);',
    replace: 'return [...selected];',
    tests: ['web/src/bulk/model.test.ts'],
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
