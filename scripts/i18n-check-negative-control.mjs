#!/usr/bin/env node
// Negative control for scripts/i18n-check.mjs (old-coder gauntlet, "checker
// note"): a gate that can only ever print PASS is not a gate. This mutates
// the i18n JSON in place, asserts the gate exits nonzero each time, and
// always restores the originals — including the plural-suffix rule the
// session-stats spec added, which must not turn the "unused key" check off.
//
// Run: node scripts/i18n-check-negative-control.mjs
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gate = path.join(repoRoot, 'scripts/i18n-check.mjs');
const files = {
  en: path.join(repoRoot, 'app/src/i18n/en.json'),
  sv: path.join(repoRoot, 'app/src/i18n/sv.json'),
};

const originals = {
  en: readFileSync(files.en, 'utf8'),
  sv: readFileSync(files.sv, 'utf8'),
  gate: readFileSync(gate, 'utf8'),
};

function restore() {
  writeFileSync(files.en, originals.en);
  writeFileSync(files.sv, originals.sv);
  writeFileSync(gate, originals.gate);
}

function runGate() {
  return spawnSync(process.execPath, [gate], { encoding: 'utf8' }).status;
}

function edit(which, mutate) {
  const json = JSON.parse(originals[which]);
  mutate(json);
  writeFileSync(files[which], `${JSON.stringify(json, null, 2)}\n`);
}

const results = [];
function check(name, expected, setup) {
  setup();
  const status = runGate();
  restore();
  const ok = expected === 'pass' ? status === 0 : status !== 0;
  results.push({ name, expected, status, ok });
  console.log(`${ok ? 'ok  ' : 'NOT OK'} ${name} — expected ${expected}, exit ${status}`);
}

try {
  check('baseline is green', 'pass', () => {});

  check('(a) a key missing from sv.json', 'fail', () => {
    edit('sv', (j) => delete j.stats.statsSeriesInnerTens);
  });

  check('(b) an unused non-plural key in both languages', 'fail', () => {
    for (const which of ['en', 'sv']) edit(which, (j) => (j.stats.neverReferencedKey = 'x'));
  });

  check('(c) an unused PLURAL key whose base key is unreferenced', 'fail', () => {
    for (const which of ['en', 'sv']) {
      edit(which, (j) => {
        j.stats.neverReferencedPlural_one = 'x';
        j.stats.neverReferencedPlural_other = 'y';
      });
    }
  });

  // Non-vacuity of the plural rule itself: with the suffix strip removed, the
  // real plural keys must go red — proving the rule is what makes them pass,
  // not some unrelated leniency in the gate.
  check('(d) the plural rule removed makes the real plural keys fail', 'fail', () => {
    writeFileSync(
      gate,
      originals.gate.replace(
        "const lookupKey = keyPath.replace(PLURAL_SUFFIX, '');",
        'const lookupKey = keyPath;',
      ),
    );
  });
} finally {
  restore();
}

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(`i18n-check negative control: FAILED (${failed.length} of ${results.length})`);
  process.exit(1);
}
console.log(`i18n-check negative control: all ${results.length} controls behaved as specified`);
