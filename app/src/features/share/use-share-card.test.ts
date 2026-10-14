import type { TFunction } from 'i18next';

import type { SessionDetail, SeriesRow } from '@/features/session/use-session-detail';

import { buildSeriesShareCardModel, buildSessionShareCardModel } from './use-share-card';

jest.mock('@/db/client', () => ({
  get db() {
    return null;
  },
}));
jest.mock('@/db/queries/firearms', () => ({ getFirearm: () => null }));

const t = ((key: string) => key) as unknown as TFunction;

function row(position: number, totalTenths: number): SeriesRow {
  return {
    position,
    isSighter: false,
    isTotalOverride: false,
    shots: [],
    totalTenths,
  } as unknown as SeriesRow;
}

function detail(scoringMode: 'integer' | 'decimal', totals: number[]): SessionDetail {
  return {
    session: {
      startedAt: '2026-09-01T10:00:00.000Z',
      disciplineId: 'spsf-precision',
      weaponGroup: null,
      shooterClass: null,
      firearmId: null,
    },
    results: {
      beforeFinalTenths: 0,
      finalTenths: 0,
      totalTenths: totals.reduce((sum, value) => sum + value, 0),
      hasFinal: false,
    },
    seriesAverageTenths: 450,
    innerTenCount: 0,
    seriesRows: totals.map((total, index) => row(index + 1, total)),
    scoringMode,
  } as unknown as SessionDetail;
}

describe('share card score labels', () => {
  it('prints integer-scored totals as whole points', () => {
    const model = buildSessionShareCardModel(t, 'en', detail('integer', [420, 480]), '');
    expect(model?.totalLabel).toBe('90');
    expect(model?.series.map((s) => s.totalLabel)).toEqual(['42', '48']);
    // A mean is not a total: it keeps its decimal.
    expect(model?.averageLabel).toBe('45.0');
  });

  it('keeps one decimal for a decimal-scored session, even on a whole total', () => {
    const model = buildSessionShareCardModel(t, 'en', detail('decimal', [1040, 1027]), '');
    expect(model?.totalLabel).toBe('206.7');
    expect(model?.series.map((s) => s.totalLabel)).toEqual(['104.0', '102.7']);
  });

  it('formats a single series card the same way', () => {
    const integer = detail('integer', [420]);
    const integerRow = integer.seriesRows[0]!;
    expect(buildSeriesShareCardModel(t, 'en', integer, integerRow, '')?.totalLabel).toBe('42');
    const decimal = detail('decimal', [1040]);
    const decimalRow = decimal.seriesRows[0]!;
    expect(buildSeriesShareCardModel(t, 'en', decimal, decimalRow, '')?.totalLabel).toBe('104.0');
  });
});
