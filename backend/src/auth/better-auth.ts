import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';

import * as authSchema from '../db/auth-schema';
import { redactingAuthLogger } from '../lib/errors';

/** `expo.scheme` in app/app.json. */
const APP_ORIGIN = 'app://';

/** Local development and the test suite only; never a `vars` entry. */
export const DEV_SECRET = 'dev-placeholder-secret-never-use-in-production';

export class AuthConfigError extends Error {
  override name = 'AuthConfigError';
}

/**
 * A deployed env must bring its own secret and base URL: without a secret,
 * better-auth falls back to its public default and, with no `NODE_ENV` on
 * Workers, only warns.
 */
function deployedConfig(env: Env): { secret: string; baseURL: string } {
  const secret = env.BETTER_AUTH_SECRET ?? '';
  if (secret === DEV_SECRET) throw new AuthConfigError('BETTER_AUTH_SECRET is the dev placeholder');
  if (secret.length < 32) {
    throw new AuthConfigError('BETTER_AUTH_SECRET is missing or shorter than 32 characters');
  }
  if (!env.BETTER_AUTH_URL) throw new AuthConfigError('BETTER_AUTH_URL is not set');
  return { secret, baseURL: env.BETTER_AUTH_URL };
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * See docs/specs/backend-auth-photos-spec.md §2. `bearer()` lets a mobile
 * client send `Authorization: Bearer <sessionToken>` instead of relying on
 * cookies, matching the shape `backend/src/auth.ts`'s `Authenticator`
 * interface already expects.
 *
 * Deployed envs (`ENVIRONMENT` other than `development`, backend/wrangler.jsonc)
 * set `BETTER_AUTH_URL` and `BETTER_AUTH_TRUSTED_ORIGINS`, and turn on the
 * rate limiter. Locally the base URL is taken from the request and the
 * secret defaults to `DEV_SECRET`.
 *
 * TODO(social-sign-in): needs real OAuth app registrations (Google/Apple
 * client id + secret) only the maintainer can create — `socialProviders`
 * would go here once those exist.
 */
export function createAuth(env: Env) {
  const deployed = env.ENVIRONMENT !== 'development';
  const { secret, baseURL } = deployed
    ? deployedConfig(env)
    : { secret: env.BETTER_AUTH_SECRET || DEV_SECRET, baseURL: env.BETTER_AUTH_URL || undefined };
  return betterAuth({
    database: drizzleAdapter(drizzle(env.DB), { provider: 'sqlite', schema: authSchema }),
    secret,
    baseURL,
    trustedOrigins: [...new Set([APP_ORIGIN, ...list(env.BETTER_AUTH_TRUSTED_ORIGINS)])],
    emailAndPassword: { enabled: true },
    // Per-isolate memory would not limit anything on Workers, so the
    // counters live in D1 (`rate_limit`). The rules are better-auth's
    // defaults: 100 requests per 10 s, sign-in/sign-up 3 per 10 s, per IP.
    rateLimit: { enabled: deployed, storage: 'database' },
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    logger: redactingAuthLogger,
    // Otherwise its router console.errors an unexpected error whole, query
    // parameters included; thrown, it reaches `logSafeErrors` instead.
    onAPIError: { throw: true },
    plugins: [bearer()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
