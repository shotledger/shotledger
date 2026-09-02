import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';

import * as authSchema from '../db/auth-schema';

/**
 * See docs/specs/backend-auth-photos-spec.md §2. `bearer()` lets a mobile
 * client send `Authorization: Bearer <sessionToken>` instead of relying on
 * cookies, matching the shape `backend/src/auth.ts`'s `Authenticator`
 * interface already expects.
 *
 * TODO(social-sign-in): needs real OAuth app registrations (Google/Apple
 * client id + secret) only the maintainer can create — `socialProviders`
 * would go here once those exist.
 */
export function createAuth(env: Env) {
  return betterAuth({
    database: drizzleAdapter(drizzle(env.DB), { provider: 'sqlite', schema: authSchema }),
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: { enabled: true },
    plugins: [bearer()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
