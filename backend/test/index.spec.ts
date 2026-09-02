import { createExecutionContext, env, SELF, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import app from '../src/index';

describe('Hono hello-world worker', () => {
  it('responds on / (unit style)', async () => {
    const request = new Request('http://example.com/');
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(await response.text()).toBe('ShotLedger backend — hello world');
  });

  it('responds on / (integration style)', async () => {
    const response = await SELF.fetch('https://example.com/');
    expect(await response.text()).toBe('ShotLedger backend — hello world');
  });
});
