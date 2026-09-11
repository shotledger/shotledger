import { describe, expect, it } from 'vitest';
import {
  fixtureCompetitionDetailResponse,
  fixtureCompetitionsResponse,
  fixturePatrolsResponse,
  fixtureResultRow,
  fixtureResultsResponse,
  fixtureSignup,
  fixtureSignupsResponse,
  fixtureStationResult,
  fixturePatrol,
  fixtureWeaponClass,
} from './fixtures';
import {
  authUserResponseSchema,
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

  it('accepts the nulls real Webshooter data is full of', () => {
    // Audited against wscli's 633 captured responses: with these fields
    // required, 124 of 256 results responses and 92 of 120 signups
    // responses failed to parse. Nulls here are the normal state, not
    // corruption — an unscheduled signup has no start_time, and a station
    // nobody shot has no points. Synthetic values only (hard rule 7).
    const parsed = resultsResponseSchema.parse(
      fixtureResultsResponse([
        {
          ...fixtureResultRow(),
          figure_hits: null,
          hits: null,
          points: null,
          signup: { ...fixtureSignup(), start_time: null, end_time: null },
          results: [{ ...fixtureStationResult(), figure_hits: null, hits: null, points: null }],
        },
      ]),
    );

    expect(parsed.results[0]!.points).toBeNull();
    expect(parsed.results[0]!.signup!.start_time).toBeNull();
    expect(parsed.results[0]!.results[0]!.hits).toBeNull();
  });

  it('accepts a result row whose signup is gone', () => {
    // Two captures have one: the row survives the signup being removed.
    const parsed = resultsResponseSchema.parse(
      fixtureResultsResponse([{ ...fixtureResultRow(), signup: null }]),
    );

    expect(parsed.results[0]!.signup).toBeNull();
  });

  it('accepts a weaponclass with no championship, as patrols return', () => {
    // The single field that made every My Starts fetch fail: present in the
    // weaponclass embedded in results, absent from the one embedded in a
    // patrol's signups. Nothing in this codebase reads it.
    const parsed = patrolsResponseSchema.parse(
      fixturePatrolsResponse([
        {
          ...fixturePatrol(),
          signups: [
            {
              ...fixtureSignup(),
              weaponclass: { ...fixtureWeaponClass(), championship: undefined },
            },
          ],
        },
      ]),
    );

    expect(parsed.patrols[0]!.signups[0]!.weaponclass?.championship).toBeUndefined();
  });

  it('accepts a shooter with no club fields, as live results contain', () => {
    // Required-but-unread is the recurring fault in these schemas: this one
    // stopped the import scan dead on the first competition it met.
    const signup = fixtureSignup();
    const parsed = resultsResponseSchema.parse(
      fixtureResultsResponse([
        {
          ...fixtureResultRow(),
          signup: {
            ...signup,
            user: {
              fullname: 'Testa Testsson',
              shooting_card_number: '12345',
            },
          },
        },
      ]),
    );

    expect(parsed.results[0]!.signup!.user!.clubs_id).toBeUndefined();
    expect(parsed.results[0]!.signup!.user!.shooting_card_number).toBe('12345');
  });

  it.each([
    ['numbers', [1, 2, 3]],
    ['numeric strings', ['1', '2']],
    ['a mix', ['1', 0]],
    ['null elements', [null, 1]],
    ['a bare null instead of an array', null],
  ])('accepts station_figure_hits as %s, all of which live data sends', (_label, value) => {
    // Four shapes across live competitions, and not one line of this
    // codebase reads the field. It is no longer validated at all.
    const parsed = resultsResponseSchema.parse(
      fixtureResultsResponse([
        {
          ...fixtureResultRow(),
          results: [
            { ...fixtureStationResult(), station_figure_hits: value as unknown as number[] },
          ],
        },
      ]),
    );

    expect(parsed.results[0]!.results[0]!.station_figure_hits).toEqual(value);
  });

  it('requires the user envelope authenticate/user actually returns', () => {
    // wscli reads data["user"]["shooting_card_number"]. Parsing the envelope
    // as the user itself is how a connected account ended up with no card
    // number: the token stored, the screen saying connected, and zod
    // rejecting the response out of sight.
    const parsed = authUserResponseSchema.parse({
      user: { shooting_card_number: '12345', fullname: 'Testa Testsson' },
    });
    expect(parsed.user.shooting_card_number).toBe('12345');
  });

  it('rejects a bare user object, which is what we used to expect', () => {
    expect(() => authUserResponseSchema.parse({ shooting_card_number: '12345' })).toThrow();
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
