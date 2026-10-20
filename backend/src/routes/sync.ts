import { Hono } from 'hono';

import {
  checkProtocolVersion,
  isSyncableSettingRow,
  MAX_PAYLOAD_BYTES,
  PROTOCOL_VERSION,
  PullRequestSchema,
  PushRequestSchema,
  REJECTED_FAMILY,
  type PullResponse,
  type PushResponse,
} from '@shotledger/shared/src/sync';
import { validatePayload } from '@shotledger/shared/src/sync/payload-schemas';

import type { Authenticator } from '../auth';
import {
  applyPush,
  createDb,
  pullTablePage,
  PushBusyError,
  readRefusals,
  toChangeRow,
  type WaitingRow,
} from '../db/queries';

/**
 * #697's validator, run again on a waiting row before the server applies it,
 * since it may have tightened since the row arrived
 * (docs/specs/sync-family-refusal-spec.md §11.5). The log names the table and
 * the columns, never a value or an id (N6).
 */
function stillValid(row: WaitingRow): boolean {
  const verdict = validatePayload({ ...row, deletedAt: null });
  if (verdict.ok) return true;
  const columns = verdict.issues.map((issue) => `${issue.path || '(row)'}:${issue.code}`);
  console.warn(
    `sync push: a waiting ${row.tableName} row no longer validates (${columns.join(', ')})`,
  );
  return false;
}

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

    // Read before the pages, so a record the pages then release is listed
    // and its release pulled, never the reverse (§11.7).
    const refusals = await readRefusals(db, userId);
    const changes: PullResponse['changes'] = [];
    const nextCursors: PullResponse['nextCursors'] = [];

    for (const { tableName, cursor } of parsed.data.tables) {
      const page = await pullTablePage(db, userId, tableName, cursor);
      for (const row of page.rows) changes.push(toChangeRow(row));
      nextCursors.push({ tableName, cursor: page.cursor, hasMore: page.hasMore });
    }

    const response: PullResponse = {
      protocolVersion: PROTOCOL_VERSION,
      changes,
      refusals,
      nextCursors,
    };
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

    const db = createDb(c.env.DB);
    const userId = c.get('userId');

    // The server judges every change against the account's refused families
    // and applies the waiting rows when a family is released
    // (sync-family-refusal-spec.md §11.4, §11.5).
    let acks: PushResponse['acks'];
    try {
      acks = await applyPush(db, userId, parsed.data.changes, { invalid, revalidate: stillValid });
    } catch (error) {
      if (error instanceof PushBusyError) return c.json({ error: 'busy' }, 503);
      throw error;
    }

    // One line per push: the count and the tables of the changes refused
    // with their family, never an id or a value (N6).
    const family = acks.flatMap((ack, index) =>
      ack.status === 'rejected' && ack.reason === REJECTED_FAMILY
        ? [parsed.data.changes[index]!.tableName]
        : [],
    );
    if (family.length > 0) {
      const tables = [...new Set(family)].sort();
      console.warn(`sync push: refused ${family.length} with their family (${tables.join(', ')})`);
    }

    const response: PushResponse = { protocolVersion: PROTOCOL_VERSION, acks };
    return c.json(response);
  });

  return app;
}
