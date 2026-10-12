import { Hono } from 'hono';

import { betterAuthAuthenticator } from './auth';
import { createAuth, DEV_SECRET } from './auth/better-auth';
import { purgeStaleAuthRateLimits } from './db/auth-rate-limit-purge';
import { apiResponseHeaders, WORKER_PATHS } from './lib/api-headers';
import { requestWithoutCookies, responseWithoutCookies } from './lib/cookies';
import { logSafeErrors } from './lib/errors';
import { createAccountRoutes } from './routes/account';
import { createPhotoRoutes } from './routes/photos';
import { createSyncRoutes } from './routes/sync';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const app = new Hono<{ Bindings: Env }>();

// The development config runs on the public dev secret, so it serves only
// local hosts: a top level deployed by mistake answers nothing.
app.use('*', async (c, next) => {
  const devSecret = (c.env.BETTER_AUTH_SECRET || DEV_SECRET) === DEV_SECRET;
  if (c.env.ENVIRONMENT === 'development' && devSecret) {
    const host = new URL(c.req.url).hostname;
    if (!LOCAL_HOSTS.has(host)) {
      console.error(`Refusing ${host}: the development config serves local hosts only`);
      return c.text('Internal Server Error', 500);
    }
  }
  await next();
});

for (const path of WORKER_PATHS) app.use(path, apiResponseHeaders);

app.get('/', (c) => c.text('ShotLedger backend — hello world'));

// better-auth's own handler serves sign-up/sign-in/sign-out/session
// endpoints (docs/specs/backend-auth-photos-spec.md §2).
// Bearer only: no cookie goes in or comes out (lib/cookies.ts).
app.on(['POST', 'GET'], '/api/auth/*', async (c) =>
  responseWithoutCookies(await createAuth(c.env).handler(requestWithoutCookies(c.req.raw))),
);

// Real auth on /sync (docs/specs/sync-app-spec.md §8) — nothing reachable
// from this Worker trusts a bearer string as a user id.
app.route(
  '/sync',
  createSyncRoutes((env) => betterAuthAuthenticator(createAuth(env))),
);

app.route('/photos', createPhotoRoutes());
app.route('/account', createAccountRoutes());

app.onError(logSafeErrors);

export default {
  fetch: app.fetch,
  async scheduled(_controller, env) {
    await purgeStaleAuthRateLimits(env.DB, Date.now());
  },
} satisfies ExportedHandler<Env>;
