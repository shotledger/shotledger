// Manual mutation testing for the synced tags and settings
// (docs/specs/sync-tags-settings-spec.md §6). Stryker covers the shared
// modules; this covers what it cannot reach: the app's query layer and
// baseline SQL, the web read side, and the Worker route.
//
// FAILS CLOSED. Each suite must pass unmutated first; a mutant whose pattern
// does not match exactly once, a file that does not restore, or a run that
// fails without a failing test (a compile or transform error is not a kill)
// all exit nonzero. Each mutant runs only the tests named for it, so a kill
// is the scenario it targets, not an unrelated hash or snapshot check.
//
// Run: node scripts/manual-mutation-sync-tags-settings.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const TAGS = 'app/src/db/queries/tags.ts';
const SETTINGS = 'app/src/db/queries/settings.ts';
const STORE = 'app/src/db/queries/sync-store.ts';
const BASELINE = 'app/src/db/migrations/0000_baseline.sql';
const WEB = 'web/src/stats-inputs.ts';
const ROUTE = 'backend/src/routes/sync.ts';

const T = (name) => `app/src/db/queries/${name}.test.ts`;

/** Each mutant is a plausible bug, not a syntactic tweak. */
const MUTANTS = [
  {
    name: 'tagging twice writes a second link',
    file: TAGS,
    find: 'if (existing) return;',
    replace: 'if (false) return;',
    tests: [T('tags')],
  },
  {
    name: 'untagging hard-deletes the link again',
    file: TAGS,
    find: 'db.update(sessionTags)\n    .set({ deletedAt: now, updatedAt: now })\n    .where(liveLinks(db, sessionId, tagId))',
    replace: 'db.delete(sessionTags).where(liveLinks(db, sessionId, tagId))',
    tests: [T('tags')],
  },
  {
    name: 'untagging hard-deletes the link again (the N4 gate alone)',
    file: TAGS,
    find: 'db.update(sessionTags)\n    .set({ deletedAt: now, updatedAt: now })\n    .where(liveLinks(db, sessionId, tagId))',
    replace: 'db.delete(sessionTags).where(liveLinks(db, sessionId, tagId))',
    tests: ['app/src/db/no-hard-delete.test.ts'],
  },
  {
    name: 'a tag id stands only for itself, not for its name',
    file: TAGS,
    find: 'if (!tag) return [tagId];',
    replace: 'if (tag) return [tagId];',
    tests: [T('tags')],
  },
  {
    name: 'the name resolves to an arbitrary copy, not the earliest',
    file: TAGS,
    find: '    .orderBy(tags.id)\n',
    replace: '',
    tests: [T('tags')],
  },
  {
    name: 'deleting a tag leaves its same-name copies alive',
    file: TAGS,
    find: 'and(inArray(tags.id, sameNameIds(db, id)), isNull(tags.deletedAt))',
    replace: 'eq(tags.id, id)',
    tests: [T('tags')],
  },
  {
    name: 'the Statistics reads see raw links',
    file: TAGS,
    find: 'return liveSessionTags(allTags(db), allLinks(db));',
    replace: 'return allLinks(db);',
    tests: [T('stats-sessions')],
  },
  {
    name: 'a tombstoned setting still reads as set',
    file: SETTINGS,
    find: 'and(eq(settings.id, key), isNull(settings.deletedAt))',
    replace: 'eq(settings.id, key)',
    tests: [T('settings')],
  },
  {
    name: 'a settings edit keeps the old updated_at',
    file: SETTINGS,
    find: 'set: { value: encoded, updatedAt: now }',
    replace: 'set: { value: encoded }',
    tests: [T('settings')],
  },
  {
    name: 'a pulled device-local setting is applied',
    file: STORE,
    find: "if (change.tableName === 'settings' && !isSyncableSettingRow(change.rowId, change.payload)) {",
    replace: 'if (false) {',
    tests: [T('sync-store')],
  },
  {
    name: 'the settings insert trigger queues every key',
    file: BASELINE,
    find: "AFTER INSERT ON `settings`\nWHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0\n  AND new.`id` IN ('birthYear', 'skillClass', 'competesInWomensClasses', 'complianceProfile', 'complianceProfileVariant')",
    replace:
      'AFTER INSERT ON `settings`\nWHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0',
    tests: [T('settings')],
  },
  {
    name: 'the settings update trigger queues every key',
    file: BASELINE,
    find: "AFTER UPDATE ON `settings`\nWHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0\n  AND new.`id` IN ('birthYear', 'skillClass', 'competesInWomensClasses', 'complianceProfile', 'complianceProfileVariant')",
    replace:
      'AFTER UPDATE ON `settings`\nWHEN (SELECT `applying` FROM `sync_control` WHERE `id` = 0) = 0',
    tests: [T('settings')],
  },
  {
    name: 'tag names are unique again (the pull wedge)',
    file: BASELINE,
    find: 'CREATE INDEX `tags_name_idx`',
    replace: 'CREATE UNIQUE INDEX `tags_name_idx`',
    tests: ['app/src/db/sync-tags-settings.test.ts'],
  },
  {
    name: 'the web reads a JSON string as a birth year',
    file: WEB,
    find: "return typeof value === 'number' ? value : null;",
    replace: 'return value as number;',
    tests: ['web/src/stats-inputs.test.ts'],
  },
  {
    name: 'the web counts tombstoned links',
    file: WEB,
    find: 'tagId: row.tag_id as string,\n      deletedAt: (row.deleted_at as string | null | undefined) ?? null,',
    replace: 'tagId: row.tag_id as string,\n      deletedAt: null,',
    tests: ['web/src/stats-inputs.test.ts'],
  },
  {
    name: 'the web download leaves out tags',
    file: 'web/src/account/archive.ts',
    find: '      tagsBySession: tagNamesBySession(tags, links),\n',
    replace: '',
    tests: ['web/src/account/archive.test.ts'],
  },
  {
    name: 'the Worker stores a device-local setting',
    file: ROUTE,
    find: "change.tableName === 'settings' && !isSyncableSettingRow(change.rowId, change.payload),",
    replace: 'false,',
    backend: true,
  },
  {
    name: 'the Worker applies the settings allowlist to every table',
    file: ROUTE,
    find: "change.tableName === 'settings' && !isSyncableSettingRow(change.rowId, change.payload),",
    replace: '!isSyncableSettingRow(change.rowId, change.payload),',
    backend: true,
  },
];

const BACKEND_TESTS = ['test/sync.spec.ts', 'test/sync-client.spec.ts'];

/** Runs one suite; returns 'pass', 'fail' (a test failed) or 'error'. */
function runSuite(mutant) {
  const [cmd, args, cwd] = mutant.backend
    ? ['npx', ['vitest', 'run', ...BACKEND_TESTS], 'backend']
    : ['npx', ['vitest', 'run', ...mutant.tests], '.'];
  try {
    execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
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

const suites = new Map(MUTANTS.map((m) => [m.backend ? 'backend' : m.tests.join(' '), m]));
for (const [label, mutant] of suites) {
  const result = runSuite(mutant);
  if (result !== 'pass') {
    console.error(`FAIL: the unmutated suite "${label}" did not pass (${result}).`);
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
