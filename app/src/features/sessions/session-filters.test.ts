import {
  EMPTY_SESSION_FILTER,
  filterSessionRows,
  isFilterActive,
  sessionPeriodRange,
  type SessionListFilter,
} from './session-filters';
import type { SessionListRow } from './session-list-row';

function row(overrides: Partial<SessionListRow> = {}): SessionListRow {
  return {
    id: 's1',
    name: 'Träning MSG',
    type: 'training',
    startedAt: '2026-06-13T10:00:00Z',
    total: 311,
    seriesAverage: 44.4,
    innerTenCount: 3,
    tags: [],
    falt: null,
    shape: 'series',
    disciplineId: 'spsf-precision',
    firearmId: 'f1',
    ...overrides,
  };
}

function filter(overrides: Partial<SessionListFilter> = {}): SessionListFilter {
  return { ...EMPTY_SESSION_FILTER, ...overrides };
}

describe('filterSessionRows', () => {
  it('F1: the empty filter returns every row', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b', type: 'competition' })];
    expect(filterSessionRows(rows, EMPTY_SESSION_FILTER)).toHaveLength(2);
  });

  it('F2: search matches part of the name, case-insensitively', () => {
    const rows = [row({ id: 'a', name: 'Träning MSG' }), row({ id: 'b', name: 'KM Milsnabb' })];
    expect(filterSessionRows(rows, filter({ query: 'milsnabb' }))).toHaveLength(1);
  });

  // A shooter types "traning" on a phone keyboard without reaching for ä.
  it('F3: search ignores diacritics in both directions', () => {
    const rows = [row({ name: 'Träning MSG' })];
    expect(filterSessionRows(rows, filter({ query: 'traning' }))).toHaveLength(1);
    expect(
      filterSessionRows([row({ name: 'Traning' })], filter({ query: 'träning' })),
    ).toHaveLength(1);
  });

  it('F4: a whitespace-only query does not filter anything out', () => {
    expect(filterSessionRows([row()], filter({ query: '   ' }))).toHaveLength(1);
  });

  it('F5: type filter', () => {
    const rows = [row({ id: 'a', type: 'training' }), row({ id: 'b', type: 'competition' })];
    expect(filterSessionRows(rows, filter({ type: 'competition' }))[0]?.id).toBe('b');
  });

  it('F6: discipline filter', () => {
    const rows = [
      row({ id: 'a', disciplineId: 'spsf-precision' }),
      row({ id: 'b', disciplineId: 'spsf-milsnabb' }),
    ];
    expect(filterSessionRows(rows, filter({ disciplineId: 'spsf-milsnabb' }))[0]?.id).toBe('b');
  });

  // The case #317 named: 36 sessions tagged "Behöver granskning" could be
  // counted in Statistics but never listed.
  it('F7: tag filter matches a session carrying that tag among others', () => {
    const rows = [
      row({ id: 'a', tags: ['Behöver granskning', 'Import'] }),
      row({ id: 'b', tags: ['Import'] }),
    ];
    expect(filterSessionRows(rows, filter({ tag: 'Behöver granskning' }))).toHaveLength(1);
  });

  it('F8: firearm filter', () => {
    const rows = [row({ id: 'a', firearmId: 'f1' }), row({ id: 'b', firearmId: 'f2' })];
    expect(filterSessionRows(rows, filter({ firearmId: 'f2' }))[0]?.id).toBe('b');
  });

  it("F9: firearm 'none' finds sessions with no firearm recorded", () => {
    const rows = [row({ id: 'a', firearmId: 'f1' }), row({ id: 'b', firearmId: null })];
    expect(filterSessionRows(rows, filter({ firearmId: 'none' }))[0]?.id).toBe('b');
  });

  it('F10: filters combine with AND, not OR', () => {
    const rows = [
      row({ id: 'both', type: 'competition', disciplineId: 'spsf-milsnabb' }),
      row({ id: 'type-only', type: 'competition', disciplineId: 'spsf-precision' }),
      row({ id: 'discipline-only', type: 'training', disciplineId: 'spsf-milsnabb' }),
    ];
    const result = filterSessionRows(
      rows,
      filter({ type: 'competition', disciplineId: 'spsf-milsnabb' }),
    );
    expect(result.map((r) => r.id)).toEqual(['both']);
  });

  it('F11: order is preserved — the caller supplies newest-first', () => {
    const rows = [row({ id: 'newest' }), row({ id: 'older' }), row({ id: 'oldest' })];
    expect(filterSessionRows(rows, EMPTY_SESSION_FILTER).map((r) => r.id)).toEqual([
      'newest',
      'older',
      'oldest',
    ]);
  });
});

