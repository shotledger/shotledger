import { DrizzleQueryError } from 'drizzle-orm/errors';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { logSafeErrors } from './errors';

function appThrowing(error: Error) {
  const app = new Hono();
  app.get('/', () => {
    throw error;
  });
  app.onError(logSafeErrors);
  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logSafeErrors', () => {
  it("logs a failed query's driver message, never its bound parameters", async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new DrizzleQueryError(
      'select * from session where token = ?',
      ['secret-session-token', 'someone@example.com'],
      new Error('D1_ERROR: no such table: session'),
    );

    const response = await appThrowing(error).request('/');

    expect(response.status).toBe(500);
    const output = logged.mock.calls.flat().join(' ');
    expect(output).toContain('no such table: session');
    expect(output).not.toContain('secret-session-token');
    expect(output).not.toContain('someone@example.com');
  });

  it("passes an HTTPException's own response through", async () => {
    const response = await appThrowing(new HTTPException(418, { message: 'teapot' })).request('/');
    expect(response.status).toBe(418);
  });
});
