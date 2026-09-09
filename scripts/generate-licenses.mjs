#!/usr/bin/env node
// Generates app/src/constants/licenses.json — the JavaScript half of the About
// screen's open-source license list.
//
// Scope is what Metro actually puts in the Android bundle, not the npm
// dependency graph. `pnpm licenses list --prod` cannot be the source of truth
// here: `expo` declares `@expo/cli` as a runtime dependency, so `--prod` drags
// the whole bundler toolchain (metro, babel, terser, hermes-parser) in and
// credits software that never reaches the APK.
//
// So: `expo export --source-maps` builds the real bundle, and the source map's
// `sources` array lists every module that made it in. pnpm's store layout
// (node_modules/.pnpm/<id>/node_modules/<name>/…) identifies the owning
// package, whose package.json gives name and version; `pnpm licenses list`
// remains the license lookup, just no longer the package list.
//
// Native components (ML Kit, OpenCV, SQLite, Hermes) are in the APK but in no
// npm manifest, so no tooling can see them: they are hand-maintained in
// app/src/constants/native-licenses.ts.
//
// Regeneration bundles the app (~20 s cold), so it is manual/CI-only.
// `pnpm licenses:check`, which `pnpm check` runs, only verifies the committed
// file's invariants — see checkInvariants below.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const appDir = path.join(repoRoot, 'app');
const outPath = path.join(repoRoot, 'app/src/constants/licenses.json');
const relOut = path.relative(repoRoot, outPath);

// Build tooling that must never reappear in the list. These are the families
// that `--prod` used to sweep in; a match means the scoping regressed.
// `@babel/runtime` is the exception — its helpers really are in the bundle.
const BUILD_TOOLING = [
  /^metro(-|$)/,
  /^@babel\/(?!runtime$)/,
  /^babel-/,
  /^terser$/,
  /^jest(-|$)/,
  /^hermes-parser$/,
];

const byNameThenVersion = (a, b) =>
  a.name.localeCompare(b.name, 'en') || a.version.localeCompare(b.version, 'en');

// ---------------------------------------------------------------------------
// check mode — cheap invariants only, no bundling
// ---------------------------------------------------------------------------

function checkInvariants() {
  let entries;
  try {
    entries = JSON.parse(readFileSync(outPath, 'utf8'));
  } catch (err) {
    fail(`cannot read or parse ${relOut}: ${err.message}`);
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    fail(`${relOut} is not a non-empty array`);
  }

  const problems = [];
  const seen = new Set();
  let previous = null;
  for (const entry of entries) {
    const label = `${entry?.name}@${entry?.version}`;
    for (const field of ['name', 'version', 'license']) {
      if (typeof entry?.[field] !== 'string' || entry[field].length === 0) {
        problems.push(`${label}: missing ${field}`);
      }
    }
    if (typeof entry?.name !== 'string') continue;
    const key = `${entry.name}@${entry.version}`;
    if (seen.has(key)) problems.push(`${key}: duplicate entry`);
    seen.add(key);
    if (previous !== null && byNameThenVersion(previous, entry) > 0) {
      problems.push(`${key}: out of order (after ${previous.name}@${previous.version})`);
    }
    previous = entry;
    if (BUILD_TOOLING.some((re) => re.test(entry.name))) {
      problems.push(`${entry.name}: build tooling, does not ship in the bundle`);
    }
  }

  if (problems.length > 0) {
    console.error(`licenses-check: FAILED — ${relOut}`);
    for (const problem of problems) console.error(`  ${problem}`);
    console.error('Run `pnpm licenses:generate` and commit the result.');
    process.exit(1);
  }
  console.log(`licenses-check: ${entries.length} packages, invariants hold`);
}

// ---------------------------------------------------------------------------
// generate mode
// ---------------------------------------------------------------------------

function fail(message) {
  console.error(`generate-licenses: ${message}`);
  process.exit(1);
}

function run(command, args, cwd) {
  try {
    // The license listing is a few hundred KB of JSON, past the default maxBuffer.
    return execFileSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    fail(`\`${command} ${args.join(' ')}\` failed: ${err.message}`);
  }
}

