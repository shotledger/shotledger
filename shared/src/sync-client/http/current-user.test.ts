import { describe, expect, it } from 'vitest';

import { classifySyncError, createAccountApi } from './index';

const api = (status: number, body: unknown = {}) =>
  createAccountApi({
    fetchImpl: async () => new Response(JSON.stringify(body), { status }),
    baseUrl: 'https://example.invalid',
    getToken: () => 'token',
  });

describe('currentUser', () => {
  it('R20 a live session answers its user', async () => {
    await expect(
      api(200, { user: { id: 'u1', email: 'a@example.invalid' } }).currentUser(),
    ).resolves.toEqual({ userId: 'u1', email: 'a@example.invalid' });
  });

  it('R20 a refused session reads as signed out', async () => {
    await expect(api(401).currentUser()).resolves.toBeNull();
    await expect(api(403).currentUser()).resolves.toBeNull();
    await expect(api(200, null).currentUser()).resolves.toBeNull();
  });

  it.each([500, 503, 408, 429])(
    'R20 an HTTP %i from get-session is a network failure, not a sign-out',
    async (status) => {
      const error = await api(status)
        .currentUser()
        .then(
          () => null,
          (thrown: unknown) => thrown,
        );
      expect(error).not.toBeNull();
      expect(classifySyncError(error)).toBe('network');
    },
  );
});
