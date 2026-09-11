// SYNTHETIC fixtures mirroring Webshooter wire shapes (docs/specs/
// webshooter-core-spec.md §0/§2.1/§8). Every name, card number, id, and club
// below is invented — none of it was copied from ~/.cache/webshooter/, which
// was read only to learn the shapes these fixtures reproduce.
import type {
  Competition,
  CompetitionDetailResponse,
  CompetitionsResponse,
  Patrol,
  PatrolsResponse,
  ResultRow,
  ResultsResponse,
  Signup,
  SignupsResponse,
  StationResult,
} from './schemas';

export function fixtureStationResult(overrides: Partial<StationResult> = {}): StationResult {
  return {
    id: 90001,
    signups_id: 55001,
    finals: 0,
    distinguish: 0,
    stations_id: 1,
    figure_hits: 0,
    hits: 0,
    points: 44,
    station_figure_hits: [0, 0, 0, 0, 0, 0],
    deleted_at: null,
    ...overrides,
  };
}

export function fixtureWeaponClass(overrides: Partial<ResultRow['weaponclass']> = {}) {
  return {
    id: 1001,
    weapongroups_id: 3,
    classname: 'C2',
    championship: 0,
    classname_general: 'C',
    ...overrides,
  };
}

export function fixtureSignup(overrides: Partial<Signup> = {}): Signup {
  return {
    id: 55001,
    competitions_id: 9001,
    patrols_id: 7001,
    lane: 3,
    weaponclasses_id: 1001,
    start_time: '2026-06-13 09:00:00',
    end_time: '2026-06-13 10:50:00',
    weaponclass: fixtureWeaponClass(),
    user: {
      fullname: 'Testa Testsson',
      shooting_card_number: '99001',
      clubs_id: 501,
      clubs: [{ id: 501, name: 'Exempel Pistolklubb' }],
    },
    club: { id: 501, name: 'Exempel Pistolklubb' },
    ...overrides,
  };
}

export function fixtureResultRow(overrides: Partial<ResultRow> = {}): ResultRow {
  return {
    id: 70001,
    competitions_id: 9001,
    signups_id: 55001,
    placement: 2,
    figure_hits: 0,
    hits: 0,
    points: 308,
    weaponclasses_id: 1001,
    std_medal: null,
    signup: fixtureSignup(),
    weaponclass: fixtureWeaponClass(),
    results: [1, 2, 3, 4, 5, 6, 7].map((station) =>
      fixtureStationResult({ id: 90000 + station, stations_id: station, points: 40 + station }),
    ),
    results_finals: [],
    results_distinguish: [],
    ...overrides,
  };
}

export function fixtureResultsResponse(rows: ResultRow[] = [fixtureResultRow()]): ResultsResponse {
  return { results: rows };
}

export function fixtureCompetition(overrides: Partial<Competition> = {}): Competition {
  return {
    id: 9001,
    name: 'Exempeltävlingen Precision C',
    date: '2026-06-13',
    results_type: 'precision',
    contact_city: 'Exempelstad',
    contact_venue: '25m-banan, Exempel skyttecentrum',
    status: 'completed',
    ...overrides,
  };
}

export function fixtureCompetitionDetailResponse(
  overrides: Partial<Competition> = {},
): CompetitionDetailResponse {
  return { competitions: fixtureCompetition(overrides) };
}

export function fixtureCompetitionsResponse(
  competitions: Competition[] = [fixtureCompetition()],
): CompetitionsResponse {
  return {
    competitions: {
      data: competitions,
      current_page: 1,
      last_page: 1,
      total: competitions.length,
    },
  };
}

export function fixturePatrol(overrides: Partial<Patrol> = {}): Patrol {
  return {
    id: 7001,
    competitions_id: 9001,
    start_time: '2026-06-13 09:00:00',
    end_time: '2026-06-13 10:45:00',
    patrol_size: 8,
    signups: [fixtureSignup()],
    ...overrides,
  };
}

export function fixturePatrolsResponse(patrols: Patrol[] = [fixturePatrol()]): PatrolsResponse {
  return { patrols };
}

export function fixtureSignupsResponse(signups: Signup[] = [fixtureSignup()]): SignupsResponse {
  return {
    signups: {
      data: signups,
      current_page: 1,
      last_page: 1,
    },
  };
}
