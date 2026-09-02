import { Hono } from 'hono';

import { createAuth } from './auth/better-auth';
import { createAccountRoutes } from './routes/account';
import { createPhotoRoutes } from './routes/photos';
import { createSyncRoutes } from './routes/sync';

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.text('ShotLedger backend — hello world'));

// better-auth's own handler serves sign-up/sign-in/sign-out/session
// endpoints (docs/specs/backend-auth-photos-spec.md §2).
app.on(['POST', 'GET'], '/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw));

// Sync keeps its dev-stub default authenticator — see the TODO(better-auth)
// note in ./auth.ts for why cutover is a separate, flagged decision.
app.route('/sync', createSyncRoutes());

app.route('/photos', createPhotoRoutes());
app.route('/account', createAccountRoutes());

export default app;
