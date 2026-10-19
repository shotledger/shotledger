#!/usr/bin/env node
// Sets up one deployed env (`staging` or `production`) on the maintainer's
// Cloudflare account, so the first deploy is three commands instead of a
// page of steps (#671, docs/release.md "Cloud sync backend"). Run by the
// maintainer after `npx wrangler login`; an agent never runs it, because it
// acts on the account and `secret put` creates the Worker.
//
// It creates the env's D1 database and R2 bucket, writes the database id,
// the hostname's route and BETTER_AUTH_URL into `backend/wrangler.jsonc`
// (and, for production, the app's `apiBaseUrl` into `app/app.json`), then
// generates BETTER_AUTH_SECRET, keeps it under
// ~/cloud/agents/secrets/shotledger/ and uploads it. It does not migrate or
// deploy. Running it again is safe: existing resources, a filled-in config
// and a kept secret are reused, and a value that differs from the one asked
// for stops it rather than being overwritten.
//
// Usage: node scripts/cloudflare-setup.mjs <staging|production> <hostname> [--eu] [--dry-run]
//   --eu       keep the data in the EU (D1 and R2 jurisdiction). Only takes
//              effect when the database and bucket are created; it cannot
//              be changed afterwards.
//   --dry-run  print the config changes and the commands; change nothing.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER_CONFIG = join(ROOT, 'backend', 'wrangler.jsonc');
const APP_CONFIG = join(ROOT, 'app', 'app.json');
const SECRETS_DIR = join(homedir(), 'cloud', 'agents', 'secrets', 'shotledger');
const ENVS = ['staging', 'production'];
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export const resourceNames = (env) =>
  env === 'production'
    ? { database: 'shotledger-sync', bucket: 'shotledger-photos' }
    : { database: `shotledger-sync-${env}`, bucket: `shotledger-photos-${env}` };

// The text of `env.<name>` in wrangler.jsonc: from its key to the next
// env's key, or to the end of the file for the last one.
function envBlock(text, env) {
  const start = text.indexOf(`"${env}": {`);
  if (start < 0) throw new Error(`wrangler.jsonc has no "${env}" env`);
  const next = ENVS.map((other) => text.indexOf(`"${other}": {`, start + 1))
    .filter((index) => index > start)
    .sort((a, b) => a - b)[0];
  return { start, end: next ?? text.length };
}

// Replaces `placeholder` with `value` inside one env's block. Already
// `value` is fine; neither is an error, so a hand-edited value is never
// overwritten.
function fill(text, env, what, placeholder, value) {
  const { start, end } = envBlock(text, env);
  const block = text.slice(start, end);
  if (block.includes(placeholder)) {
    return text.slice(0, start) + block.replace(placeholder, value) + text.slice(end);
  }
  if (block.includes(value)) return text;
  throw new Error(`env.${env} ${what} is neither the placeholder nor ${value}: edit it by hand`);
}

export function isFilledIn(text, env, placeholder) {
  const { start, end } = envBlock(text, env);
  return !text.slice(start, end).includes(placeholder);
}

export function patchWranglerConfig(text, { env, hostname, databaseId, eu }) {
  let out = fill(text, env, 'database_id', `"REPLACE_ME-${env}-d1-id"`, `"${databaseId}"`);
  out = fill(
    out,
    env,
    'BETTER_AUTH_URL',
    '"BETTER_AUTH_URL": "https://REPLACE_ME.invalid"',
    `"BETTER_AUTH_URL": "https://${hostname}"`,
  );
  out = fill(
    out,
    env,
    'routes',
    '// "routes": [{ "pattern": "REPLACE_ME", "custom_domain": true }],',
    `"routes": [{ "pattern": "${hostname}", "custom_domain": true }],`,
  );
  if (eu) {
    const { bucket } = resourceNames(env);
    const line = `"bucket_name": "${bucket}",`;
    const { start, end } = envBlock(out, env);
    const block = out.slice(start, end);
    if (!block.includes('"jurisdiction": "eu"')) {
      const at = block.indexOf(line);
      if (at < 0) throw new Error(`env.${env} has no ${line}`);
      const indent = block.slice(block.lastIndexOf('\n', at) + 1, at);
      const patched =
        block.slice(0, at + line.length) +
        `\n${indent}"jurisdiction": "eu",` +
        block.slice(at + line.length);
      out = out.slice(0, start) + patched + out.slice(end);
    }
  }
  if (!isFilledIn(out, env, 'REPLACE_ME')) {
    throw new Error(`env.${env} still has a REPLACE_ME after patching`);
  }
  return out;
}