// Metro's source map lists every module in the bundle. `--no-bytecode` skips
// the Hermes compile, which we do not need and which needs a lot of scratch space.
function exportBundle(outDir) {
  run(
    'pnpm',
    [
      'exec',
      'expo',
      'export',
      '--platform',
      'android',
      '--source-maps',
      '--no-bytecode',
      '--output-dir',
      outDir,
    ],
    appDir,
  );
  const mapDir = path.join(outDir, '_expo/static/js/android');
  let maps;
  try {
    maps = readdirSync(mapDir).filter((f) => f.endsWith('.js.map'));
  } catch (err) {
    fail(`export produced no ${path.relative(outDir, mapDir)}: ${err.message}`);
  }
  if (maps.length !== 1) fail(`expected exactly one source map, found ${maps.length}`);
  return JSON.parse(readFileSync(path.join(mapDir, maps[0]), 'utf8'));
}

// A bundled module path looks like
//   /node_modules/.pnpm/<id>/node_modules/<name>/<file>
// relative to the repo root. Workspace sources (/app/src, /shared/src) and
// Metro's synthetic modules (__prelude__, \0polyfill:…) have no owning package.
function packageDirFor(source) {
  if (!source.includes('/node_modules/.pnpm/')) return null;
  const marker = '/node_modules/';
  const start = source.lastIndexOf(marker) + marker.length;
  const rest = source.slice(start);
  const segments = rest.split('/');
  const depth = rest.startsWith('@') ? 2 : 1;
  if (segments.length <= depth) return null;
  return source.slice(0, start + segments.slice(0, depth).join('/').length);
}

function shippedPackages(sourceMap) {
  const byKey = new Map();
  for (const source of sourceMap.sources ?? []) {
    const dir = packageDirFor(source);
    if (dir === null) continue;
    if (byKey.has(dir)) continue;
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(path.join(repoRoot, dir, 'package.json'), 'utf8'));
    } catch (err) {
      fail(`cannot read package.json for bundled module ${source}: ${err.message}`);
    }
    if (!manifest.name || !manifest.version) fail(`${dir}/package.json has no name/version`);
    byKey.set(dir, { name: manifest.name, version: manifest.version, manifest });
  }
  const unique = new Map();
  for (const pkg of byKey.values()) unique.set(`${pkg.name}@${pkg.version}`, pkg);
  return unique;
}

// `pnpm licenses list --json` is keyed by license identifier; each entry is a
// package with a `versions` array (one package can resolve to several).
function licenseLookup() {
  const byLicense = JSON.parse(
    run('pnpm', ['--filter', 'app', 'licenses', 'list', '--prod', '--json'], repoRoot),
  );
  const map = new Map();
  for (const [licenseKey, packages] of Object.entries(byLicense)) {
    for (const pkg of packages) {
      for (const version of pkg.versions ?? []) {
        map.set(`${pkg.name}@${version}`, pkg.license || licenseKey);
      }
    }
  }
  return map;
}

// Fall back to the manifest when pnpm has no row — it also still understands
// the legacy `licenses` array and the `{ type }` object form.
function manifestLicense(manifest) {
  if (typeof manifest.license === 'string') return manifest.license;
  if (typeof manifest.license?.type === 'string') return manifest.license.type;
  const legacy = manifest.licenses;
  if (Array.isArray(legacy)) {
    const types = legacy.map((l) => (typeof l === 'string' ? l : l?.type)).filter(Boolean);
    if (types.length > 0) return types.join(' OR ');
  }
  return null;
}

function generate() {
  const outDir = mkdtempSync(path.join(os.tmpdir(), 'shotledger-licenses-'));
  // The export is ~20 MB; `fail()` exits without unwinding, so clean up on exit
  // rather than in a finally, or a failed run leaves that behind in $TMPDIR.
  process.on('exit', () => rmSync(outDir, { recursive: true, force: true }));

  const packages = shippedPackages(exportBundle(outDir));
  if (packages.size === 0) fail('the bundle referenced no packages — refusing to write');

  const lookup = licenseLookup();
  const unknown = [];
  const tooling = [];
  const entries = [];
  for (const [key, pkg] of packages) {
    const license = lookup.get(key) ?? manifestLicense(pkg.manifest);
    if (!license) unknown.push(key);
    if (BUILD_TOOLING.some((re) => re.test(pkg.name))) tooling.push(key);
    entries.push({ name: pkg.name, version: pkg.version, license: license ?? 'UNKNOWN' });
  }
  if (unknown.length > 0) fail(`no license found for: ${unknown.join(', ')}`);
  if (tooling.length > 0) fail(`build tooling reached the bundle list: ${tooling.join(', ')}`);

  entries.sort(byNameThenVersion);
  writeFileSync(outPath, `${JSON.stringify(entries, null, 2)}\n`);
  console.log(`generate-licenses: wrote ${entries.length} bundled packages to ${relOut}`);
}

if (process.argv.includes('--check')) checkInvariants();
else generate();
