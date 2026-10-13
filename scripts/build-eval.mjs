// Builds an evaluation APK (docs/release.md, "Evaluation builds"). The build
// expires EVAL_DAYS days after it is built, 30 by default; an explicit
// EXPO_PUBLIC_EVAL_EXPIRES_AT wins. Maintainer-run, never for a Play build.
//
//   node scripts/build-eval.mjs              # expires in 30 days
//   EVAL_DAYS=14 node scripts/build-eval.mjs
import { execFileSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';

const DEFAULT_DAYS = 30;

/** `YYYY-MM-DD`, `days` whole days after `now`'s UTC date (midnight UTC). */
export function expiryDate(now, days) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
  return d.toISOString().slice(0, 10);
}

function main() {
  if (process.env.EXPO_PUBLIC_ENABLE_DEV_TOOLS) {
    throw new Error(
      'EXPO_PUBLIC_ENABLE_DEV_TOOLS is set: an evaluation build must not ship dev tools.',
    );
  }
  const raw = process.env.EVAL_DAYS ?? String(DEFAULT_DAYS);
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1)
    throw new Error(`EVAL_DAYS must be a positive integer, got "${raw}".`);
  const expiresAt = process.env.EXPO_PUBLIC_EVAL_EXPIRES_AT || expiryDate(new Date(), days);
  const env = { ...process.env, EXPO_PUBLIC_EVAL_EXPIRES_AT: expiresAt };

  console.log(`Evaluation build, expires ${expiresAt}`);
  execFileSync('pnpm', ['exec', 'expo', 'prebuild', '--platform', 'android', '--no-install'], {
    cwd: 'app',
    env,
    stdio: 'inherit',
  });
  execFileSync('./gradlew', ['assembleRelease', '-PreactNativeArchitectures=arm64-v8a'], {
    cwd: 'app/android',
    env,
    stdio: 'inherit',
  });

  const apk = `shotledger-eval-expires-${expiresAt}.apk`;
  copyFileSync('app/android/app/build/outputs/apk/release/app-release.apk', apk);
  console.log(`\n${apk}\n\nHand-out message:\n`);
  console.log(
    `ShotLedger evaluation build, for your personal testing only. No other license is granted; please don't pass the APK on. It stops working on ${expiresAt}; ask me for a new build after that.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