export function patchAppConfig(text, hostname) {
  const app = JSON.parse(text);
  app.expo.extra.apiBaseUrl = `https://${hostname}`;
  return `${JSON.stringify(app, null, 2)}\n`;
}

function wrangler(args, { input, dryRun } = {}) {
  console.log(`$ wrangler ${args.join(' ')}`);
  if (dryRun) return '';
  return execFileSync('pnpm', ['exec', 'wrangler', ...args], {
    cwd: join(ROOT, 'backend'),
    encoding: 'utf8',
    input,
    stdio: [input === undefined ? 'inherit' : 'pipe', 'pipe', 'inherit'],
  });
}

// `create` that tolerates a resource left by an earlier, interrupted run.
function createUnlessExists(args, dryRun) {
  try {
    wrangler(args, { dryRun });
  } catch (error) {
    if (!/already exists/i.test(`${error.stdout ?? ''}${error.message}`)) throw error;
    console.log('  already exists; reusing it');
  }
}

function main(argv) {
  const [env, hostname] = argv.filter((arg) => !arg.startsWith('--'));
  const eu = argv.includes('--eu');
  const dryRun = argv.includes('--dry-run');
  if (!ENVS.includes(env) || !HOSTNAME.test(hostname ?? '')) {
    console.error(
      'Usage: node scripts/cloudflare-setup.mjs <staging|production> <hostname> [--eu] [--dry-run]\n' +
        'The hostname is bare, e.g. staging.example.org: no https://, no path.',
    );
    process.exit(2);
  }
  const { database, bucket } = resourceNames(env);
  const jurisdiction = eu ? ['--jurisdiction', 'eu'] : [];
  const before = readFileSync(WRANGLER_CONFIG, 'utf8');

  // 1. D1: create unless the config already carries this env's id.
  let databaseId = 'DRY-RUN-database-id';
  if (isFilledIn(before, env, `REPLACE_ME-${env}-d1-id`)) {
    console.log(`env.${env} already has a database_id; not creating ${database}`);
  } else {
    createUnlessExists(['d1', 'create', database, ...jurisdiction], dryRun);
  }
  if (!dryRun) {
    databaseId = JSON.parse(wrangler(['d1', 'info', database, '--json'])).uuid;
    if (!/^[0-9a-f-]{36}$/.test(databaseId ?? '')) {
      throw new Error(`wrangler d1 info did not return a database id for ${database}`);
    }
  }

  // 2. R2.
  createUnlessExists(['r2', 'bucket', 'create', bucket, ...jurisdiction], dryRun);

  // 3. Config.
  const after = patchWranglerConfig(before, { env, hostname, databaseId, eu });
  const appBefore = readFileSync(APP_CONFIG, 'utf8');
  const appAfter = env === 'production' ? patchAppConfig(appBefore, hostname) : appBefore;
  if (dryRun) {
    console.log(`\n--- backend/wrangler.jsonc, env.${env} after the change ---`);
    const { start, end } = envBlock(after, env);
    console.log(after.slice(start, end));
    if (appAfter !== appBefore) console.log(`app/app.json: apiBaseUrl = https://${hostname}`);
  } else {
    writeFileSync(WRANGLER_CONFIG, after);
    if (appAfter !== appBefore) writeFileSync(APP_CONFIG, appAfter);
    console.log(
      'Updated backend/wrangler.jsonc' + (appAfter !== appBefore ? ' and app/app.json' : ''),
    );
  }

  // 4. Secret: one per env, kept outside the repo, never printed.
  const secretFile = join(SECRETS_DIR, `better-auth-secret-${env}`);
  if (dryRun) {
    console.log(`(secret kept in ${secretFile})`);
  } else if (!existsSync(secretFile)) {
    mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(secretFile, `${randomBytes(32).toString('base64')}\n`, { mode: 0o600 });
    console.log(`Generated BETTER_AUTH_SECRET into ${secretFile}`);
  } else {
    console.log(`Reusing BETTER_AUTH_SECRET from ${secretFile}`);
  }
  wrangler(['secret', 'put', 'BETTER_AUTH_SECRET', '--env', env], {
    input: dryRun ? undefined : readFileSync(secretFile, 'utf8').trim(),
    dryRun,
  });

  console.log(
    `\nDone${dryRun ? ' (dry run: nothing changed)' : ''}. Next, from backend/:\n` +
      `  pnpm db:migrate:${env}\n` +
      `  pnpm deploy:${env}\n` +
      'then the smoke test in docs/release.md, and commit the config change on a branch.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
