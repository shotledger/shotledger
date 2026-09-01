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

  it('never calls fetchImpl', async () => {
    const fetchImpl = vi.fn();
    const client = createUnverifiedSpaLoginClient(fetchImpl, 'https://webshooter.se');

    await client.login({ username: 'a', password: 'b' }).catch(() => undefined);

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