describe('isFilterActive', () => {
  it('F12: false for the empty filter, true for each dimension on its own', () => {
    expect(isFilterActive(EMPTY_SESSION_FILTER)).toBe(false);
    expect(isFilterActive(filter({ query: 'a' }))).toBe(true);
    expect(isFilterActive(filter({ type: 'training' }))).toBe(true);
    expect(isFilterActive(filter({ disciplineId: 'spsf-precision' }))).toBe(true);
    expect(isFilterActive(filter({ tag: 'Import' }))).toBe(true);
    expect(isFilterActive(filter({ firearmId: 'none' }))).toBe(true);
  });

  it('F13: a whitespace-only query is not an active filter', () => {
    expect(isFilterActive(filter({ query: '  ' }))).toBe(false);
  });
});

// #348: the list had every filter except the one a shooter actually reaches
// for — "when". Same vocabulary as the Statistics tab, so the two screens
// cannot drift apart.
describe('the date filter', () => {
  const NOW = new Date('2026-09-20T12:00:00.000Z');
  const filter = (over: Partial<SessionListFilter> = {}): SessionListFilter => ({
    ...EMPTY_SESSION_FILTER,
    ...over,
  });
  const rows = [
    row({ id: 'yesterday', startedAt: '2026-09-19T10:00:00.000Z' }),
    row({ id: 'twoMonths', startedAt: '2026-07-20T10:00:00.000Z' }),
    row({ id: 'lastYear', startedAt: '2025-09-20T10:00:00.000Z' }),
    row({ id: 'longAgo', startedAt: '2023-12-30T10:00:00.000Z' }),
  ];
  const kept = (f: SessionListFilter) => filterSessionRows(rows, f, NOW).map((r) => r.id);

  it('P1: "all" keeps every session', () => {
    expect(kept(filter())).toEqual(['yesterday', 'twoMonths', 'lastYear', 'longAgo']);
  });

  it('P2: each preset keeps only what falls inside it', () => {
    expect(kept(filter({ period: '30d' }))).toEqual(['yesterday']);
    expect(kept(filter({ period: '6m' }))).toEqual(['yesterday', 'twoMonths']);
    expect(kept(filter({ period: '12m' }))).toEqual(['yesterday', 'twoMonths']);
  });

  it('P3: a custom range bounds both ends, inclusively', () => {
    expect(
      kept(filter({ period: 'custom', customFrom: '2026-07-20', customTo: '2026-07-20' })),
    ).toEqual(['twoMonths']);
  });

  it('P4: a half-set custom range bounds only the end that is set', () => {
    expect(kept(filter({ period: 'custom', customFrom: '2026-07-01' }))).toEqual([
      'yesterday',
      'twoMonths',
    ]);
    expect(kept(filter({ period: 'custom', customTo: '2024-01-01' }))).toEqual(['longAgo']);
  });

  it('P5: a custom period with neither date set keeps everything', () => {
    expect(kept(filter({ period: 'custom' }))).toHaveLength(4);
  });

  it('P6: the date filter composes with the others', () => {
    expect(kept(filter({ period: '6m', type: 'competition' }))).toEqual([]);
    const withCompetition = filterSessionRows(
      [
        ...rows,
        row({ id: 'recentComp', type: 'competition', startedAt: '2026-09-18T10:00:00.000Z' }),
      ],
      filter({ period: '30d', type: 'competition' }),
      NOW,
    );
    expect(withCompetition.map((r) => r.id)).toEqual(['recentComp']);
  });

  it('P7: a period other than "all" counts as an active filter', () => {
    expect(isFilterActive(filter({ period: '30d' }))).toBe(true);
    expect(isFilterActive(filter({ period: 'custom' }))).toBe(true);
    expect(isFilterActive(filter())).toBe(false);
  });

  it('P8: sessionPeriodRange is unbounded for "all"', () => {
    expect(sessionPeriodRange(filter(), NOW)).toEqual({ fromIso: null, toIso: null });
  });
});
