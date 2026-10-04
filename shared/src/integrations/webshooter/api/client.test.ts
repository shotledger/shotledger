import { describe, expect, it, vi } from 'vitest';
import type { HttpClient } from './httpClient';
import { createWebshooterClient } from './client';
import {
  fixtureCompetitionDetailResponse,
  fixtureCompetitionsResponse,
  fixturePatrolsResponse,
  fixtureResultsResponse,
  fixtureSignupsResponse,
} from './fixtures';

// The spy is returned on its own so assertions never detach a method from
// the client (`unbound-method`).
function fakeHttpClient(responses: Record<string, unknown>) {
  const requestJson = vi.fn((path: string) => Promise.resolve(responses[path]));
  return { http: { requestJson } as unknown as HttpClient, requestJson };
}

describe('createWebshooterClient', () => {
  it('listCompetitions: two calls within TTL make one underlying fetch', async () => {
    const { http, requestJson } = fakeHttpClient({
      '/competitions': fixtureCompetitionsResponse(),
    });
    const client = createWebshooterClient(http);

    const first = await client.listCompetitions();
    const second = await client.listCompetitions();

    expect(first).toEqual(second);
    expect(requestJson).toHaveBeenCalledTimes(1);
  });

  it('listCompetitions: forceRefresh bypasses a warm cache entry', async () => {
    const { http, requestJson } = fakeHttpClient({
      '/competitions': fixtureCompetitionsResponse(),
    });
    const client = createWebshooterClient(http);

    await client.listCompetitions();
    await client.listCompetitions({ forceRefresh: true });

    expect(requestJson).toHaveBeenCalledTimes(2);
  });

  it('listCompetitions: refetches once the TTL has elapsed', async () => {
    let now = 0;
    const { http, requestJson } = fakeHttpClient({
      '/competitions': fixtureCompetitionsResponse(),
    });
    const client = createWebshooterClient(http, { ttlMs: 1000, now: () => now });

    await client.listCompetitions();
    now = 1001;
    await client.listCompetitions();

    expect(requestJson).toHaveBeenCalledTimes(2);
  });

  it('listCompetitions: treats the entry as expired at the exact expiresAt instant (boundary is exclusive)', async () => {
    let now = 0;
    const { http, requestJson } = fakeHttpClient({
      '/competitions': fixtureCompetitionsResponse(),
    });
    const client = createWebshooterClient(http, { ttlMs: 1000, now: () => now });

    await client.listCompetitions();
    now = 1000; // exactly expiresAt (now() + ttlMs at fetch time)
    await client.listCompetitions();

    expect(requestJson).toHaveBeenCalledTimes(2);
  });

  it('getCompetition: caches per id independently', async () => {
    const { http, requestJson } = fakeHttpClient({
      '/competitions/1': fixtureCompetitionDetailResponse({ id: 1 }),
      '/competitions/2': fixtureCompetitionDetailResponse({ id: 2 }),
    });
    const client = createWebshooterClient(http);

    await client.getCompetition(1);
    await client.getCompetition(1);
    await client.getCompetition(2);

    expect(requestJson).toHaveBeenCalledTimes(2);
  });

  it('getPatrols caches per competitionId independently', async () => {
    const { http, requestJson } = fakeHttpClient({
      '/competitions/1/patrols': fixturePatrolsResponse(),
      '/competitions/2/patrols': fixturePatrolsResponse(),
    });
    const client = createWebshooterClient(http);

    await client.getPatrols(1);
    await client.getPatrols(1);
    await client.getPatrols(2);

    expect(requestJson).toHaveBeenCalledTimes(2);
  });

  it('getResults caches per competitionId independently', async () => {
    const { http, requestJson } = fakeHttpClient({
      '/competitions/1/results': fixtureResultsResponse(),
      '/competitions/2/results': fixtureResultsResponse(),
    });
    const client = createWebshooterClient(http);

    await client.getResults(1);
    await client.getResults(1);
    await client.getResults(2);

    expect(requestJson).toHaveBeenCalledTimes(2);
  });

  it('getSignups caches per competitionId independently and unwraps the paginated envelope', async () => {
    const { http, requestJson } = fakeHttpClient({
      '/competitions/1/signups': fixtureSignupsResponse(),
      '/competitions/2/signups': fixtureSignupsResponse(),
    });
    const client = createWebshooterClient(http);

    const result = await client.getSignups(1);
    await client.getSignups(1);
    await client.getSignups(2);

    expect(result).toHaveLength(1);
    expect(requestJson).toHaveBeenCalledTimes(2);
  });

  it('authenticateUser is never cached: two calls, two fetches, hits the authenticate/user path', async () => {
    // The envelope is what webshooter.se actually returns, and the path now
    // carries its leading slash like every other call site.
    const { http, requestJson } = fakeHttpClient({
      '/authenticate/user': { user: { shooting_card_number: '123' } },
    });
    const client = createWebshooterClient(http);

    const result = await client.authenticateUser();
    await client.authenticateUser();

    expect(result).toEqual({ shooting_card_number: '123' });

    expect(requestJson).toHaveBeenCalledTimes(2);
  });
});
