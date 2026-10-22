// The dev bearer authenticator with an account behind it. In the Worker a
// push is authenticated by better-auth, whose session lookup needs the
// `user` row, so every authenticated push had an account when it began; the
// push guard refuses one whose account is gone (sync-family-refusal-spec.md
// §11.8, round 6, V6-1). Tests that trust the bearer token as the user id
// create that row here, on the real binding, so a gated binding's call
// count does not see it.
import { env } from 'cloudflare:test';

import { devBearerAuthenticator, type Authenticator } from '../src/auth';

/** Creates the `user` row of `userId` if it is missing. */
export async function ensureAccount(userId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO "user" (id, name, email, created_at, updated_at)
     VALUES (?1, ?1, ?1 || '@example.test', 0, 0)`,
  )
    .bind(userId)
    .run();
}

/** Trusts the bearer token as the user id, and makes sure that user exists. */
export const devBearerWithAccount: Authenticator = {
  async authenticate(request: Request): Promise<string | null> {
    const userId = await devBearerAuthenticator.authenticate(request);
    if (userId !== null) await ensureAccount(userId);
    return userId;
  },
};
