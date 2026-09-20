#!/usr/bin/env node
// Catches a manual link that points at a heading which no longer exists.
//
// `mkdocs build --strict` cannot do this. It fails on an unresolved *page*
// link, but a link to a missing ANCHOR is logged at INFO and the build exits
// 0 — so CI's strict build reports a wrong page as fine. It has already
// bitten once: #309 moved the sighter section out of `guides/statistics.md`
// and two pages kept linking to the anchor it used to have (issue #343).
//
// Moving sections between the Diataxis quadrants is routine, and every move
// puts inbound anchors at risk, so this runs as its own gate.
//
//   node scripts/docs-anchor-check.mjs
//
// Raising mkdocs' log level is not a fix on its own: INFO carries a lot of
// ordinary build chatter, and `--strict` only promotes WARNING.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Built into a throwaway directory so this never races or clobbers the `site/`
// the CI build step uploads.
const out = mkdtempSync(join(tmpdir(), 'shotledger-anchors-'));
let result;
try {
  result = spawnSync('mkdocs', ['build', '--site-dir', out], {
    cwd: root,
    encoding: 'utf8',
  });
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (result.error) {
  console.error('docs-anchor-check: could not run mkdocs — pip install -r docs/requirements.txt');
  console.error(`  ${result.error.message}`);
  process.exit(2);
}

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

if (result.status !== 0) {
  console.error('docs-anchor-check: the mkdocs build itself failed\n');
  console.error(output);
  process.exit(2);
}

// mkdocs reports one INFO line per dangling anchor, wrapped over several lines.
const dangling = output
  .split(/^(?=INFO|WARNING|ERROR|DEBUG)/m)
  .map((entry) => entry.replace(/\s+/g, ' ').trim())
  .filter((entry) => entry.includes('does not contain an anchor'));

if (dangling.length > 0) {
  console.error(`docs-anchor-check: ${dangling.length} dangling anchor(s)\n`);
  for (const entry of dangling) console.error(`  ${entry}`);
  console.error(
    '\nPoint the link at a heading that exists, or drop the anchor —\n' +
      'a reader following it lands at the top of a page that no longer says what they were sent for.',
  );
  process.exit(1);
}

console.log('docs-anchor-check: no dangling anchors');
