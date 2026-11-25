// The shared HTTP clients call `config.fetchImpl(...)` as a method. A
// browser's fetch throws "Illegal invocation" unless `this` is the global
// (#945), so the app must not hand over the bare `fetch`. The shared adapters
// stay real; only the app's config, storage and the fetch itself are stubbed.
import type { HttpClient } from '@shotledger/shared/src/integrations/webshooter/api/httpClient';

const webshooterHttp: { client?: HttpClient } = {};
jest.mock('@shotledger/shared/src/integrations/webshooter/api/client', () => ({
  // Only to reach the real HTTP client the app builds; the API layer above it
  // has nothing to do with how fetch is called.
  createWebshooterClient: (client: HttpClient) => {
    webshooterHttp.client = client;
    return {};
  },
}));
jest.mock('@/constants/backend', () => ({ apiBaseUrl: () => 'http://localhost' }));
jest.mock('@/constants/flags', () => ({ isFlagEnabled: () => false }));
jest.mock('@/platform/secure-store', () => ({
  getSessionToken: jest.fn(async () => null),
  getWebshooterToken: jest.fn(async () => null),
}));
jest.mock('@/features/webshooter/dev-mock', () => ({ createDevMockHttpClient: () => ({}) }));

/** A schema that accepts any body (the app has no zod dependency of its own). */
const anything = {
  safeParse: (data: unknown) => ({ success: true, data }),
} as unknown as Parameters<HttpClient['requestJson']>[1];

const realFetch = global.fetch;
const receivers: unknown[] = [];

/** Rejects like a browser when called with any `this` but the global. */
function strictFetch(this: unknown): Promise<Response> {
  receivers.push(this);
  if (this !== undefined && this !== globalThis) {
    return Promise.reject(new TypeError('Illegal invocation'));
  }
  return Promise.resolve(new Response('{}', { status: 200 }));
}

const foreign = () => receivers.filter((r) => r !== undefined && r !== globalThis);

beforeEach(() => {
  receivers.length = 0;
  global.fetch = strictFetch as unknown as typeof fetch;
});
afterAll(() => {
  global.fetch = realFetch;
});

it('the sync client calls fetch with the global as `this`', async () => {
  const { getAccountApi } = jest.requireActual<typeof import('./client')>('./client');
  // The response doesn't matter; only how fetch was called.
  await getAccountApi()
    .signIn('demo@example.invalid', 'pw')
    .catch(() => undefined);
  expect(receivers.length).toBeGreaterThan(0);
  expect(foreign()).toEqual([]);
});

it('the Webshooter client calls fetch with the global as `this`', async () => {
  const { getWebshooterClient } = jest.requireActual<typeof import('@/features/webshooter/client')>(
    '@/features/webshooter/client',
  );
  getWebshooterClient();
  await webshooterHttp.client!.requestJson('competitions', anything);
  expect(receivers.length).toBeGreaterThan(0);
  expect(foreign()).toEqual([]);
});
