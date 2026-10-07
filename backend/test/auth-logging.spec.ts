// No migrations here on purpose: every better-auth query fails, which is
// the path where it logs a failed query's message.
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import app from '../src/index';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('better-auth logging on a failed query', () => {
  it('never logs the bound parameters', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request('https://example.com/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://example.com' },
        body: JSON.stringify({
          email: 'someone@example.com',
          name: 'Test User',
          password: 'correct horse battery staple',
        }),
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    await response.text();

    const output = [...errors.mock.calls, ...warnings.mock.calls].flat().map(String).join('\n');
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(output).toContain('no such table');
    expect(output).not.toContain('someone@example.com');
    expect(output).not.toContain('correct horse');
  });
});
