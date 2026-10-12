import type { Auth } from './auth/better-auth';
import { withoutCookies } from './lib/cookies';

/**
 * `Authenticator` is the seam a real implementation slots into without
 * touching route code — see `betterAuthAuthenticator` below for the real
 * one (docs/specs/backend-auth-photos-spec.md §2).
 */
export interface Authenticator {
  /** Resolves a request to a user id, or `null` if unauthenticated. */
  authenticate(request: Request): Promise<string | null>;
}

// Trusts the bearer token verbatim as the user id — test fixtures only
// (`backend/test/sync.spec.ts`); never mount it in the Worker.
export const devBearerAuthenticator: Authenticator = {
  authenticate(request: Request): Promise<string | null> {
    const header = request.headers.get('authorization');
    if (!header?.startsWith('Bearer ')) return Promise.resolve(null);
    const token = header.slice('Bearer '.length).trim();
    return Promise.resolve(token.length > 0 ? token : null);
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
      const session = await auth.api.getSession({ headers: withoutCookies(request.headers) });
      return session?.user.id ?? null;
    },
  };
}
