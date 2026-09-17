import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { createHttpClient, WebshooterHttpError, WebshooterSchemaError } from './httpClient';

const schema = z.object({ ok: z.boolean() });

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('createHttpClient', () => {
  it('names the offending field when a response does not match', async () => {
    // A raw ZodError repeats the same complaint once per array element —
    // 108 entries for one wrong field, in the case that prompted this. The
    // message has to be something a person can read on a phone and repeat
    // in a bug report.
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: 'yes' }));
    const client = createHttpClient({
      fetchImpl,
      baseUrl: 'https://x.test',
      getToken: () => 'tok',
    });

    await expect(client.requestJson('/thing', schema)).rejects.toBeInstanceOf(
      WebshooterSchemaError,
    );
    await expect(client.requestJson('/thing', schema)).rejects.toThrow(/\/thing: ok — /);
  });

  it('counts the remaining issues rather than listing them', async () => {
    const wide = z.object({ a: z.number(), b: z.number(), c: z.number() });
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    const client = createHttpClient({
      fetchImpl,
      baseUrl: 'https://x.test',
      getToken: () => 'tok',
    });

    await expect(client.requestJson('/wide', wide)).rejects.toThrow('(+2 more)');
  });

  it('does not retry a schema failure: the answer will not change', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: 'yes' }));
    const client = createHttpClient({
      fetchImpl,
      baseUrl: 'https://x.test',
      getToken: () => 'tok',
      sleep: () => Promise.resolve(),
    });

    await expect(client.requestJson('/thing', schema)).rejects.toBeInstanceOf(
      WebshooterSchemaError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

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
    expect(fetchImpl).toHaveBeenCalledWith('https://x.test/thing', expect.anything());
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

    await expect(client.requestJson('/thing', schema)).rejects.toThrow(WebshooterHttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[500], [1000]]);
  });

  it('rejects with WebshooterHttpError carrying status and path on exhaustion', async () => {
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
      name: 'WebshooterHttpError',
      message: 'Webshooter request to /thing failed with status 503',
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

  it('retries on 599 (the top of the 5xx range, inclusive)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(599, {}))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = createHttpClient({
      fetchImpl,
      baseUrl: 'https://x.test',
      getToken: () => null,
      sleep,
    });

    await expect(client.requestJson('/thing', schema)).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry on 600 (just past the 5xx range)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(600, {}));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = createHttpClient({
      fetchImpl,
      baseUrl: 'https://x.test',
      getToken: () => null,
      sleep,
    });

    await expect(client.requestJson('/thing', schema)).rejects.toMatchObject({ status: 600 });
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
      // Flush pending microtasks (the first fetch + its response parsing)
      // without advancing real/fake time, proving the retry is genuinely
      // blocked on the timer, not just eventually consistent.
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchImpl).toHaveBeenCalledTimes(1);

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

    await expect(client.requestJson('/thing', schema)).rejects.toThrow(WebshooterHttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls).toEqual([[10]]);
  });
});

describe('WebshooterSchemaError', () => {
  it('counts the issues it did not print', () => {
    const error = new WebshooterSchemaError('/thing', {
      issues: [
        { path: ['data', 0, 'score'], message: 'expected number' },
        { path: ['data', 1, 'score'], message: 'expected number' },
        { path: ['data', 2, 'score'], message: 'expected number' },
      ],
    });

    expect(error.message).toBe('/thing: data.0.score — expected number (+2 more)');
    expect(error.path).toBe('/thing');
  });

  it('prints a single issue without a count', () => {
    const error = new WebshooterSchemaError('/thing', {
      issues: [{ path: ['ok'], message: 'expected boolean' }],
    });

    expect(error.message).toBe('/thing: ok — expected boolean');
  });

  it('still names the endpoint when the issue list is empty', () => {
    // A validator that rejects without saying why must not produce a message
    // with a hole in it — the endpoint is the one thing a bug report needs.
    const error = new WebshooterSchemaError('/thing', { issues: [] });

    expect(error.message).toBe('/thing: (root) — did not match');
  });
});
