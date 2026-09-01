import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { createHttpClient, WebShooterHttpError } from './httpClient';

const schema = z.object({ ok: z.boolean() });

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('createHttpClient', () => {
  it('parses a 200 response with the schema, one fetch call', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    const client = createHttpClient({
      fetchImpl,
      baseUrl: 'https://x.test',
      getToken: () => 'tok',
    });

    const result = await client.requestJson('/thing', schema);

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('sends the Authorization header when a token is present', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    const client = createHttpClient({
      fetchImpl,
      baseUrl: 'https://x.test',
      getToken: () => 'secret',
    });

    await client.requestJson('/thing', schema);

    const [, init] = fetchImpl.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(init.headers.Authorization).toBe('Bearer secret');
  });

  it('omits the Authorization header when there is no token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    const client = createHttpClient({ fetchImpl, baseUrl: 'https://x.test', getToken: () => null });

    await client.requestJson('/thing', schema);

    const [, init] = fetchImpl.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('retries once on 500 then succeeds on 200, sleeping ~500ms once', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, {}))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = createHttpClient({
      fetchImpl,
      baseUrl: 'https://x.test',
      getToken: () => null,
      sleep,
    });

    const result = await client.requestJson('/thing', schema);

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it('exhausts retries on repeated 500s: default 3 attempts, 2 sleeps at 500ms then 1000ms', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(500, {}));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = createHttpClient({
      fetchImpl,
      baseUrl: 'https://x.test',
      getToken: () => null,
      sleep,
    });

    await expect(client.requestJson('/thing', schema)).rejects.toThrow(WebShooterHttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[500], [1000]]);
  });

  it('rejects with WebShooterHttpError carrying status and path on exhaustion', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(503, {}));
    const client = createHttpClient({
      fetchImpl,
      baseUrl: 'https://x.test',
      getToken: () => null,
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    await expect(client.requestJson('/thing', schema)).rejects.toMatchObject({
      status: 503,
      path: '/thing',
    });
  });

  it('does not retry on 404: one fetch call, zero sleep calls, rejects immediately', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(404, {}));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = createHttpClient({
      fetchImpl,
      baseUrl: 'https://x.test',
      getToken: () => null,
      sleep,
    });

    await expect(client.requestJson('/thing', schema)).rejects.toMatchObject({ status: 404 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('rejects on a malformed body that fails schema validation', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: 'not a boolean' }));
    const client = createHttpClient({ fetchImpl, baseUrl: 'https://x.test', getToken: () => null });

    await expect(client.requestJson('/thing', schema)).rejects.toThrow();
  });

  it('uses the real default sleep (setTimeout) when no sleep is injected', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(500, {}))
        .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
      const client = createHttpClient({
        fetchImpl,
        baseUrl: 'https://x.test',
        getToken: () => null,
      });

      const resultPromise = client.requestJson('/thing', schema);
      await vi.advanceTimersByTimeAsync(500);

      await expect(resultPromise).resolves.toEqual({ ok: true });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('respects a custom retry config (maxAttempts/baseDelayMs/factor)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(500, {}));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = createHttpClient({
      fetchImpl,
      baseUrl: 'https://x.test',
      getToken: () => null,
      sleep,
      retry: { maxAttempts: 2, baseDelayMs: 10, factor: 3 },
    });

    await expect(client.requestJson('/thing', schema)).rejects.toThrow(WebShooterHttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls).toEqual([[10]]);
  });
});
