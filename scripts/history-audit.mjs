#!/usr/bin/env node
// Audits every commit that going public would publish, before the repo's
// visibility changes (#100, docs/release.md "Going public"). Public means
// every commit reachable from a branch, a tag or a pull request
// (refs/pull/*/head), not only main, so those refs are fetched first.
//
// Reports and fails on: credential-shaped strings in added lines, sensitive
// file names, image/data files outside the allowed folders, and commit
// authors outside the expected set. It never prints a matched value, only
// the commit and file, so the report itself cannot leak one. PII that has no
// pattern (a real name, a photo's content) still needs a human look at what
// it lists.
//
// Usage: node scripts/history-audit.mjs [--no-fetch]
import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 30 });

if (!process.argv.includes('--no-fetch')) {
  git(
    'fetch',
    '--quiet',
    'origin',
    '+refs/heads/*:refs/remotes/origin/*',
    '+refs/tags/*:refs/tags/*',
  );
  git('fetch', '--quiet', 'origin', '+refs/pull/*/head:refs/audit/pull/*');
}

const SECRET_PATTERNS = [
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['GitHub token', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}/],
  ['Slack token', /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ['Anthropic/OpenAI key', /\bsk-(ant-)?[A-Za-z0-9_-]{32,}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];
const SENSITIVE_NAME =
  /(^|\/)(\.env(\..*)?|.*\.(pem|p12|jks|keystore|p8|mobileprovision)|google-services\.json|GoogleService-Info\.plist)$/i;
const DATA_FILE = /\.(jpe?g|png|heic|webp|gif|pdf|csv|xlsx?|zip|db|sqlite)$/i;
const DATA_ALLOWED = [
  /^app\/assets\//,
  /^docs\/manual\/(assets|img|images)\//,
  /^web\/public\//,
  /^branding\//,
  /^app\/src\/features\/licenses\/__fixtures__\/synthetic-license-card\.png$/,
];
const AUTHORS_ALLOWED = new Set([
  'jimisola@jimisola.com',
  'noreply@anthropic.com',
  '29139614+renovate[bot]@users.noreply.github.com',
]);

const findings = [];
const commits = git('rev-list', '--all').trim().split('\n');

for (const email of new Set(git('log', '--all', '--format=%ae').trim().split('\n'))) {
  if (!AUTHORS_ALLOWED.has(email)) findings.push(`unexpected commit author: ${email}`);
}

for (const path of new Set(
  git('log', '--all', '--diff-filter=A', '--name-only', '--format=').split('\n'),
)) {
  if (!path) continue;
  if (SENSITIVE_NAME.test(path)) findings.push(`sensitive file name ever added: ${path}`);
  if (DATA_FILE.test(path) && !DATA_ALLOWED.some((re) => re.test(path)))
    findings.push(`image or data file outside the allowed folders: ${path}`);
}

let commit = '';
let file = '';
for (const line of git(
  'log',
  '--all',
  '-p',
  '--no-color',
  '--no-ext-diff',
  '--format=COMMIT %H',
).split('\n')) {
  if (line.startsWith('COMMIT ')) commit = line.slice(7, 19);
  else if (line.startsWith('+++ b/')) file = line.slice(6);
  else if (line.startsWith('+')) {
    for (const [what, re] of SECRET_PATTERNS) {
      if (re.test(line)) findings.push(`${what} in ${commit} ${file}`);
    }
  }
}

console.log(`Audited ${commits.length} commits.`);
if (findings.length === 0) {
  console.log('No findings.');
} else {
  for (const f of [...new Set(findings)]) console.log(`- ${f}`);
  process.exitCode = 1;
}
