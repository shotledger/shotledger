#!/usr/bin/env node
// Manual mutation runner for the app side of the one volume rule (#512,
// docs/specs/one-volume-figure-spec.md): app/src is outside Stryker's scope,
// so these on-disk mutants stand in for it. Same contract as
// mutate-schema.mjs: a mutant whose search text is not found exactly once is a
// hard error, a survivor exits 1, and every file is restored in `finally`.
//
// Run: node scripts/mutate-volume.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const TEST = 'app/src/db';

/** [file, search text (must occur once), replacement, description] */
const MUTANTS = [
  [
    'app/src/db/queries/volume.ts',
    '.leftJoin(shots, and(eq(shots.seriesId, series.id), isNull(shots.deletedAt)))',
    '.leftJoin(shots, eq(shots.seriesId, series.id))',
    'a deleted shot still counts',
  ],
  [
    'app/src/db/queries/volume.ts',
    '.where(and(isNull(series.deletedAt), live))',
    '.where(live)',
    'a deleted series still counts',
  ],
  [
    'app/src/db/queries/volume.ts',
    '.where(and(isNull(faltStations.deletedAt), live))',
    '.where(live)',
    'a deleted station still counts',
  ],
  [
    'app/src/db/queries/volume.ts',
    'const live = and(isNull(sessions.deletedAt), where);',
    'const live = where;',
    'a deleted session still counts',
  ],
  [
    'app/src/db/queries/volume.ts',
    'overrideShotCount: row.isTotalOverride === 1 ? row.overrideShotCount : null,',
    'overrideShotCount: null,',
    'a total-only series counts as its zero shot rows',
  ],
  [
    'app/src/db/queries/volume.ts',
    'const delta = sessionVolumeRounds(db, sessionId) - before;',
    'const delta = before - sessionVolumeRounds(db, sessionId);',
    'the counter moves the wrong way',
  ],
  [
    'app/src/db/queries/volume.ts',
    'if (!firearmId) return mutate();',
    'if (firearmId) return mutate();',
    'only a session without a firearm moves a counter',
  ],
  [
    'app/src/db/queries/volume.ts',
    'return sessionVolumes(db, eq(sessions.id, sessionId)).get(sessionId) ?? 0;',
    'return totalVolumeRounds(db);',
    'one session’s volume is every session’s',
  ],
  [
    'app/src/db/queries/volume.ts',
    'return totalVolumeRounds(db, inArray(sessions.id, [...sessionIds]));',
    'return totalVolumeRounds(db);',
    'the shooting log counts sessions outside its period',
  ],
  [
    'app/src/db/queries/ammo-usage.ts',
    'shotCount: totalVolumeRounds(db, eq(sessions.ammoLotId, ammoLotId)),',
    'shotCount: totalVolumeRounds(db),',
    'a lot is charged every session’s rounds',
  ],
  [
    'app/src/db/queries/webshooter.ts',
    'sessionVolumeRounds(db, sessionId),\n      );',
    '0,\n      );',
    'assigning a firearm credits none of the imported rounds',
  ],
  [
    'app/src/db/queries/webshooter.ts',
    '  withSessionVolumeDelta(db, sessionId, () => {\n    for (const existing of listSeriesForSession',
    '  ((_db: unknown, _id: unknown, f: () => void) => f())(db, sessionId, () => {\n    for (const existing of listSeriesForSession',
    'a re-import moves no counter for its total-only series',
  ],
  [
    'app/src/db/json-export/apply-import.ts',
    'addRounds(existing.firearmId, -sessionVolumeRounds(tx, group.sessionId));',
    'addRounds(existing.firearmId, -0);',
    'an import over a session never backs its old rounds out',
  ],
  [
    'app/src/db/queries/round-count.ts',
    'return sessionId ? withSessionVolumeDelta(db, sessionId, mutate) : mutate();',
    'return mutate();',
    'saving or deleting a series moves no counter',
  ],
  [
    'app/src/db/queries/falt.ts',
    'withSessionVolumeDelta(db, current.sessionId, () => tombstoneStation(db, id));',
    'tombstoneStation(db, id);',
    'deleting a station moves no counter',
  ],
];

const originals = new Map();
const survivors = [];

try {
  for (const [file, from, to, description] of MUTANTS) {
    if (!originals.has(file)) originals.set(file, readFileSync(file, 'utf8'));
    const source = originals.get(file);
    const occurrences = source.split(from).length - 1;
    if (occurrences !== 1) {
      throw new Error(
        `Mutant "${description}" did not apply: ${file} contains ${JSON.stringify(from)} ` +
          `${occurrences} times, not once. An unapplied mutant must never be reported as killed.`,
      );
    }
    writeFileSync(file, source.replace(from, to));

    let killed;
    try {
      execFileSync('pnpm', ['exec', 'vitest', 'run', TEST], { stdio: 'ignore' });
      killed = false;
    } catch {
      killed = true;
    } finally {
      writeFileSync(file, source);
    }
    console.log(`${killed ? 'KILLED  ' : 'SURVIVED'}  ${file} — ${description}`);
    if (!killed) survivors.push(`${file} — ${description}`);
  }
} finally {
  for (const [file, source] of originals) writeFileSync(file, source);
}

console.log(`\n${MUTANTS.length - survivors.length}/${MUTANTS.length} mutants killed.`);
if (survivors.length > 0) {
  console.error(`\nSurviving mutants:\n  ${survivors.join('\n  ')}`);
  process.exit(1);
}
