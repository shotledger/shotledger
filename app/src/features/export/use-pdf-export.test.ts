// Pins the phone's shooting-log export end to end, from the rows its queries
// return to the HTML expo-print receives. The snapshot was recorded before the
// row-to-entry mapping moved to shooting-log.ts, so it proves the move
// changed nothing the phone prints.
import i18next from 'i18next';

import en from '@/i18n/en.json';
import sv from '@/i18n/sv.json';

import { buildShootingLogHtmlForFilters } from './use-pdf-export';

const mockListSessions = jest.fn();
const mockGetFirearm = jest.fn();
const mockTotalVolume = jest.fn();

jest.mock('@/db/client', () => ({ db: {} }));
jest.mock('@/db/queries/sessions', () => ({
  listSessions: (...args: unknown[]) => mockListSessions(...args),
}));
jest.mock('@/db/queries/firearms', () => ({
  getFirearm: (...args: unknown[]) => mockGetFirearm(...args),
}));
jest.mock('@/db/queries/volume', () => ({
  totalVolumeRoundsFor: (...args: unknown[]) => mockTotalVolume(...args),
}));

const FIREARMS: Record<string, { make: string; model: string }> = {
  'fa-1': { make: 'Pardini', model: 'SP' },
  'fa-2': { make: 'Glock', model: '17' },
};

// Newest first, as listSessions orders them.
const SESSIONS = [
  {
    id: 's-4',
    startedAt: '2026-05-20T12:00:00.000Z',
    type: 'competition',
    competitionName: 'KM Milsnabb',
    disciplineId: 'spsf-milsnabb',
    weaponGroup: 'C',
    shooterClass: '2',
    location: 'Club range',
    firearmId: 'fa-1',
  },
  {
    id: 's-3',
    startedAt: '2026-04-11T11:30:00.000Z',
    type: 'training',
    competitionName: null,
    disciplineId: 'spsf-precision',
    weaponGroup: null,
    shooterClass: null,
    location: '   ',
    firearmId: null,
  },
  {
    id: 's-2',
    startedAt: '2026-03-02T10:00:00.000Z',
    type: 'competition',
    competitionName: '  ',
    disciplineId: 'spsf-falt',
    weaponGroup: 'A',
    shooterClass: null,
    location: 'Forest <range> & "hall"',
    firearmId: 'fa-gone',
  },
  {
    id: 's-1',
    startedAt: '2026-01-15T12:00:00.000Z',
    type: 'training',
    competitionName: null,
    disciplineId: 'spsf-precision',
    weaponGroup: 'C',
    shooterClass: null,
    location: null,
    firearmId: 'fa-1',
  },
];

const t = i18next.createInstance();

beforeAll(async () => {
  await t.init({
    resources: { en: { translation: en }, sv: { translation: sv } },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  jest.useFakeTimers({ now: new Date('2026-06-01T12:00:00.000Z') });
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  // The period filter as the real query applies it: both ends inclusive.
  mockListSessions
    .mockReset()
    .mockImplementation((_db: unknown, filter: { startedFrom?: string; startedTo?: string }) =>
      SESSIONS.filter(
        (session) =>
          (!filter.startedFrom || session.startedAt >= filter.startedFrom) &&
          (!filter.startedTo || session.startedAt <= filter.startedTo),
      ),
    );
  mockGetFirearm.mockReset().mockImplementation((_db: unknown, id: string) => FIREARMS[id]);
  mockTotalVolume.mockReset().mockImplementation((_db: unknown, ids: string[]) => ids.length * 40);
});

describe('buildShootingLogHtmlForFilters', () => {
  it('prints every session in the period, in English', async () => {
    await t.changeLanguage('en');
    const html = buildShootingLogHtmlForFilters(t.t, 'en-US', {
      startedFromIso: '2026-01-01T12:00:00.000Z',
      startedToIso: '2026-05-31T12:00:00.000Z',
      firearmId: null,
    });

    expect(mockListSessions).toHaveBeenCalledWith(
      {},
      { startedFrom: '2026-01-01T12:00:00.000Z', startedTo: '2026-05-31T12:00:00.000Z' },
    );
    expect(mockTotalVolume).toHaveBeenCalledWith({}, ['s-4', 's-3', 's-2', 's-1']);
    // One lookup per distinct firearm, not one per row.
    expect(mockGetFirearm.mock.calls.map(([, id]) => id)).toEqual(['fa-1', 'fa-gone']);
    expect(html).toMatchSnapshot();
  });

  it('narrows to one firearm and an open-ended period, in Swedish', async () => {
    await t.changeLanguage('sv');
    const html = buildShootingLogHtmlForFilters(t.t, 'sv-SE', {
      startedFromIso: null,
      startedToIso: null,
      firearmId: 'fa-1',
    });

    expect(mockListSessions).toHaveBeenCalledWith(
      {},
      { startedFrom: undefined, startedTo: undefined },
    );
    expect(mockTotalVolume).toHaveBeenCalledWith({}, ['s-4', 's-1']);
    expect(html).toMatchSnapshot();
  });

  it('restricts to the matched session ids', async () => {
    await t.changeLanguage('en');
    const html = buildShootingLogHtmlForFilters(t.t, 'en-US', {
      startedFromIso: '2026-03-01T12:00:00.000Z',
      startedToIso: null,
      firearmId: null,
      sessionIds: ['s-4', 's-3', 's-1'],
    });

    expect(mockTotalVolume).toHaveBeenCalledWith({}, ['s-4', 's-3']);
    expect(html).toMatchSnapshot();
  });

  it('prints the empty-period line when nothing matches', async () => {
    await t.changeLanguage('en');
    const html = buildShootingLogHtmlForFilters(t.t, 'en-US', {
      startedFromIso: null,
      startedToIso: null,
      firearmId: 'fa-2',
    });

    expect(html).toContain('No sessions in this period.');
    expect(html).toMatchSnapshot();
  });
});
