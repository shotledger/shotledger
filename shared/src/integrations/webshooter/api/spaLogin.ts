// SPA login — interface only, VERIFY (spec §2.4). Per the maintainer's PR
// #19 comment (2026-09-01): primary auth is in-app password login directly
// against webshooter.se — device to webshooter.se, credentials/token NEVER
// transit or touch a ShotLedger backend. This module declares the shape the
// app layer will call once the real login endpoint is inspected; it is not
// implemented against a live endpoint (no network calls exist in this
// branch at all).
export interface WebShooterSpaLoginRequest {
  username: string;
  password: string;
}

export interface WebShooterSpaLoginResult {
  token: string;
}

export interface WebShooterSpaLoginClient {
  login(request: WebShooterSpaLoginRequest): Promise<WebShooterSpaLoginResult>;
}

export class WebShooterSpaLoginNotVerifiedError extends Error {
  constructor() {
    super(
      'WebShooter SPA login endpoint is not verified (VERIFY: inspect the SPA login network ' +
        'request — path, request body field names, response shape — before implementing). ' +
        'Credentials/token must never transit a ShotLedger backend once implemented.',
    );
    this.name = 'WebShooterSpaLoginNotVerifiedError';
  }
}

/**
 * Stub client: `login()` always rejects and never calls `fetchImpl`. Exists
 * so the app layer has a stable interface to code against ahead of the
 * VERIFY being resolved, without any implementation making a request that
 * hasn't been confirmed safe/correct.
 */
export function createUnverifiedSpaLoginClient(
  fetchImpl: typeof fetch,
  baseUrl: string,
): WebShooterSpaLoginClient {
  return {
    login(_request: WebShooterSpaLoginRequest): Promise<WebShooterSpaLoginResult> {
      void fetchImpl;
      void baseUrl;
      return Promise.reject(new WebShooterSpaLoginNotVerifiedError());
    },
  };
}
