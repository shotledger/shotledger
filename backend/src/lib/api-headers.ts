import type { MiddlewareHandler } from 'hono';

/** The paths the Worker answers itself (`assets.run_worker_first` in wrangler.jsonc). */
export const WORKER_PATHS = ['/api/*', '/sync/*', '/photos/*', '/account/*'];

/**
 * web/public/_headers covers only static assets. Every Worker response is
 * per-user (photos included), so nothing may be cached. A photo is served
 * with the type it was uploaded with, so it also gets a CSP that runs
 * nothing.
 */
export const apiResponseHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  const headers: [string, string][] = [
    ['X-Content-Type-Options', 'nosniff'],
    ['Cache-Control', 'no-store'],
  ];
  if (c.req.path.startsWith('/photos/')) {
    headers.push(['Content-Security-Policy', "default-src 'none'; sandbox"]);
  }
  try {
    for (const [name, value] of headers) c.res.headers.set(name, value);
  } catch {
    // Immutable headers, e.g. `Response.redirect()`: set them on a copy.
    const copy = new Response(c.res.body, c.res);
    for (const [name, value] of headers) copy.headers.set(name, value);
    c.res = copy;
  }
};
