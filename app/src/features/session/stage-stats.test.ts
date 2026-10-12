import { stageStats, type StagedSeries } from './stage-stats';

function series(stage: string | null, points: number[], isSighter = false): StagedSeries {
  const shots = points.map((value) => ({ valueTenths: value * 10 }));
  return {
    stage,
    isSighter,
    isFinal: false,
    shots,
    totalTenths: shots.reduce((sum, shot) => sum + shot.valueTenths, 0),
  };
}

describe('stageStats', () => {
  it('gives each stage its total, series count and average, sighters excluded', () => {
    const rows = [
      series('A', [10, 10, 10, 10, 10], true),
      series('A', [10, 9, 9, 9, 9]),
      series('A', [10, 10, 9, 9, 8]),
      series('B', [10, 10, 10, 10, 10], true),
      series('B', [9, 9, 8, 8, 7]),
      series('C', [10, 10, 10, 10, 9]),
    ];
    expect(stageStats(['A', 'B', 'C'], rows)).toEqual([
      { stage: 'A', totalTenths: 920, seriesCount: 2, averageTenths: 460 },
      { stage: 'B', totalTenths: 410, seriesCount: 1, averageTenths: 410 },
      { stage: 'C', totalTenths: 490, seriesCount: 1, averageTenths: 490 },
    ]);
  });

  it('reports a stage with no scored series as zero with no average', () => {
    const rows = [series('A', [10, 10, 10, 10, 10]), series('B', [9, 9, 9, 9, 9], true)];
    expect(stageStats(['A', 'B', 'C'], rows)).toEqual([
      { stage: 'A', totalTenths: 500, seriesCount: 1, averageTenths: 500 },
      { stage: 'B', totalTenths: 0, seriesCount: 0, averageTenths: null },
      { stage: 'C', totalTenths: 0, seriesCount: 0, averageTenths: null },
    ]);
  });

  it('leaves a series not yet shot out of the count and the average', () => {
    expect(stageStats(['A'], [series('A', [10, 10, 10, 10, 8]), series('A', [])])).toEqual([
      { stage: 'A', totalTenths: 480, seriesCount: 1, averageTenths: 480 },
    ]);
  });

  it('counts an imported total-only series', () => {
    const imported: StagedSeries = {
      stage: 'B',
      isSighter: false,
      isFinal: false,
      shots: [],
      totalOverride: { tenths: 470, shotCount: 5 },
      totalTenths: 470,
    };
    expect(stageStats(['B'], [imported])).toEqual([
      { stage: 'B', totalTenths: 470, seriesCount: 1, averageTenths: 470 },
    ]);
  });

  it('ignores series outside the listed stages', () => {
    expect(stageStats(['A'], [series(null, [10]), series('D', [10]), series('A', [5])])).toEqual([
      { stage: 'A', totalTenths: 50, seriesCount: 1, averageTenths: 50 },
    ]);
  });

  it('is empty for a program without stages', () => {
    expect(stageStats([], [series(null, [10, 10, 10, 10, 10])])).toEqual([]);
  });
});
