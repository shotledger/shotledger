import { describe, expect, it } from 'vitest';
import {
  fixtureCompetitionDetailResponse,
  fixtureCompetitionsResponse,
  fixturePatrolsResponse,
  fixtureResultsResponse,
  fixtureSignupsResponse,
} from './fixtures';
import {
  authUserSchema,
  competitionDetailResponseSchema,
  competitionsResponseSchema,
  patrolsResponseSchema,
  resultsResponseSchema,
  signupsResponseSchema,
} from './schemas';

describe('wire schema round-trips (synthetic fixtures)', () => {
  it('parses a results response fixture', () => {
    const parsed = resultsResponseSchema.parse(fixtureResultsResponse());
    expect(parsed.results[0]?.weaponclass.classname).toBe('C2');
    expect(parsed.results[0]?.results).toHaveLength(7);
  });

  it('parses a results response fixture with finals and distinguish rows', () => {
    const parsed = resultsResponseSchema.parse(
      fixtureResultsResponse([
        {
          id: 1,
          competitions_id: 1,
          signups_id: 1,
          placement: 1,
          figure_hits: 0,
          hits: 0,
          points: 100,
          weaponclasses_id: 1,
          std_medal: 'S',
          signup: fixtureResultsResponse().results[0]!.signup,
          weaponclass: fixtureResultsResponse().results[0]!.weaponclass,
          results: [],
          results_finals: [
            {
              id: 2,
              signups_id: 1,
              finals: 1,
              distinguish: 0,
              stations_id: 1,
              figure_hits: 0,
              hits: 0,
              points: 48,
              station_figure_hits: [0, 0, 0, 0, 0, 0],
              deleted_at: null,
            },
          ],
          results_distinguish: [
            {
              id: 3,
              signups_id: 1,
              finals: 0,
              distinguish: 1,
              stations_id: 1,
              figure_hits: 0,
              hits: 0,
              points: 49,
              station_figure_hits: [0, 0, 0, 0, 0, 0],
              deleted_at: null,
            },
          ],
        },
      ]),
    );
    expect(parsed.results[0]?.results_finals).toHaveLength(1);
    expect(parsed.results[0]?.results_distinguish).toHaveLength(1);
  });

  it('parses a competition detail response fixture (singular wrap)', () => {
    const parsed = competitionDetailResponseSchema.parse(fixtureCompetitionDetailResponse());
    expect(parsed.competitions.results_type).toBe('precision');
  });

  it('parses a competitions list response fixture (paginated wrap)', () => {
    const parsed = competitionsResponseSchema.parse(fixtureCompetitionsResponse());
    expect(parsed.competitions.data).toHaveLength(1);
    expect(parsed.competitions.total).toBe(1);
  });

  it('parses a patrols response fixture', () => {
    const parsed = patrolsResponseSchema.parse(fixturePatrolsResponse());
    expect(parsed.patrols[0]?.signups[0]?.user?.shooting_card_number).toBe('99001');
  });

  it('parses a signups response fixture (paginated wrap)', () => {
    const parsed = signupsResponseSchema.parse(fixtureSignupsResponse());
    expect(parsed.signups.data).toHaveLength(1);
  });

  it('parses an authenticate/user fixture', () => {
    const parsed = authUserSchema.parse({
      shooting_card_number: '12345',
      fullname: 'Testa Testsson',
    });
    expect(parsed.shooting_card_number).toBe('12345');
  });

  it('parses an authenticate/user fixture with fullname omitted (optional)', () => {
    const parsed = authUserSchema.parse({ shooting_card_number: '12345' });
    expect(parsed.fullname).toBeUndefined();
  });

  it('parses a null shooting_card_number (nullable, not just optional)', () => {
    const parsed = patrolsResponseSchema.parse(
      fixturePatrolsResponse([
        {
          ...fixturePatrolsResponse().patrols[0]!,
          signups: [
            {
              ...fixturePatrolsResponse().patrols[0]!.signups[0]!,
              user: {
                fullname: 'Anonym Testsson',
                shooting_card_number: null,
                clubs_id: 501,
                clubs: [{ id: 501, name: 'Exempel Pistolklubb' }],
              },
            },
          ],
        },
      ]),
    );
    expect(parsed.patrols[0]?.signups[0]?.user?.shooting_card_number).toBeNull();
  });

  it('parses a results_type of pointfield (all four enum members are modeled)', () => {
    const parsed = competitionDetailResponseSchema.parse(
      fixtureCompetitionDetailResponse({ results_type: 'pointfield' }),
    );
    expect(parsed.competitions.results_type).toBe('pointfield');
  });

  it('accepts extra unknown top-level fields (real API sends far more than we model)', () => {
    const parsed = competitionDetailResponseSchema.parse({
      competitions: { ...fixtureCompetitionDetailResponse().competitions, extra_field: 'ignored' },
    });
    expect(parsed.competitions.name).toBe('Exempeltävlingen Precision C');
  });
});

describe('wire schema negative controls (proves the schemas actually reject bad shape)', () => {
  it('rejects a results response missing a required field', () => {
    expect(() => resultsResponseSchema.parse({ results: [{ id: 1 }] })).toThrow();
  });

  it('rejects a competition detail response with the wrong envelope (list shape passed to detail schema)', () => {
    expect(() => competitionDetailResponseSchema.parse(fixtureCompetitionsResponse())).toThrow();
  });

  it('rejects a competitions list response with the wrong envelope (detail shape passed to list schema)', () => {
    expect(() => competitionsResponseSchema.parse(fixtureCompetitionDetailResponse())).toThrow();
  });

  it('rejects an invalid results_type enum value', () => {
    expect(() =>
      competitionDetailResponseSchema.parse({
        competitions: {
          ...fixtureCompetitionDetailResponse().competitions,
          results_type: 'bowling',
        },
      }),
    ).toThrow();
  });

  it('rejects a signup with an invalid std_medal code', () => {
    expect(() =>
      resultsResponseSchema.parse(
        fixtureResultsResponse([
          { ...fixtureResultsResponse().results[0]!, std_medal: 'G' as never },
        ]),
      ),
    ).toThrow();
  });

  it('rejects a station result with an unmodeled finals value (only 0 or 1 are valid)', () => {
    const row = fixtureResultsResponse().results[0]!;
    expect(() =>
      resultsResponseSchema.parse(
        fixtureResultsResponse([{ ...row, results: [{ ...row.results[0]!, finals: 2 as never }] }]),
      ),
    ).toThrow();
  });
});
