import { describe, expect, it } from 'vitest';

import {
  PASSKEY_CHALLENGE_HEADER,
  requestWithoutCookies,
  responseWithoutCookies,
  withoutCookies,
} from './cookies';

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

describe('the passkey challenge header', () => {
  const pair = '__Secure-better-auth.better-auth-passkey=abc.sig%3D';

  it('hands the challenge cookie out as a header, and no cookie', () => {
    const headers = new Headers();
    headers.append('set-cookie', `${pair}; Max-Age=300; Path=/; HttpOnly; Secure; SameSite=Lax`);
    headers.append('set-cookie', '__Secure-better-auth.session_token=s; Max-Age=604800');
    const response = responseWithoutCookies(new Response('{}', { headers }));
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(response.headers.get(PASSKEY_CHALLENGE_HEADER)).toBe(pair);
  });

  it('adds no header when no challenge cookie was set', () => {
    const headers = new Headers({ 'set-cookie': 'better-auth.session_token=s' });
    const response = responseWithoutCookies(new Response('{}', { headers }));
    expect(response.headers.has(PASSKEY_CHALLENGE_HEADER)).toBe(false);
  });

  it('turns the header back into the only cookie', () => {
    const request = requestWithoutCookies(
      new Request('https://x/api/auth/passkey/verify-authentication', {
        method: 'POST',
        headers: { cookie: 'a=1', [PASSKEY_CHALLENGE_HEADER]: pair },
      }),
    );
    expect(request.headers.get('cookie')).toBe(pair);
    expect(request.headers.has(PASSKEY_CHALLENGE_HEADER)).toBe(false);
  });

  it.each([
    'better-auth.session_token=s',
    `${pair}; better-auth.session_token=s`,
    `${pair}, better-auth.session_token=s`,
    'better-auth.better-auth-passkey=',
  ])('carries no cookie for the malformed header %s', (value) => {
    const request = requestWithoutCookies(
      new Request('https://x/', { headers: { [PASSKEY_CHALLENGE_HEADER]: value } }),
    );
    expect(request.headers.has('cookie')).toBe(false);
  });

  it('accepts the unprefixed name a local http config uses', () => {
    const local = 'better-auth.better-auth-passkey=abc.sig';
    const request = requestWithoutCookies(
      new Request('http://localhost/', { headers: { [PASSKEY_CHALLENGE_HEADER]: local } }),
    );
    expect(request.headers.get('cookie')).toBe(local);
  });
});
