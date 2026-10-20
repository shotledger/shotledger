import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { betterAuthAuthenticator, type Authenticator } from '../auth';
import { createAuth } from '../auth/better-auth';
import {
  account as authAccount,
  session as authSession,
  user as authUser,
} from '../db/auth-schema';
import { photos, quota, rateLimitWindows } from '../db/photo-schema';
import { createDb, type Db } from '../db/queries';
import { syncIdempotency, syncRefusals, syncRows, syncSequence } from '../db/schema';

export interface AccountEnv {
  Bindings: Env;
  Variables: { userId: string };
}

interface CascadeCounts {
  syncRows: number;
  syncRefusals: number;
  photos: number;
  quota: number;
  sessions: number;
}

/** Counts every row this user's account deletion would touch (spec §3). */
async function computeCascadeCounts(db: Db, userId: string): Promise<CascadeCounts> {
  const [syncRowsCount, refusalRows, photoRows, quotaRows, sessionRows] = await Promise.all([
    db.select().from(syncRows).where(eq(syncRows.userId, userId)),
    db.select().from(syncRefusals).where(eq(syncRefusals.userId, userId)),
    db.select().from(photos).where(eq(photos.userId, userId)),
    db.select().from(quota).where(eq(quota.userId, userId)),
    db.select().from(authSession).where(eq(authSession.userId, userId)),
  ]);
  return {
    syncRows: syncRowsCount.length,
    syncRefusals: refusalRows.length,
    photos: photoRows.length,
    quota: quotaRows.length,
    sessions: sessionRows.length,
  };
}

/**
 * See docs/specs/backend-auth-photos-spec.md §3. Deletes `session`/`account`
 * rows directly (not via `auth.api.deleteUser`, which gates on an email
 * verification flow this backend has no email provider to complete) — one
 * D1 batch, alongside the sync/photo/quota rows, so account deletion is a
 * single hand-written cascade rather than two separate mechanisms.
 */
export function createAccountRoutes(
  authenticatorFor: (env: Env) => Authenticator = (env) => betterAuthAuthenticator(createAuth(env)),
) {
  const app = new Hono<AccountEnv>();

  app.use('*', async (c, next) => {
    const authenticator = authenticatorFor(c.env);
    const userId = await authenticator.authenticate(c.req.raw);
    if (!userId) return c.json({ error: 'unauthenticated' }, 401);
    c.set('userId', userId);
    await next();
  });

  app.post('/delete', async (c) => {
    const userId = c.get('userId');
    const db: Db = createDb(c.env.DB);
    const body: unknown = await c.req.json().catch(() => ({}));
    const dryRun =
      typeof body === 'object' && body !== null && 'dryRun' in body
        ? Boolean((body as { dryRun?: unknown }).dryRun)
        : false;

    const counts = await computeCascadeCounts(db, userId);

    if (dryRun) {
      return c.json({ dryRun: true, deleted: counts });
    }

    const photoRows = await db.select().from(photos).where(eq(photos.userId, userId));
    // Best-effort: an already-missing R2 object must not abort the rest of
    // the cascade (spec §3 — a partially-deleted account must still finish).
    await Promise.all(
      photoRows.map((p) => c.env.PHOTOS.delete(`${userId}/${p.photoId}`).catch(() => undefined)),
    );

    await db.batch([
      db.delete(photos).where(eq(photos.userId, userId)),
      db.delete(syncRows).where(eq(syncRows.userId, userId)),
      db.delete(syncSequence).where(eq(syncSequence.userId, userId)),
      db.delete(syncIdempotency).where(eq(syncIdempotency.userId, userId)),
      db.delete(syncRefusals).where(eq(syncRefusals.userId, userId)),
      db.delete(quota).where(eq(quota.userId, userId)),
      db.delete(rateLimitWindows).where(eq(rateLimitWindows.userId, userId)),
      db.delete(authSession).where(eq(authSession.userId, userId)),
      db.delete(authAccount).where(eq(authAccount.userId, userId)),
      db.delete(authUser).where(eq(authUser.id, userId)),
    ]);

    return c.json({ dryRun: false, deleted: counts });
  });

  return app;
}
