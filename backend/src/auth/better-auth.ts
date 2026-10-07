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
  // `.invalid` is the REPLACE_ME placeholder in wrangler.jsonc.
  let url: URL | undefined;
  try {
    url = new URL(env.BETTER_AUTH_URL ?? '');
  } catch {
    url = undefined;
  }
  if (!url || url.protocol !== 'https:' || url.hostname.endsWith('.invalid')) {
    throw new AuthConfigError('BETTER_AUTH_URL is not set to an https origin');
  }
  return { secret, baseURL: url.origin };
}

const AUTH_BASE_PATH = '/api/auth';

/** Per client IP. The longest window any rule uses; the purge cron keeps rows this long. */
const SIGN_IN_UP_RULE = { window: 60, max: 5 };
export const RATE_LIMIT_LONGEST_WINDOW_MS = 60_000;

/** Whether `path` (below /api/auth) is one of better-auth's endpoints; `:param` segments match any segment. */
export function isAuthEndpoint(path: string, endpointPaths: readonly string[]): boolean {
  const segments = path.split('/');
  return endpointPaths.some((endpoint) => {
    const parts = endpoint.split('/');
    return (
      parts.length === segments.length &&
      parts.every((part, i) => part.startsWith(':') || part === segments[i])
    );
  });
}

function authPathOf(request: Request): string {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, '');
  return pathname.startsWith(`${AUTH_BASE_PATH}/`)
    ? pathname.slice(AUTH_BASE_PATH.length)
    : pathname;
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
  // Filled in once the instance exists; the rate limiter reads it per request.
  let endpointPaths: string[] = [];
  const auth = betterAuth({
    database: drizzleAdapter(drizzle(env.DB), { provider: 'sqlite', schema: authSchema }),
    secret,
    baseURL,
    trustedOrigins: [...new Set([APP_ORIGIN, ...list(env.BETTER_AUTH_TRUSTED_ORIGINS)])],
    emailAndPassword: { enabled: true },
    // Per-isolate memory would not limit anything on Workers, so the
    // counters live in D1 (`rate_limit`, purged by the cron in index.ts),
    // one row per IP and path. Only real endpoints are counted, so a client
    // cannot mint rows with made-up paths. Otherwise better-auth's defaults
    // apply: 100 requests per 10 s; change-password/change-email 3 per 10 s.
    rateLimit: {
      enabled: deployed,
      storage: 'database',
      customRules: {
        '/sign-in/email': SIGN_IN_UP_RULE,
        '/sign-up/email': SIGN_IN_UP_RULE,
        '/**': (request, current) => isAuthEndpoint(authPathOf(request), endpointPaths) && current,
      },
    },
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    logger: redactingAuthLogger,
    // Otherwise its router console.errors an unexpected error whole, query
    // parameters included; thrown, it reaches `logSafeErrors` instead.
    onAPIError: { throw: true },
    plugins: [bearer()],
  });
  endpointPaths = Object.values(auth.api as Record<string, { path?: string }>)
    .map((endpoint) => endpoint.path)
    .filter((path): path is string => typeof path === 'string');
  return auth;
}

export type Auth = ReturnType<typeof createAuth>;
