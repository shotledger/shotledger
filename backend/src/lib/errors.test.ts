import { DrizzleQueryError } from 'drizzle-orm/errors';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { logSafeErrors, redactingAuthLogger, redactQueryParams } from './errors';

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

  it("keeps any other error's message", async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('BETTER_AUTH_URL is not set');
    error.name = 'AuthConfigError';

    await appThrowing(error).request('/');

    expect(logged.mock.calls.flat().join(' ')).toContain(
      'AuthConfigError: BETTER_AUTH_URL is not set',
    );
  });

  it("passes an HTTPException's own response through", async () => {
    const response = await appThrowing(new HTTPException(418, { message: 'teapot' })).request('/');
    expect(response.status).toBe(418);
  });
});

describe('redactQueryParams', () => {
  it('drops everything from `params:` on', () => {
    expect(
      redactQueryParams('Failed query: select * from user where email = ?\nparams: a@example.com'),
    ).toBe('Failed query: select * from user where email = ?\nparams: [redacted]');
  });

  it('leaves a message without parameters alone', () => {
    expect(redactQueryParams('no such table: user')).toBe('no such table: user');
  });
});

describe('redactingAuthLogger', () => {
  it('logs the redacted message and none of the extra arguments', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    redactingAuthLogger.log('error', 'Failed query: insert into user\nparams: a@example.com,$hash');
    redactingAuthLogger.log('warn', 'User not found');

    expect(errors.mock.calls).toEqual([
      ['[better-auth] Failed query: insert into user\nparams: [redacted]'],
    ]);
    expect(warnings.mock.calls).toEqual([['[better-auth] User not found']]);
  });
});
