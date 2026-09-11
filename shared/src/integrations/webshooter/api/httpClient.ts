// Fetch-injected HTTP client for WebShooter (spec §2.2). No module ever
// calls the global `fetch` directly — the caller injects it, so this tree
// makes zero real network calls in tests or otherwise.
import type { ZodType } from 'zod';

export class WebShooterHttpError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string) {
    super(`WebShooter request to ${path} failed with status ${status}`);
    this.name = 'WebShooterHttpError';
    this.status = status;
    this.path = path;
  }
}

export interface HttpClientRetryConfig {
  /** Total attempts including the first, default 3 (spec §2.2, VERIFY). */
  maxAttempts?: number;
  /** Delay before the second attempt, default 500ms (spec §2.2, VERIFY). */
  baseDelayMs?: number;
  /** Backoff multiplier per subsequent attempt, default 2. */
  factor?: number;
}

export interface HttpClientConfig {
  fetchImpl: typeof fetch;
  baseUrl: string;
  getToken: () => string | null;
  sleep?: (ms: number) => Promise<void>;
  retry?: HttpClientRetryConfig;
}

export interface HttpClient {
  requestJson<T>(path: string, schema: ZodType<T>): Promise<T>;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_FACTOR = 2;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isServerError(status: number): boolean {
  return status >= 500 && status <= 599;
}

export function createHttpClient(config: HttpClientConfig): HttpClient {
  const sleep = config.sleep ?? defaultSleep;
  const maxAttempts = config.retry?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = config.retry?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const factor = config.retry?.factor ?? DEFAULT_FACTOR;

  async function requestJson<T>(path: string, schema: ZodType<T>): Promise<T> {
    // Both halves normalised. `baseUrl` and the call sites disagreed about
    // the slash — '/competitions' against 'authenticate/user' — which
    // concatenation turned into `…/apiauthenticate/user`. webshooter.se
    // answers an unrouted path with its SPA's index.html and a 200, so the
    // request looked like a success and only failed later, in schema parsing.
    const url = `${config.baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
    const token = config.getToken();
    const headers: Record<string, string> = {};
    if (token !== null) headers.Authorization = `Bearer ${token}`;

    let lastStatus = 0;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await config.fetchImpl(url, { headers });
      if (response.ok) {
        const body: unknown = await response.json();
        return schema.parse(body);
      }
      lastStatus = response.status;
      if (!isServerError(response.status)) {
        throw new WebShooterHttpError(response.status, path);
      }
      if (attempt < maxAttempts) {
        const delayMs = baseDelayMs * factor ** (attempt - 1);
        await sleep(delayMs);
      }
    }
    throw new WebShooterHttpError(lastStatus, path);
  }

  return { requestJson };
}
