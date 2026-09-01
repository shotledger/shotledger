import { Hono } from 'hono';

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.text('ShotLedger backend — hello world'));

export default app;
