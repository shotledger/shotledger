// Manual mutation testing for the ammo-lot merge
// (docs/specs/ammo-lot-merge-spec.md). Stryker covers the web builder and the
// panel model; this checks what that score cannot show: that the phone's
// mergeAmmoLots (outside Stryker's module list) is pinned by A1–A6, that the
// K8 property alone kills real builder bugs, and that the phone twin test (P1)
// catches a builder that drifts from the phone.
//
// FAILS CLOSED. Each suite must pass unmutated first; a mutant whose pattern
// does not match exactly once, a file that does not restore, or a run that
// fails without a failing test (a compile or transform error is not a kill)
// all exit nonzero.
//
// Run: node scripts/manual-mutation-ammo-merge.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const PHONE = 'app/src/db/queries/ammo-lots.ts';
const PHONE_TESTS = { tests: ['app/src/db/queries/ammo-lots.test.ts'], only: 'mergeAmmoLots' };
const BUILDER = 'shared/src/sync-client/ammo-lot-merge.ts';
const PROPERTY = { tests: ['shared/src/sync-client/ammo-lot-merge.test.ts'], only: 'K8' };
const TWIN = { tests: ['app/src/db/queries/web-ammo-merge.test.ts'] };

/** Each mutant is a plausible bug, not a syntactic tweak. */
const MUTANTS = [
  {
    name: 'phone (M3): deleted sessions are repointed too',
    file: PHONE,
    find: 'const onDuplicate = and(eq(sessions.ammoLotId, duplicateId), isNull(sessions.deletedAt));',
    replace: 'const onDuplicate = eq(sessions.ammoLotId, duplicateId);',
    ...PHONE_TESTS,
  },
  {
    name: 'phone (M1): the duplicate is not deleted',
    file: PHONE,
    find: '.set({ deletedAt: now, updatedAt: now })\n      .where(eq(ammoLots.id, duplicateId))',
    replace: '.set({ updatedAt: now })\n      .where(eq(ammoLots.id, duplicateId))',
    ...PHONE_TESTS,
  },
  {
    name: 'phone: a moved session keeps its old updated_at',
    file: PHONE,
    find: '.set({ ammoLotId: keptId, updatedAt: now })',
    replace: '.set({ ammoLotId: keptId })',
    ...PHONE_TESTS,
  },
  {
    name: 'phone (M4): a deleted kept lot is accepted',
    file: PHONE,
    find: 'if (!getAmmoLot(tx, duplicateId) || !getAmmoLot(tx, keptId)) {',
    replace: 'if (!getAmmoLot(tx, duplicateId)) {',
    ...PHONE_TESTS,
  },
  {
    name: 'property (M3): deleted sessions are repointed too',
    file: BUILDER,
    find: 'const moved = liveRows(context.sessions).filter',
    replace: 'const moved = [...context.sessions.values()].filter',
    ...PROPERTY,
  },
  {
    name: 'property (M1): the duplicate is not tombstoned',
    file: BUILDER,
    find: 'changes: [tombstone, ...repoints]',
    replace: 'changes: [...repoints]',
    ...PROPERTY,
  },
  {
    name: 'property: a deleted kept lot is accepted',
    file: BUILDER,
    find: '|| !isLive(context.ammoLots.get(keptId))',
    replace: '',
    ...PROPERTY,
  },
  {
    name: 'twin (M1): the sessions keep the duplicate',
    file: BUILDER,
    find: 'payload: { ...s, ammo_lot_id: keptId, updated_at: now },',
    replace: 'payload: { ...s, updated_at: now },',
    ...TWIN,
  },
  {
    name: 'twin (M1): the duplicate is not tombstoned',
    file: BUILDER,
    find: 'changes: [tombstone, ...repoints]',
    replace: 'changes: [...repoints]',
    ...TWIN,
  },
  {
    name: 'panel (U2): a lost response drops the merge instead of holding it',
    file: 'web/src/bulk/merge.ts',
    find: "new Set(['network', 'unauthenticated'])",
    replace: "new Set(['unauthenticated'])",
    tests: ['web/src/bulk/merge.test.ts'],
  },
  {
    name: 'panel (U2): a held merge goes to another account',
    file: 'web/src/bulk/merge.ts',
    find: 'if (held !== null && held.userId !== userId) {',
    replace: 'if (false) {',
    tests: ['web/src/bulk/merge.test.ts'],
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
