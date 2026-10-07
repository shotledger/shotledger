import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';

import * as authSchema from '../db/auth-schema';

/** `expo.scheme` in app/app.json. */
const APP_ORIGIN = 'app://';

const DEV_SECRET = 'dev-placeholder-secret-never-use-in-production';

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
 * rate limiter. Locally the base URL is taken from the request, as before.
 *
 * TODO(social-sign-in): needs real OAuth app registrations (Google/Apple
 * client id + secret) only the maintainer can create — `socialProviders`
 * would go here once those exist.
 */
export function createAuth(env: Env) {
  const deployed = env.ENVIRONMENT !== 'development';
  if (deployed && env.BETTER_AUTH_SECRET === DEV_SECRET) {
    throw new Error('BETTER_AUTH_SECRET is the dev placeholder in a deployed environment');
  }
  return betterAuth({
    database: drizzleAdapter(drizzle(env.DB), { provider: 'sqlite', schema: authSchema }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL || undefined,
    trustedOrigins: [...new Set([APP_ORIGIN, ...list(env.BETTER_AUTH_TRUSTED_ORIGINS)])],
    emailAndPassword: { enabled: true },
    // Per-isolate memory would not limit anything on Workers, so the
    // counters live in D1 (`rate_limit`). The rules are better-auth's
    // defaults: 100 requests per 10 s, sign-in/sign-up 3 per 10 s, per IP.
    rateLimit: { enabled: deployed, storage: 'database' },
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    // The message only: the extra arguments are error objects, and a Drizzle
    // query error carries its bound parameters (session tokens, emails).
    logger: {
      level: 'warn',
      log: (level, message) => {
        (level === 'error' ? console.error : console.warn)(`[better-auth] ${message}`);
      },
    },
    plugins: [bearer()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
