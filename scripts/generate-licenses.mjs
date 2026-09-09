#!/usr/bin/env node
// Generates app/src/constants/licenses.json — the open-source license list the
// About screen renders — from the lockfile via `pnpm licenses list`.
//
// Scope is `app`'s production dependency graph (`--filter app --prod`): what
// actually ships in the app bundle, so no devDependencies and no `backend/`.
//
// `--check` regenerates into memory and fails on drift instead of writing;
// that is what `pnpm licenses:check` (part of `pnpm check`) runs.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outPath = path.join(repoRoot, 'app/src/constants/licenses.json');

const checkOnly = process.argv.includes('--check');

function readPnpmLicenses() {
  let stdout;
  try {
    stdout = execFileSync(
      'pnpm',
      ['--filter', 'app', 'licenses', 'list', '--prod', '--json'],
      // The list is a few hundred KB of JSON, well past the default maxBuffer.
      { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (err) {
    console.error(`generate-licenses: \`pnpm licenses list\` failed: ${err.message}`);
    process.exit(1);
  }
  try {
    return JSON.parse(stdout);
  } catch (err) {
    console.error(`generate-licenses: cannot parse \`pnpm licenses list\` output: ${err.message}`);
    process.exit(1);
  }
}

// `pnpm licenses list --json` is keyed by license identifier; each entry is a
// package with a `versions` array (one package can resolve to several).
function toEntries(byLicense) {
  const seen = new Map();
  for (const [licenseKey, packages] of Object.entries(byLicense)) {
    for (const pkg of packages) {
      const license = pkg.license || licenseKey;
      for (const version of pkg.versions ?? []) {
        seen.set(`${pkg.name}@${version}`, { name: pkg.name, version, license });
      }
    }
  }
  return [...seen.values()].sort(
    (a, b) => a.name.localeCompare(b.name, 'en') || a.version.localeCompare(b.version, 'en'),
  );
}

const entries = toEntries(readPnpmLicenses());
if (entries.length === 0) {
  console.error('generate-licenses: no packages found — refusing to write an empty list');
  process.exit(1);
}
const generated = `${JSON.stringify(entries, null, 2)}\n`;

if (checkOnly) {
  let current;
  try {
    current = readFileSync(outPath, 'utf8');
  } catch (err) {
    console.error(`generate-licenses: cannot read ${outPath}: ${err.message}`);
    console.error('Run `pnpm licenses:generate` to create it.');
    process.exit(1);
  }
  if (current !== generated) {
    console.error('licenses-check: FAILED — app/src/constants/licenses.json is out of date.');
    console.error('Run `pnpm licenses:generate` and commit the result.');
    process.exit(1);
  }
  console.log(`licenses-check: ${entries.length} packages, up to date`);
  process.exit(0);
}

writeFileSync(outPath, generated);
console.log(
  `generate-licenses: wrote ${entries.length} packages to ${path.relative(repoRoot, outPath)}`,
);
