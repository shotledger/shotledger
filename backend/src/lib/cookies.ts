// Every client authenticates with a bearer token (the phone from SecureStore,
// the web app from sessionStorage), so no cookie is ever a credential: none
// is set, and one a browser still holds from before is not read.
//
// One exception travels as a header instead: `@better-auth/passkey` keeps a
// ceremony's challenge handle in a signed cookie between its options call and
// its verify call. The Worker hands that cookie out as `x-passkey-challenge`
// and turns the header back into the cookie, so a client keeps it the way it
// keeps the bearer token, and the browser's cookie jar is never used.

/** The header that carries the passkey challenge cookie, both ways. */
export const PASSKEY_CHALLENGE_HEADER = 'x-passkey-challenge';

// `createAuthCookie('better-auth-passkey')`: better-auth's prefix, and
// `__Secure-` on an https base URL. The value is better-call's signed cookie.
const PASSKEY_CHALLENGE_COOKIE = /^(?:__Secure-)?better-auth\.better-auth-passkey=[^;\s,]+$/;

/** A copy of `headers` with no Cookie header. */
export function withoutCookies(headers: Headers): Headers {
  const copy = new Headers(headers);
  copy.delete('cookie');
  return copy;
}

/**
 * `request` without its Cookie header. A well-formed passkey challenge
 * header becomes the only cookie; anything else in it is ignored.
 */
export function requestWithoutCookies(request: Request): Request {
  const headers = withoutCookies(request.headers);
  const challenge = headers.get(PASSKEY_CHALLENGE_HEADER)?.trim();
  headers.delete(PASSKEY_CHALLENGE_HEADER);
  if (challenge && PASSKEY_CHALLENGE_COOKIE.test(challenge)) headers.set('cookie', challenge);
  return new Request(request, { headers });
}

/**
 * `response` without any Set-Cookie header. A passkey challenge cookie is
 * handed out as `x-passkey-challenge` (`name=value`, attributes dropped).
 */
export function responseWithoutCookies(response: Response): Response {
  if (!response.headers.has('set-cookie')) return response;
  const challenge = response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0]!.trim())
    .find((pair) => PASSKEY_CHALLENGE_COOKIE.test(pair));
  const copy = new Response(response.body, response);
  copy.headers.delete('set-cookie');
  if (challenge) copy.headers.set(PASSKEY_CHALLENGE_HEADER, challenge);
  return copy;
}
