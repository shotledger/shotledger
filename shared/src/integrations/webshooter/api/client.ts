// Typed WebShooter endpoint client (spec §2.3). Polite-client defaults: every
// method is one on-demand fetch, cached with a TTL, and only `forceRefresh`
// or TTL expiry ever triggers a re-fetch — no background polling anywhere.
import type { HttpClient } from './httpClient';
import {
  authUserResponseSchema,
  competitionDetailResponseSchema,
  competitionsResponseSchema,
  patrolsResponseSchema,
  resultsResponseSchema,
  signupsResponseSchema,
  type AuthUser,
  type Competition,
  type Patrol,
  type ResultRow,
  type Signup,
} from './schemas';

export interface CacheConfig {
  /** Default 15 minutes (spec §2.3, VERIFY: no published SLA). */
  ttlMs?: number;
  now?: () => number;
}

export interface FetchOptions {
  forceRefresh?: boolean;
}

export interface WebShooterClient {
  listCompetitions(options?: FetchOptions): Promise<Competition[]>;
  getCompetition(id: number, options?: FetchOptions): Promise<Competition>;
  getPatrols(competitionId: number, options?: FetchOptions): Promise<Patrol[]>;
  getResults(competitionId: number, options?: FetchOptions): Promise<ResultRow[]>;
  getSignups(competitionId: number, options?: FetchOptions): Promise<Signup[]>;
  authenticateUser(): Promise<AuthUser>;
}

const DEFAULT_TTL_MS = 15 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export function createWebShooterClient(
  httpClient: HttpClient,
  cacheConfig: CacheConfig = {},
): WebShooterClient {
  const ttlMs = cacheConfig.ttlMs ?? DEFAULT_TTL_MS;
  const now = cacheConfig.now ?? Date.now;
  const cache = new Map<string, CacheEntry<unknown>>();

  async function cached<T>(
    key: string,
    forceRefresh: boolean | undefined,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const existing = cache.get(key) as CacheEntry<T> | undefined;
    if (!forceRefresh && existing && existing.expiresAt > now()) {
      return existing.data;
    }
    const data = await fetcher();
    cache.set(key, { data, expiresAt: now() + ttlMs });
    return data;
  }

  return {
    async listCompetitions(options = {}) {
      return cached('competitions', options.forceRefresh, async () => {
        const response = await httpClient.requestJson('/competitions', competitionsResponseSchema);
        return response.competitions.data;
      });
    },

    async getCompetition(id, options = {}) {
      return cached(`competition:${id}`, options.forceRefresh, async () => {
        const response = await httpClient.requestJson(
          `/competitions/${id}`,
          competitionDetailResponseSchema,
        );
        return response.competitions;
      });
    },

    async getPatrols(competitionId, options = {}) {
      return cached(`patrols:${competitionId}`, options.forceRefresh, async () => {
        const response = await httpClient.requestJson(
          `/competitions/${competitionId}/patrols`,
          patrolsResponseSchema,
        );
        return response.patrols;
      });
    },

    async getResults(competitionId, options = {}) {
      return cached(`results:${competitionId}`, options.forceRefresh, async () => {
        const response = await httpClient.requestJson(
          `/competitions/${competitionId}/results`,
          resultsResponseSchema,
        );
        return response.results;
      });
    },

    async getSignups(competitionId, options = {}) {
      return cached(`signups:${competitionId}`, options.forceRefresh, async () => {
        const response = await httpClient.requestJson(
          `/competitions/${competitionId}/signups`,
          signupsResponseSchema,
        );
        return response.signups.data;
      });
    },

    async authenticateUser() {
      // Never cached: identity resolution is explicitly a fresh call (spec §2.3/§A.10).
      const response = await httpClient.requestJson('/authenticate/user', authUserResponseSchema);
      return response.user;
    },
  };
}
