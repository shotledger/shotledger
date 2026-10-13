import { Hono } from 'hono';

import { createAuth } from '../auth/better-auth';
import { betterAuthAuthenticator, type Authenticator } from '../auth';
import { MAX_PHOTO_BYTES } from '../config';
import { createDb, type Db } from '../db/queries';
import { findPhoto, getQuota, recordDelete, recordUpload } from '../db/photo-queries';
import { authorizeOwner } from '../lib/authz';
import { checkQuota } from '../lib/quota';
import { D1RateLimiter } from '../lib/rate-limiter-d1';

export interface PhotoEnv {
  Bindings: Env;
  Variables: { userId: string };
}

/** Raster images only: no image/svg+xml, which can carry script. */
const PHOTO_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function r2Key(userId: string, photoId: string): string {
  return `${userId}/${photoId}`;
}

/**
 * See docs/specs/backend-auth-photos-spec.md §5. Default authenticator
 * builds real better-auth per request (needs `c.env`, unlike the sync
 * route's module-scoped default) — overridable for tests.
 */
export function createPhotoRoutes(
  authenticatorFor: (env: Env) => Authenticator = (env) => betterAuthAuthenticator(createAuth(env)),
) {
  const app = new Hono<PhotoEnv>();

  app.use('*', async (c, next) => {
    const authenticator = authenticatorFor(c.env);
    const userId = await authenticator.authenticate(c.req.raw);
    if (!userId) return c.json({ error: 'unauthenticated' }, 401);
    c.set('userId', userId);
    await next();
  });

  app.post('/upload/:photoId', async (c) => {
    const photoId = c.req.param('photoId');
    const userId = c.get('userId');
    const db: Db = createDb(c.env.DB);

    // It is echoed back on download; the app sends image/jpeg.
    const contentType = (c.req.header('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    if (!PHOTO_CONTENT_TYPES.has(contentType)) {
      return c.json({ error: 'unsupported_media_type' }, 415);
    }

    const contentLengthHeader = c.req.header('content-length');
    if (!contentLengthHeader) {
      return c.json({ error: 'content_length_required' }, 411);
    }
    const declaredLength = Number(contentLengthHeader);
    if (!Number.isFinite(declaredLength) || declaredLength < 0) {
      return c.json({ error: 'content_length_required' }, 411);
    }
    if (declaredLength > MAX_PHOTO_BYTES) {
      return c.json({ error: 'photo_too_large' }, 413);
    }

    // A new id has no row yet; an existing one must be the requester's.
    const existing = await findPhoto(db, photoId);
    if (existing && authorizeOwner(existing.userId, userId) === 'not_found') {
      return c.json({ error: 'not_found' }, 404);
    }

    const rateLimiter = new D1RateLimiter(db);
    const rate = await rateLimiter.consume(userId, Date.now());
    if (!rate.allowed) {
      c.header('Retry-After', String(Math.max(0, Math.ceil((rate.resetAt - Date.now()) / 1000))));
      return c.json({ error: 'rate_limited' }, 429);
    }

    // A re-upload replaces the stored object, so its size is not counted twice
    // (as recordUpload nets it); a Retry near the limit then still fits.
    const current = await getQuota(db, userId);
    const replaced = existing?.sizeBytes ?? 0;
    const quotaCheck = checkQuota(current.usedBytes - replaced, current.limitBytes, declaredLength);
    if (!quotaCheck.allowed) {
      return c.json({ error: quotaCheck.reason }, 413);
    }

    const buffer = await c.req.arrayBuffer();
    if (buffer.byteLength !== declaredLength || buffer.byteLength > MAX_PHOTO_BYTES) {
      return c.json({ error: 'photo_too_large' }, 413);
    }

    await c.env.PHOTOS.put(r2Key(userId, photoId), buffer, {
      httpMetadata: { contentType },
    });

    const usage = await recordUpload(
      db,
      userId,
      photoId,
      buffer.byteLength,
      contentType,
      new Date().toISOString(),
    );

    return c.json({ photoId, sizeBytes: buffer.byteLength, usage }, 201);
  });

  app.get('/usage', async (c) => {
    const db: Db = createDb(c.env.DB);
    const userId = c.get('userId');
    const { usedBytes, limitBytes } = await getQuota(db, userId);
    return c.json({ usedBytes, limitBytes, remainingBytes: limitBytes - usedBytes });
  });

  app.get('/:photoId', async (c) => {
    const db: Db = createDb(c.env.DB);
    const userId = c.get('userId');
    const photoId = c.req.param('photoId');

    const row = await findPhoto(db, photoId);
    if (authorizeOwner(row?.userId, userId) === 'not_found') {
      return c.json({ error: 'not_found' }, 404);
    }
    // Non-null: authorizeOwner only returns 'ok' when row is defined.
    const photo = row!;

    const object = await c.env.PHOTOS.get(r2Key(photo.userId, photo.photoId));
    if (!object) return c.json({ error: 'not_found' }, 404);

    return new Response(object.body, {
      headers: { 'content-type': photo.contentType },
    });
  });

  app.delete('/:photoId', async (c) => {
    const db: Db = createDb(c.env.DB);
    const userId = c.get('userId');
    const photoId = c.req.param('photoId');

    const row = await findPhoto(db, photoId);
    if (authorizeOwner(row?.userId, userId) === 'not_found') {
      return c.json({ error: 'not_found' }, 404);
    }
    const photo = row!;

    await c.env.PHOTOS.delete(r2Key(photo.userId, photo.photoId));
    await recordDelete(db, userId, photoId, photo.sizeBytes);

    return c.body(null, 204);
  });

  return app;
}
