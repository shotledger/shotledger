import { Hono } from 'hono';

import {
  checkProtocolVersion,
  MAX_PAYLOAD_BYTES,
  PROTOCOL_VERSION,
  PullRequestSchema,
  PushRequestSchema,
  type PullResponse,
  type PushResponse,
} from '@shotledger/shared/src/sync';

import type { Authenticator } from '../auth';
import { applyPush, createDb, pullTablePage } from '../db/queries';

export interface SyncEnv {
  Bindings: Env;
  Variables: { userId: string };
}

/**
 * No default authenticator: a mount must name one, so the dev stub can never
 * be picked up by accident (docs/specs/sync-app-spec.md §8).
 */
export function createSyncRoutes(authenticatorFor: (env: Env) => Authenticator) {
  const app = new Hono<SyncEnv>();

  app.use('*', async (c, next) => {
    const userId = await authenticatorFor(c.env).authenticate(c.req.raw);
    if (!userId) return c.json({ error: 'unauthenticated' }, 401);
    c.set('userId', userId);
    await next();
  });

  app.post('/pull', async (c) => {
    const body: unknown = await c.req.json().catch(() => undefined);
    const parsed = PullRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', issues: parsed.error.issues }, 400);
    }

    const versionCheck = checkProtocolVersion(parsed.data.protocolVersion);
    if (!versionCheck.ok) {
      return c.json(versionCheck.error, 409);
    }

    const db = createDb(c.env.DB);
    const userId = c.get('userId');

    const changes: PullResponse['changes'] = [];
    const nextCursors: PullResponse['nextCursors'] = [];

    for (const { tableName, cursor } of parsed.data.tables) {
      const page = await pullTablePage(db, userId, tableName, cursor);
      for (const row of page.rows) {
        changes.push({
          tableName: row.tableName,
          rowId: row.rowId,
          seq: row.seq,
          payload: row.payload,
          deletedAt: row.deletedAt,
          updatedAt: row.updatedAt,
        });
      }
      nextCursors.push({ tableName, cursor: page.cursor, hasMore: page.hasMore });
    }

    const response: PullResponse = { protocolVersion: PROTOCOL_VERSION, changes, nextCursors };
    return c.json(response);
  });

  app.post('/push', async (c) => {
    const body: unknown = await c.req.json().catch(() => undefined);
    const parsed = PushRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', issues: parsed.error.issues }, 400);
    }

    const versionCheck = checkProtocolVersion(parsed.data.protocolVersion);
    if (!versionCheck.ok) {
      return c.json(versionCheck.error, 409);
    }

    // Checked for the whole batch before any write, so a refusal stores nothing.
    const encoder = new TextEncoder();
    const oversized = parsed.data.changes.find(
      (change) =>
        change.payload !== null &&
        encoder.encode(JSON.stringify(change.payload)).byteLength > MAX_PAYLOAD_BYTES,
    );
    if (oversized) {
      return c.json(
        {
          error: 'payload_too_large',
          clientChangeId: oversized.clientChangeId,
          maxPayloadBytes: MAX_PAYLOAD_BYTES,
        },
        413,
      );
    }

    const db = createDb(c.env.DB);
    const userId = c.get('userId');

    const acks = await applyPush(db, userId, parsed.data.changes);

    const response: PushResponse = { protocolVersion: PROTOCOL_VERSION, acks };
    return c.json(response);
  });

  return app;
}
