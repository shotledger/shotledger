import { describe, expect, it } from 'vitest';

import { requestWithoutCookies, responseWithoutCookies, withoutCookies } from './cookies';

describe('cookie stripping', () => {
  it('drops the Cookie header and keeps the rest', () => {
    const headers = withoutCookies(
      new Headers({ cookie: 'a=1', authorization: 'Bearer t', origin: 'https://x' }),
    );
    expect(headers.has('cookie')).toBe(false);
    expect(headers.get('authorization')).toBe('Bearer t');
  });

  it('rebuilds a request without its cookie, body and method intact', async () => {
    const request = requestWithoutCookies(
      new Request('https://x/api/auth/sign-in/email', {
        method: 'POST',
        headers: { cookie: 'a=1', 'content-type': 'application/json' },
        body: '{"email":"e"}',
      }),
    );
    expect(request.headers.has('cookie')).toBe(false);
    expect(request.method).toBe('POST');
    expect(await request.text()).toBe('{"email":"e"}');
  });

  it('drops every Set-Cookie from a response and keeps its status and other headers', async () => {
    const headers = new Headers({ 'set-auth-token': 'tok' });
    headers.append('set-cookie', 'a=1; Max-Age=604800');
    headers.append('set-cookie', 'b=2');
    const response = responseWithoutCookies(new Response('{}', { status: 200, headers }));
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(response.headers.get('set-auth-token')).toBe('tok');
    expect(await response.text()).toBe('{}');
  });

  it('passes a response with no cookie through untouched', () => {
    const original = new Response('x');
    expect(responseWithoutCookies(original)).toBe(original);
  });
});
