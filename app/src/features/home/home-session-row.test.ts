import type { StatsSeries } from '@shotledger/shared';

import {
  AVERAGE_SYMBOL,
  buildHomeSessionRow,
  deriveSessionShapeFromContent,
  filterSessionRowsByShape,
  formatSeriesAverage,
  formatSessionTotal,
  type HomeSessionRow,
} from './home-session-row';

const session = {
  id: 'session-1',
  name: 'Onsdagsträning',
  type: 'training' as const,
  startedAt: '2026-01-05T00:00:00.000Z',
};

function series(overrides: Partial<StatsSeries> & { id: string }): StatsSeries {
  return {
    sessionId: session.id,
    startedAt: session.startedAt,
    disciplineId: 'spsf-precision',
    weaponGroup: 'spsf:C',
    shooterClass: '2',
    firearmId: null,
    ammoLotId: null,
    isSighter: false,
    isFinal: false,
    shots: [],
    totalOverride: null,
    ...overrides,
  };
}

describe('buildHomeSessionRow', () => {
  it('sums ordinary shot series into the total', () => {
    const row = buildHomeSessionRow(session, [
      series({ id: 's1', shots: [{ valueTenths: 90, isInnerTen: false }] }),
      series({ id: 's2', shots: [{ valueTenths: 80, isInnerTen: false }] }),
    ]);
    expect(row.total).toBe(17);
  });

  // WS1: a Webshooter/ShotLog import stores a series total with no `shots`
  // rows. Regression for the Home screen showing 0 for such sessions.
  it('uses a total-override series stored total, not its (empty) shots', () => {
    const row = buildHomeSessionRow(session, [
      series({ id: 'override', shots: [], totalOverride: { tenths: 470, shotCount: 5 } }),
    ]);
    expect(row.total).toBe(47);
  });

  it('mixes a total-override series with an ordinary series', () => {
    const row = buildHomeSessionRow(session, [
      series({ id: 'override', shots: [], totalOverride: { tenths: 470, shotCount: 5 } }),
      series({ id: 's2', shots: [{ valueTenths: 90, isInnerTen: false }] }),
    ]);
    expect(row.total).toBe(56);
  });

  it('excludes a sighter series from the total', () => {
    const row = buildHomeSessionRow(session, [
      series({ id: 'sighter', isSighter: true, shots: [{ valueTenths: 100, isInnerTen: false }] }),
      series({ id: 's2', shots: [{ valueTenths: 90, isInnerTen: false }] }),
    ]);
    expect(row.total).toBe(9);
  });

  describe('shape', () => {
    it('is "series" when the session has any series, even sighter-only', () => {
      const row = buildHomeSessionRow({ ...session, extraRounds: 0 }, [
        series({ id: 'sighter', isSighter: true, shots: [{ valueTenths: 90, isInnerTen: false }] }),
      ]);
      expect(row.shape).toBe('series');
    });

    it('is "roundsOnly" when there is no series but extraRounds > 0', () => {
      const row = buildHomeSessionRow({ ...session, extraRounds: 12 }, []);
      expect(row.shape).toBe('roundsOnly');
    });

    it('is null when there is neither a series nor extra rounds', () => {
      const row = buildHomeSessionRow({ ...session, extraRounds: 0 }, []);
      expect(row.shape).toBeNull();
    });

    it('is null when extraRounds is not provided', () => {
      const row = buildHomeSessionRow(session, []);
      expect(row.shape).toBeNull();
    });

    it('is "series" (not "roundsOnly") when a session has both series and extra rounds', () => {
      const row = buildHomeSessionRow({ ...session, extraRounds: 5 }, [
        series({ id: 's1', shots: [{ valueTenths: 90, isInnerTen: false }] }),
      ]);
      expect(row.shape).toBe('series');
    });
  });
});

describe('deriveSessionShapeFromContent', () => {
  // Stand-in for the future `session.kind` column (see the function's doc
  // comment) — this is the one place a later swap to reading that column
  // needs to change.
  it('is "series" for any series, even sighter-only, regardless of extraRounds', () => {
    const sighterOnly: StatsSeries[] = [
      series({ id: 's1', isSighter: true, shots: [{ valueTenths: 90, isInnerTen: false }] }),
    ];
    expect(deriveSessionShapeFromContent(sighterOnly, null)).toBe('series');
    expect(deriveSessionShapeFromContent(sighterOnly, 20)).toBe('series');
  });

  it('is "roundsOnly" for no series and extraRounds > 0', () => {
    expect(deriveSessionShapeFromContent([], 5)).toBe('roundsOnly');
  });

  it('is null for no series and no (or zero) extraRounds', () => {
    expect(deriveSessionShapeFromContent([], null)).toBeNull();
    expect(deriveSessionShapeFromContent([], 0)).toBeNull();
  });
});

describe('formatSessionTotal', () => {
  it('appends "p" with no whitespace', () => {
    expect(formatSessionTotal(311)).toBe('311p');
    expect(formatSessionTotal(0)).toBe('0p');
  });
});

describe('buildHomeSessionRow tags', () => {
  it('carries the tag names through, and defaults to none', () => {
    const session = {
      id: '1',
      name: 'A',
      type: 'training' as const,
      startedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(buildHomeSessionRow(session, [], ['KM', 'Tävling']).tags).toEqual(['KM', 'Tävling']);
    expect(buildHomeSessionRow(session, []).tags).toEqual([]);
  });
});

describe('formatSeriesAverage', () => {
  it('prefixes the average glyph and one decimal place', () => {
    expect(formatSeriesAverage(45)).toBe(`${AVERAGE_SYMBOL} 45.0`);
    expect(formatSeriesAverage(45.36)).toBe(`${AVERAGE_SYMBOL} 45.4`);
  });
});

describe('filterSessionRowsByShape', () => {
  const rows: HomeSessionRow[] = [
    {
      id: '1',
      name: 'A',
      type: 'training',
      startedAt: '',
      total: 0,
      seriesAverage: null,
      innerTenCount: 0,
      tags: [],
      falt: null,
      shape: 'series',
    },
    {
      id: '2',
      name: 'B',
      type: 'training',
      startedAt: '',
      total: 0,
      seriesAverage: null,
      innerTenCount: 0,
      tags: [],
      falt: null,
      shape: 'roundsOnly',
    },
    {
      id: '3',
      name: 'C',
      type: 'training',
      startedAt: '',
      total: 0,
      seriesAverage: null,
      innerTenCount: 0,
      tags: [],
      falt: null,
      shape: null,
    },
  ];

  it('returns every row for "all"', () => {
    expect(filterSessionRowsByShape(rows, 'all')).toEqual(rows);
  });

  it('returns only "series" rows', () => {
    expect(filterSessionRowsByShape(rows, 'series').map((r) => r.id)).toEqual(['1']);
  });

  it('returns only "roundsOnly" rows', () => {
    expect(filterSessionRowsByShape(rows, 'roundsOnly').map((r) => r.id)).toEqual(['2']);
  });
});
