import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { apiResponseHeaders } from './api-headers';

function appAnswering(path: string, respond: () => Response) {
  const app = new Hono();
  app.use('*', apiResponseHeaders);
  app.get(path, respond);
  return app;
}

describe('apiResponseHeaders', () => {
  it('sets them on a response whose headers are immutable', async () => {
    const response = await appAnswering('/api/go', () =>
      Response.redirect('https://localhost/elsewhere', 302),
    ).request('/api/go');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://localhost/elsewhere');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('sandboxes /photos/* only', async () => {
    const photo = await appAnswering('/photos/p1', () => new Response('x')).request('/photos/p1');
    const other = await appAnswering('/sync/x', () => new Response('x')).request('/sync/x');

    expect(photo.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
    expect(other.headers.get('content-security-policy')).toBeNull();
  });
});
