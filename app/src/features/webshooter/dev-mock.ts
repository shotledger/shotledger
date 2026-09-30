// Dev-only mock Webshooter server (never live network, never
// ~/.cache/webshooter data — every value below is invented, matching only
// the wire SHAPE from docs/specs/webshooter-core-spec.md §2.1). Injected in
// place of the real HttpClient behind the same interface, so the import
// flow, "My starts", and the review UI can be exercised end-to-end on a
// dev build without a real Webshooter account. Toggled by the
// `webshooterMock` flag (constants/flags.ts, flipped from /dev).
import type { HttpClient } from '@shotledger/shared/src/integrations/webshooter/api/httpClient';
import {
  authUserSchema,
  competitionDetailResponseSchema,
  competitionsResponseSchema,
  patrolsResponseSchema,
  resultsResponseSchema,
  signupsResponseSchema,
  type Competition,
  type Patrol,
  type ResultRow,
  type Signup,
} from '@shotledger/shared/src/integrations/webshooter/api/schemas';

const MOCK_CARD_NUMBER = '99999';

const MOCK_COMPETITIONS: Competition[] = [
  {
    id: 9001,
    name: 'Klubbmästerskap Precision (mock)',
    date: '2026-05-10',
    results_type: 'precision',
    contact_city: 'Mocktown',
    contact_venue: 'Mockbanan',
    status: 'finished',
  },
  {
    id: 9002,
    name: 'Distriktsmästerskap Fält (mock)',
    date: '2026-06-14',
    results_type: 'field',
    contact_city: 'Mocktown',
    contact_venue: 'Fältbanan',
    status: 'finished',
  },
  {
    id: 9003,
    name: 'Framtida match (mock)',
    date: '2099-01-01',
    results_type: 'precision',
    contact_city: 'Mocktown',
    contact_venue: 'Mockbanan',
    status: 'upcoming',
  },
];

const MOCK_SIGNUP: Signup = {
  id: 5551,
  competitions_id: 9001,
  patrols_id: 21,
  lane: 4,
  weaponclasses_id: 7,
  start_time: '2026-05-10 09:00:00',
  end_time: '2026-05-10 10:00:00',
  weaponclass: {
    id: 7,
    weapongroups_id: 3,
    classname: 'C2',
    championship: 1,
    classname_general: 'C',
  },
  user: {
    fullname: 'Mock Shooter',
    shooting_card_number: MOCK_CARD_NUMBER,
    clubs_id: 1,
    clubs: [{ id: 1, name: 'Mockklubben' }],
  },
  club: { id: 1, name: 'Mockklubben' },
};

const MOCK_UPCOMING_SIGNUP: Signup = {
  ...MOCK_SIGNUP,
  id: 5553,
  competitions_id: 9003,
  start_time: '2099-01-01 09:00:00',
  end_time: '2099-01-01 10:00:00',
};

function mockStation(stationsId: number, points: number, hits = 5, figureHits = 5) {
  return {
    id: stationsId,
    signups_id: MOCK_SIGNUP.id,
    finals: 0 as const,
    distinguish: 0 as const,
    stations_id: stationsId,
    figure_hits: figureHits,
    hits,
    points,
    station_figure_hits: [1, 1, 1, 1, 1],
    deleted_at: null,
  };
}

const MOCK_RESULTS: ResultRow[] = [
  {
    id: 1,
    competitions_id: 9001,
    signups_id: MOCK_SIGNUP.id,
    placement: 3,
    figure_hits: 35,
    hits: 35,
    points: 329,
    weaponclasses_id: 7,
    std_medal: 'S',
    signup: MOCK_SIGNUP,
    weaponclass: MOCK_SIGNUP.weaponclass!,
    results: [1, 2, 3, 4, 5, 6, 7].map((n) => mockStation(n, 47)),
    results_finals: [],
    results_distinguish: [],
  },
];

// A fält round station by station, for competition 9002: six stations, one
// poängmål (points), and a shoot-off station after the round.
const MOCK_FALT_RESULTS: ResultRow[] = [
  {
    ...MOCK_RESULTS[0]!,
    id: 2,
    competitions_id: 9002,
    placement: 5,
    std_medal: null,
    figure_hits: 17,
    hits: 30,
    points: 24,
    results: [
      mockStation(201, 0, 6, 3),
      mockStation(202, 0, 5, 3),
      mockStation(203, 24, 6, 4),
      mockStation(204, 0, 4, 2),
      mockStation(205, 0, 3, 2),
      mockStation(206, 0, 6, 3),
    ],
    results_distinguish: [{ ...mockStation(290, 0, 4, 2), distinguish: 1 as const }],
  },
];

const MOCK_PATROLS: Patrol[] = [
  {
    id: 21,
    competitions_id: 9001,
    start_time: '2026-05-10 09:00:00',
    end_time: '2026-05-10 10:00:00',
    patrol_size: 6,
    signups: [MOCK_SIGNUP],
  },
];

const MOCK_UPCOMING_PATROLS: Patrol[] = [
  {
    id: 23,
    competitions_id: 9003,
    start_time: '2099-01-01 09:00:00',
    end_time: '2099-01-01 10:00:00',
    patrol_size: 6,
    signups: [MOCK_UPCOMING_SIGNUP],
  },
];

/**
 * Matches the real HttpClient interface exactly, so `createWebshooterClient`
 * (the real endpoint/cache layer) works unmodified against it — only the
 * transport underneath is swapped, per the core client's own fetch-injection
 * design.
 */
export function createDevMockHttpClient(): HttpClient {
  return {
    async requestJson(path) {
      if (path === '/competitions') {
        return competitionsResponseSchema.parse({
          competitions: {
            data: MOCK_COMPETITIONS,
            current_page: 1,
            last_page: 1,
            total: MOCK_COMPETITIONS.length,
          },
        }) as never;
      }
      const detailMatch = /^\/competitions\/(\d+)$/.exec(path);
      if (detailMatch) {
        const id = Number(detailMatch[1]);
        const competition = MOCK_COMPETITIONS.find((c) => c.id === id) ?? MOCK_COMPETITIONS[0]!;
        return competitionDetailResponseSchema.parse({ competitions: competition }) as never;
      }
      if (/\/patrols$/.test(path)) {
        const patrols = path.includes('9003') ? MOCK_UPCOMING_PATROLS : MOCK_PATROLS;
        return patrolsResponseSchema.parse({ patrols }) as never;
      }
      if (/\/results$/.test(path)) {
        const results = path.includes('9002') ? MOCK_FALT_RESULTS : MOCK_RESULTS;
        return resultsResponseSchema.parse({ results }) as never;
      }
      if (/\/signups$/.test(path)) {
        return signupsResponseSchema.parse({
          signups: { data: [MOCK_SIGNUP], current_page: 1, last_page: 1, total: 1 },
        }) as never;
      }
      if (path === 'authenticate/user') {
        return authUserSchema.parse({
          shooting_card_number: MOCK_CARD_NUMBER,
          fullname: 'Mock Shooter',
        }) as never;
      }
      throw new Error(`Dev mock Webshooter client: unhandled path '${path}'`);
    },
  };
}
