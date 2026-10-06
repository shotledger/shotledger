#!/usr/bin/env node
// Gate: en.json and sv.json must have identical key sets, and every leaf key
// must be referenced somewhere in app/src or web/src (literal `t('x.y')`/`t("x.y")`, or
// via a dynamic namespace prefix like `t(\`discipline.${id}\`)`).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const i18nDir = path.join(repoRoot, 'app/src/i18n');
// The web app (ADR 0013) reads the same files, so its source counts too.
const sourceDirs = [path.join(repoRoot, 'app/src'), path.join(repoRoot, 'web/src')];

function loadJson(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`i18n-check: cannot read ${filePath}: ${err.message}`);
    process.exit(1);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`i18n-check: cannot parse ${filePath} as JSON: ${err.message}`);
    process.exit(1);
  }
}

function flatten(obj, prefix = '') {
  const out = new Map();
  for (const [key, value] of Object.entries(obj)) {
    const keyPath = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of flatten(value, keyPath)) out.set(k, v);
    } else {
      out.set(keyPath, value);
    }
  }
  return out;
}

function listSourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

const enPath = path.join(i18nDir, 'en.json');
const svPath = path.join(i18nDir, 'sv.json');
const en = loadJson(enPath);
const sv = loadJson(svPath);

const enKeys = flatten(en);
const svKeys = flatten(sv);

const missingInSv = [...enKeys.keys()].filter((k) => !svKeys.has(k)).sort();
const missingInEn = [...svKeys.keys()].filter((k) => !enKeys.has(k)).sort();

const sourceFiles = sourceDirs.flatMap((dir) => listSourceFiles(dir));
const sourceTexts = sourceFiles.map((f) => readFileSync(f, 'utf8'));
const combinedSource = sourceTexts.join('\n');

// Dynamic key prefixes: a template literal like `discipline.${id}` or
// `firearms.weaponType${capitalize(value)}` builds the key at runtime, so
// every leaf key starting with the literal text before `${` counts as used
// (covers both a dotted namespace prefix and a glued sub-prefix within one).
const dynamicPrefixes = new Set();
const dynamicPrefixRegex = /`([a-zA-Z][a-zA-Z0-9_.]*)\$\{/g;
let match;
while ((match = dynamicPrefixRegex.exec(combinedSource)) !== null) {
  // Require a dot so an unrelated short template literal (e.g. a testID
  // like `s${position}-shot`) can't accidentally exempt a whole letter.
  if (match[1].includes('.')) dynamicPrefixes.add(match[1]);
}

// i18next plural keys are never written out in source: the call site says
// `t('stats.distributionTitleWithCount', { count })` and i18next appends the
// CLDR category itself. Such a key counts as referenced when its BASE key is.
// Only the suffix is exempted — a plural key whose base is unreferenced still
// fails, and the en/sv identical-key-set check above is untouched, so a
// missing `_one` in one language is still an error.
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const commonKeys = [...enKeys.keys()].filter((k) => svKeys.has(k)).sort();
const unused = [];
for (const keyPath of commonKeys) {
  const isDynamic = [...dynamicPrefixes].some((prefix) => keyPath.startsWith(prefix));
  if (isDynamic) continue;
  const lookupKey = keyPath.replace(PLURAL_SUFFIX, '');
  const literalPattern = new RegExp(`['"]${lookupKey.replace(/\./g, '\\.')}['"]`);
  if (!literalPattern.test(combinedSource)) {
    unused.push(keyPath);
  }
}

const issues = [];
if (missingInEn.length > 0) {
  issues.push(
    `Missing in en.json (present in sv.json):\n${missingInEn.map((k) => `  - ${k}`).join('\n')}`,
  );
}
if (missingInSv.length > 0) {
  issues.push(
    `Missing in sv.json (present in en.json):\n${missingInSv.map((k) => `  - ${k}`).join('\n')}`,
  );
}
if (unused.length > 0) {
  issues.push(
    `Unused keys (not referenced in app/src):\n${unused.map((k) => `  - ${k}`).join('\n')}`,
  );
}

if (issues.length > 0) {
  console.error('i18n-check: FAILED\n');
  console.error(issues.join('\n\n'));
  console.error(
    `\ndynamic key prefixes treated as used: ${[...dynamicPrefixes].sort().join(', ') || '(none)'}`,
  );
  process.exit(1);
}

console.log(`en.json: ${enKeys.size} keys, sv.json: ${svKeys.size} keys, 0 issues`);
process.exit(0);
