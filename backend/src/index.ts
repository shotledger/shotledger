import { Hono } from 'hono';

import { betterAuthAuthenticator } from './auth';
import { createAuth } from './auth/better-auth';
import { createAccountRoutes } from './routes/account';
import { createPhotoRoutes } from './routes/photos';
import { createSyncRoutes } from './routes/sync';

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.text('ShotLedger backend — hello world'));

// better-auth's own handler serves sign-up/sign-in/sign-out/session
// endpoints (docs/specs/backend-auth-photos-spec.md §2).
app.on(['POST', 'GET'], '/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw));

// Real auth on /sync (docs/specs/sync-app-spec.md §8). createSyncRoutes'
// own default is still the dev stub, which is what backend/test/sync.spec.ts
// mounts for its bare-token fixtures — nothing reachable from this Worker
// trusts a bearer string as a user id.
app.route(
  '/sync',
  createSyncRoutes((env) => betterAuthAuthenticator(createAuth(env))),
);

app.route('/photos', createPhotoRoutes());
app.route('/account', createAccountRoutes());

export default app;
