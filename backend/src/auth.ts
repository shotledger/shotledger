import type { Auth } from './auth/better-auth';

/**
 * `Authenticator` is the seam a real implementation slots into without
 * touching route code — see `betterAuthAuthenticator` below for the real
 * one (docs/specs/backend-auth-photos-spec.md §2).
 */
export interface Authenticator {
  /** Resolves a request to a user id, or `null` if unauthenticated. */
  authenticate(request: Request): Promise<string | null>;
}

// TODO(better-auth): `backend/src/routes/sync.ts` still defaults to this dev
// stub — cutting it over to `betterAuthAuthenticator` would require rewriting
// `backend/test/sync.spec.ts`'s fixtures around real session tokens, which is
// a deliberate decision for the maintainer, not a side effect of the
// auth+photos task (docs/specs/backend-auth-photos-spec.md §2). This dev
// stub trusts the bearer token verbatim as the user id — never use it
// outside local/test environments.
export const devBearerAuthenticator: Authenticator = {
  async authenticate(request: Request): Promise<string | null> {
    const header = request.headers.get('authorization');
    if (!header?.startsWith('Bearer ')) return null;
    const token = header.slice('Bearer '.length).trim();
    return token.length > 0 ? token : null;
  },
};

/**
 * Real implementation: verifies a bearer session token against better-auth
 * (via its `bearer()` plugin — `createAuth`'s config). Used by `/photos`,
 * `/account`, and implicitly by `/api/auth/*` (better-auth's own handler).
 */
export function betterAuthAuthenticator(auth: Auth): Authenticator {
  return {
    async authenticate(request: Request): Promise<string | null> {
      const session = await auth.api.getSession({ headers: request.headers });
      return session?.user.id ?? null;
    },
  };
}
