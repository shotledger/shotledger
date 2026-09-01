import { Hono } from 'hono';

import { createSyncRoutes } from './routes/sync';

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.text('ShotLedger backend — hello world'));
app.route('/sync', createSyncRoutes());

export default app;
