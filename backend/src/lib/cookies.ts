// Every client authenticates with a bearer token (the phone from SecureStore,
// the web app from sessionStorage), so no cookie is ever a credential: none
// is set, and one a browser still holds from before is not read.

/** A copy of `headers` with no Cookie header. */
export function withoutCookies(headers: Headers): Headers {
  const copy = new Headers(headers);
  copy.delete('cookie');
  return copy;
}

/** `request` without its Cookie header. */
export function requestWithoutCookies(request: Request): Request {
  return new Request(request, { headers: withoutCookies(request.headers) });
}

/** `response` without any Set-Cookie header. */
export function responseWithoutCookies(response: Response): Response {
  if (!response.headers.has('set-cookie')) return response;
  const copy = new Response(response.body, response);
  copy.headers.delete('set-cookie');
  return copy;
}
