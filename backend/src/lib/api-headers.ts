import type { MiddlewareHandler } from 'hono';

/** The paths the Worker answers itself (`assets.run_worker_first` in wrangler.jsonc). */
export const WORKER_PATHS = ['/api/*', '/sync/*', '/photos/*', '/account/*'];

/**
 * web/public/_headers covers only static assets. Every Worker response is
 * per-user (photos included), so nothing may be cached.
 */
export const apiResponseHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('Cache-Control', 'no-store');
};
