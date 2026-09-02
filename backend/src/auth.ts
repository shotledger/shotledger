/**
 * Auth is stubbed for this task (per ADR 0003 consequences — better-auth
 * integration is a separate, later task). `Authenticator` is the seam the
 * real implementation slots into without touching route code.
 */
export interface Authenticator {
  /** Resolves a request to a user id, or `null` if unauthenticated. */
  authenticate(request: Request): Promise<string | null>;
}

// TODO(better-auth): replace with real bearer-token verification against
// better-auth once it is integrated. This dev stub trusts the token
// verbatim as the user id — never use it outside local/test environments.
export const devBearerAuthenticator: Authenticator = {
  async authenticate(request: Request): Promise<string | null> {
    const header = request.headers.get('authorization');
    if (!header?.startsWith('Bearer ')) return null;
    const token = header.slice('Bearer '.length).trim();
    return token.length > 0 ? token : null;
  },
};
