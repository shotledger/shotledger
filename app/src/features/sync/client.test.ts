// The shared HTTP clients call `config.fetchImpl(...)` as a method. A
// browser's fetch throws "Illegal invocation" unless `this` is the global
// (#945), so the app must not hand over the bare `fetch`.
const captured: { fetchImpl?: (input: string) => Promise<unknown> }[] = [];

jest.mock('@shotledger/shared', () => {
  const capture = (config: { fetchImpl: (input: string) => Promise<unknown> }) => {
    captured.push(config);
    return {};
  };
  return {
    createAccountApi: capture,
    createHttpSyncTransport: capture,
    createPhotoApi: capture,
  };
});
jest.mock('@shotledger/shared/src/integrations/webshooter/api/httpClient', () => ({
  createHttpClient: (config: { fetchImpl: (input: string) => Promise<unknown> }) => {
    captured.push(config);
    return {};
  },
}));
jest.mock('@shotledger/shared/src/integrations/webshooter/api/client', () => ({
  createWebshooterClient: () => ({}),
}));
jest.mock('@/constants/backend', () => ({ apiBaseUrl: () => 'http://localhost' }));
jest.mock('@/constants/flags', () => ({ isFlagEnabled: () => false }));
jest.mock('@/platform/secure-store', () => ({
  getSessionToken: jest.fn(async () => null),
  getWebshooterToken: jest.fn(async () => null),
}));
jest.mock('@/features/webshooter/dev-mock', () => ({ createDevMockHttpClient: () => ({}) }));

const realFetch = global.fetch;

/** Rejects like a browser when called with any `this` but the global. */
function strictFetch(this: unknown): Promise<unknown> {
  if (this !== undefined && this !== globalThis) {
    return Promise.reject(new TypeError('Illegal invocation'));
  }
  return Promise.resolve('ok');
}

beforeEach(() => {
  captured.length = 0;
  global.fetch = strictFetch as unknown as typeof fetch;
});
afterAll(() => {
  global.fetch = realFetch;
});

async function callAsMethod(config: { fetchImpl?: (input: string) => Promise<unknown> }) {
  return config.fetchImpl!('http://localhost/x');
}

it('the sync clients call fetch with the global as `this`', async () => {
  const client = jest.requireActual<typeof import('./client')>('./client');
  client.getAccountApi();
  client.getSyncTransport();
  client.getPhotoApi();
  expect(captured).toHaveLength(3);
  for (const config of captured) await expect(callAsMethod(config)).resolves.toBe('ok');
});

it('the Webshooter client calls fetch with the global as `this`', async () => {
  const { getWebshooterClient } = jest.requireActual<typeof import('@/features/webshooter/client')>(
    '@/features/webshooter/client',
  );
  getWebshooterClient();
  expect(captured).toHaveLength(1);
  await expect(callAsMethod(captured[0]!)).resolves.toBe('ok');
});
