import {
  applyD1Migrations,
  createExecutionContext,
  createScheduledController,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

import { RATE_LIMIT_WINDOW_MS } from '../src/config';
import { ALL_MIGRATIONS } from '../src/db/migrations';
import worker from '../src/index';

beforeAll(async () => {
  await applyD1Migrations(env.DB, ALL_MIGRATIONS);
});

async function ids(sql: string): Promise<string[]> {
  const { results } = await env.DB.prepare(sql).all<{ id: string }>();
  return results.map((row) => row.id).sort();
}

describe('the expired-records purge cron', () => {
  it('deletes expired sessions with their IP address and keeps live ones', async () => {
    const now = Date.now();
    const session = (id: string, expiresAt: number) =>
      env.DB.prepare(
        `INSERT INTO session (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id)
         VALUES (?, ?, ?, ?, ?, '192.0.2.10', 'test-agent', 'purge-user')`,
      ).bind(id, expiresAt, `token-${id}`, now - 86_400_000, now - 86_400_000);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
         VALUES ('purge-user', 'purge@example.com', 'purge@example.com', 0, ?, ?)`,
      ).bind(now, now),
      session('expired', now - 1_000),
      session('live', now + 3_600_000),
    ]);

    await worker.scheduled(createScheduledController(), env);

    expect(await ids("SELECT id FROM session WHERE user_id = 'purge-user'")).toEqual(['live']);
  });

  it('keeps a session better-auth just created, so expires_at is compared in its own unit', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request('https://localhost/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://localhost',
          'cf-connecting-ip': '192.0.2.11',
        },
        body: JSON.stringify({
          email: 'purge-real@example.com',
          name: 'purge-real@example.com',
          password: 'correct horse battery staple',
        }),
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);

    await worker.scheduled(createScheduledController(), env);

    const { results } = await env.DB.prepare(
      "SELECT s.id FROM session s JOIN user u ON u.id = s.user_id WHERE u.email = 'purge-real@example.com'",
    ).all();
    expect(results).toHaveLength(1);
  });

  it('deletes expired verifications and keeps pending ones', async () => {
    const now = Date.now();
    const verification = (id: string, expiresAt: number) =>
      env.DB.prepare(
        `INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at)
         VALUES (?, ?, 'v', ?, ?, ?)`,
      ).bind(id, `purge-${id}`, expiresAt, now, now);
    await env.DB.batch([
      verification('expired', now - 1_000),
      verification('pending', now + 60_000),
    ]);

    await worker.scheduled(createScheduledController(), env);

    expect(await ids("SELECT id FROM verification WHERE identifier LIKE 'purge-%'")).toEqual([
      'pending',
    ]);
  });

  it('deletes photo upload windows that have ended and keeps the current one', async () => {
    const now = Date.now();
    const current = now - (now % RATE_LIMIT_WINDOW_MS);
    const window = (start: number) =>
      env.DB.prepare(
        "INSERT INTO rate_limit_windows (user_id, window_start, count) VALUES ('purge-uploader', ?, 3)",
      ).bind(start);
    await env.DB.batch([window(current - RATE_LIMIT_WINDOW_MS), window(current)]);

    await worker.scheduled(createScheduledController(), env);

    const { results } = await env.DB.prepare(
      "SELECT window_start FROM rate_limit_windows WHERE user_id = 'purge-uploader'",
    ).all<{ window_start: number }>();
    expect(results.map((row) => row.window_start)).toEqual([current]);
  });
});
