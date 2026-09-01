import { describe, expect, it, vi } from 'vitest';
import { createUnverifiedSpaLoginClient, WebShooterSpaLoginNotVerifiedError } from './spaLogin';

describe('createUnverifiedSpaLoginClient', () => {
  it('login() always rejects with WebShooterSpaLoginNotVerifiedError', async () => {
    const fetchImpl = vi.fn();
    const client = createUnverifiedSpaLoginClient(fetchImpl, 'https://webshooter.se');

    await expect(client.login({ username: 'a', password: 'b' })).rejects.toBeInstanceOf(
      WebShooterSpaLoginNotVerifiedError,
    );
  });

  it('the error names itself and explains what is unverified and the credential-handling constraint', () => {
    const error = new WebShooterSpaLoginNotVerifiedError();
    expect(error.name).toBe('WebShooterSpaLoginNotVerifiedError');
    expect(error.message).toContain('VERIFY: inspect the SPA login network');
    expect(error.message).toContain('request — path, request body field names, response shape');
    expect(error.message).toContain('Credentials/token must never transit a ShotLedger backend');
  });

  it('never calls fetchImpl', async () => {
    const fetchImpl = vi.fn();
    const client = createUnverifiedSpaLoginClient(fetchImpl, 'https://webshooter.se');

    await client.login({ username: 'a', password: 'b' }).catch(() => undefined);

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
