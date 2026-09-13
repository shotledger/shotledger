// Catches a Swedish manual page that has fallen behind its English source.
//
// `mkdocs build --strict` cannot do this. It validates links and nav, and a
// translation three revisions stale is perfectly valid markdown — which is the
// worst failure mode a bilingual manual has, because a reader cannot tell
// which half to believe.
//
// The rule this enforces is deliberately narrow:
//
//   A translation that EXISTS must not be older than its source.
//
// It does not demand that a translation exist. A new English page ships on its
// own and `fallback_to_default` serves it to Swedish readers until someone
// translates it — untranslated is honest, stale is not.
//
//   node scripts/docs-translation-check.mjs
//
// Comparing git commit times rather than mtimes: a fresh clone has every mtime
// set to checkout time, so mtimes would make CI pass on anything.
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manual = join(root, 'docs/manual');
const LOCALE = 'sv';

/** Every .md under docs/manual, recursively. */
function markdownFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...markdownFiles(path));
    else if (entry.endsWith('.md')) found.push(path);
  }
  return found;
}

/**
 * Unix time of the last commit to touch `path`, or null when the file is not
 * committed yet — a translation added in the working tree is not stale, it is
 * simply not history yet.
 */
function lastCommitTime(path) {
  const out = execFileSync('git', ['log', '-1', '--format=%ct', '--', path], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  return out === '' ? null : Number(out);
}

const all = markdownFiles(manual);
const suffix = `.${LOCALE}.md`;
const sources = all.filter((path) => !path.endsWith(suffix));

const stale = [];
let pairs = 0;

for (const source of sources) {
  const translation = `${source.slice(0, -'.md'.length)}${suffix}`;
  if (!all.includes(translation)) continue;
  pairs += 1;

  const sourceTime = lastCommitTime(source);
  const translationTime = lastCommitTime(translation);
  // Either side uncommitted means this is the commit that fixes it.
  if (sourceTime === null || translationTime === null) continue;

  if (translationTime < sourceTime) {
    stale.push({
      source: relative(root, source),
      translation: relative(root, translation),
      behindSeconds: sourceTime - translationTime,
    });
  }
}

const untranslated = sources.length - pairs;

if (stale.length > 0) {
  console.error(`docs-translation-check: ${stale.length} translation(s) behind their source\n`);
  for (const entry of stale) {
    const days = Math.floor(entry.behindSeconds / 86400);
    console.error(`  ${entry.translation}`);
    console.error(`    is ${days} day(s) behind ${entry.source}`);
  }
  console.error(
    '\nUpdate the translation in the same change as the source, or delete it —' +
      '\nan untranslated page falls back to English, which is better than a wrong one.',
  );
  process.exit(1);
}

console.log(
  `docs-translation-check: ${pairs} translated page(s) current, ` +
    `${untranslated} not translated yet (falling back to English)`,
);
