import { Hono } from 'hono';

import {
  checkProtocolVersion,
  familyRefusals,
  isSyncableSettingRow,
  MAX_PAYLOAD_BYTES,
  PROTOCOL_VERSION,
  PullRequestSchema,
  PushRequestSchema,
  REJECTED_FAMILY,
  REJECTED_INVALID_PAYLOAD,
  type PullResponse,
  type PushResponse,
} from '@shotledger/shared/src/sync';
import { validatePayload } from '@shotledger/shared/src/sync/payload-schemas';

import type { Authenticator } from '../auth';
import { applyPush, createDb, pullTablePage, type PushRefusal } from '../db/queries';

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

    // Device-local settings never reach the server, from any client (ADR 0019).
    const localSetting = parsed.data.changes.find(
      (change) =>
        change.tableName === 'settings' && !isSyncableSettingRow(change.rowId, change.payload),
    );
    if (localSetting) {
      return c.json(
        { error: 'setting_not_synced', clientChangeId: localSetting.clientChangeId },
        400,
      );
    }

    // A row every device could not apply is refused per change, inside the
    // batch, so one bad row does not hold back the rest (C6). The log names
    // the table and the failing columns, never a value or an id (N6).
    const invalid = new Set<number>();
    for (const [index, change] of parsed.data.changes.entries()) {
      const verdict = validatePayload(change);
      if (verdict.ok) continue;
      invalid.add(index);
      const columns = verdict.issues.map((issue) => `${issue.path || '(row)'}:${issue.code}`);
      console.warn(`sync push: refused ${change.tableName} payload (${columns.join(', ')})`);
    }

    // The rows of a refused row's family in this push go with it, so a
    // session reaches other devices whole or not at all
    // (sync-family-refusal-spec.md §2.2). One line per push: the count and
    // the tables, never an id or a value (N6).
    const family = familyRefusals(parsed.data.changes, invalid);
    if (family.size > 0) {
      const tables = [...new Set([...family].map((i) => parsed.data.changes[i]!.tableName))];
      console.warn(
        `sync push: refused ${family.size} with their family (${tables.sort().join(', ')})`,
      );
    }
    const refusals = parsed.data.changes.map((_change, index): PushRefusal | null =>
      invalid.has(index) ? REJECTED_INVALID_PAYLOAD : family.has(index) ? REJECTED_FAMILY : null,
    );

    const db = createDb(c.env.DB);
    const userId = c.get('userId');

    const acks = await applyPush(db, userId, parsed.data.changes, refusals);

    const response: PushResponse = { protocolVersion: PROTOCOL_VERSION, acks };
    return c.json(response);
  });

  return app;
}
