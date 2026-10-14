// Spec: docs/specs/analytics-charts-spec.md. Each `TC-n` is the criterion.
import { DataViz } from '@shotledger/shared/src/design-tokens';

import {
  CHART_LINE_COLORS,
  axisNeedsYear,
  groupByDiscipline,
  timeExtent,
  timeScale,
  type DisciplinePoint,
  type TimeSeriesPoint,
} from './time-series-chart-math';

const PLOT_LEFT = 38;
const PLOT_WIDTH = 274;
const MID = PLOT_LEFT + PLOT_WIDTH / 2;

function point(startedAt: string, value = 100, key = startedAt): TimeSeriesPoint {
  return { key, startedAt, value };
}

const COLORS = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
const label = (id: string) => `L:${id}`;

describe('the time axis', () => {
  it('TC-1: the earliest point is at the left edge and the latest at the right', () => {
    const points = [point('2026-01-01T00:00:00Z'), point('2026-12-31T00:00:00Z')];
    const extent = timeExtent(points);
    expect(timeScale(points[0]!.startedAt, extent, PLOT_LEFT, PLOT_WIDTH)).toBe(PLOT_LEFT);
    expect(timeScale(points[1]!.startedAt, extent, PLOT_LEFT, PLOT_WIDTH)).toBe(
      PLOT_LEFT + PLOT_WIDTH,
    );
  });

  // The regression for the ordinal-axis bug: by index these three are evenly
  // spaced, and that is exactly the lie the chart used to tell.
  it('TC-2: a point is placed by time, not by its position in the array', () => {
    const points = [
      point('2026-01-01T00:00:00Z'),
      point('2026-01-02T00:00:00Z'),
      point('2026-04-11T00:00:00Z'),
    ];
    const extent = timeExtent(points);
    const x = points.map((p) => timeScale(p.startedAt, extent, PLOT_LEFT, PLOT_WIDTH));

    expect(x[1]! - x[0]!).toBeLessThan(PLOT_WIDTH / 10);
    expect(x[1]).not.toBeCloseTo(MID, 0);

    const half = [point('2026-01-01T00:00:00Z'), point('2026-01-03T00:00:00Z')];
    const halfExtent = timeExtent([...half, point('2026-01-05T00:00:00Z')]);
    expect(timeScale(half[1]!.startedAt, halfExtent, PLOT_LEFT, PLOT_WIDTH)).toBeCloseTo(MID, 6);
  });

  it('TC-3: points that all share one timestamp land mid-plot, with no NaN', () => {
    const shared = Array.from({ length: 111 }, (_, i) =>
      point('2023-12-30T10:00:00Z', 100, `s${i}`),
    );
    const extent = timeExtent(shared);
    for (const p of shared) {
      const x = timeScale(p.startedAt, extent, PLOT_LEFT, PLOT_WIDTH);
      expect(Number.isNaN(x)).toBe(false);
      expect(x).toBe(MID);
    }
  });

  it('TC-4: a single point lands mid-plot', () => {
    const only = [point('2026-05-01T00:00:00Z')];
    expect(timeScale(only[0]!.startedAt, timeExtent(only), PLOT_LEFT, PLOT_WIDTH)).toBe(MID);
  });

  it('TC-5: array order does not affect placement', () => {
    const forward = [point('2026-01-01T00:00:00Z'), point('2026-07-02T00:00:00Z')];
    const reversed = [...forward].reverse();
    const target = '2026-07-02T00:00:00Z';
    expect(timeScale(target, timeExtent(forward), PLOT_LEFT, PLOT_WIDTH)).toBe(
      timeScale(target, timeExtent(reversed), PLOT_LEFT, PLOT_WIDTH),
    );
  });
});

describe('axisNeedsYear', () => {
  it('TC-6: true when the range crosses a calendar year', () => {
    expect(axisNeedsYear([point('2023-12-30T00:00:00Z'), point('2026-09-15T00:00:00Z')])).toBe(
      true,
    );
  });

  it('TC-7: false within one year, including its first and last day', () => {
    expect(
      axisNeedsYear([
        point(new Date(2026, 0, 1).toISOString()),
        point(new Date(2026, 11, 31, 23).toISOString()),
      ]),
    ).toBe(false);
  });

  it('counts a point just after local New Year in the new year', () => {
    expect(
      axisNeedsYear([
        point(new Date(2026, 5, 1).toISOString()),
        point(new Date(2027, 0, 1, 0, 30).toISOString()),
      ]),
    ).toBe(true);
  });

  it('TC-8: false for an empty list and for a single point', () => {
    expect(axisNeedsYear([])).toBe(false);
    expect(axisNeedsYear([point('2026-05-01T00:00:00Z')])).toBe(false);
  });
});

describe('groupByDiscipline', () => {
  const dp = (sessionId: string, startedAt: string, disciplineId: string): DisciplinePoint => ({
    sessionId,
    startedAt,
    disciplineId,
  });
  const value = () => 100;

  it('TC-9: one line per discipline, each with only its own points', () => {
    const { lines } = groupByDiscipline(
      [
        dp('a', '2026-01-01T00:00:00Z', 'precision'),
        dp('b', '2026-01-02T00:00:00Z', 'milsnabb'),
        dp('c', '2026-01-03T00:00:00Z', 'precision'),
      ],
      value,
      label,
      COLORS,
    );
    expect(lines.map((l) => l.key)).toEqual(['milsnabb', 'precision']);
    expect(lines.find((l) => l.key === 'precision')!.points.map((p) => p.key)).toEqual(['a', 'c']);
    expect(lines[0]!.label).toBe('L:milsnabb');
  });

  // Colour follows the entity, not its rank: the same data must paint the same.
  it('TC-10: lines are ordered by discipline id, so colours are stable', () => {
    const forward = groupByDiscipline(
      [dp('a', '2026-01-01T00:00:00Z', 'zulu'), dp('b', '2026-01-02T00:00:00Z', 'alpha')],
      value,
      label,
      COLORS,
    );
    const reversed = groupByDiscipline(
      [dp('b', '2026-01-02T00:00:00Z', 'alpha'), dp('a', '2026-01-01T00:00:00Z', 'zulu')],
      value,
      label,
      COLORS,
    );
    expect(forward.lines.map((l) => [l.key, l.color])).toEqual([
      ['alpha', 'c0'],
      ['zulu', 'c1'],
    ]);
    expect(reversed.lines.map((l) => [l.key, l.color])).toEqual(
      forward.lines.map((l) => [l.key, l.color]),
    );
  });

  it('TC-11: each line’s points are chronological', () => {
    const { lines } = groupByDiscipline(
      [
        dp('late', '2026-06-01T00:00:00Z', 'precision'),
        dp('early', '2026-01-01T00:00:00Z', 'precision'),
      ],
      value,
      label,
      COLORS,
    );
    expect(lines[0]!.points.map((p) => p.key)).toEqual(['early', 'late']);
  });

  it('TC-12: a rejected point is dropped, and a discipline left empty makes no line', () => {
    const { lines } = groupByDiscipline(
      [
        dp('scored', '2026-01-01T00:00:00Z', 'precision'),
        dp('unscored', '2026-01-02T00:00:00Z', 'milsnabb'),
      ],
      (p) => (p.sessionId === 'unscored' ? null : 100),
      label,
      COLORS,
    );
    expect(lines.map((l) => l.key)).toEqual(['precision']);
  });

  it('TC-13: no points, no lines', () => {
    expect(groupByDiscipline([], value, label, COLORS)).toEqual({ lines: [], omittedCount: 0 });
  });

  // Never cycle a hue: two disciplines in one colour says they are one thing.
  it('TC-14: past the palette, the busiest are kept and the rest are counted', () => {
    const points: DisciplinePoint[] = [];
    for (let d = 0; d < 10; d += 1) {
      // Discipline 0 gets 10 points, 1 gets 9, and so on — so the two thinnest
      // are the two dropped.
      for (let n = 0; n < 10 - d; n += 1) {
        points.push(dp(`s${d}-${n}`, `2026-01-0${(n % 9) + 1}T00:00:00Z`, `d${d}`));
      }
    }
    const { lines, omittedCount } = groupByDiscipline(points, value, label, COLORS);
    expect(lines).toHaveLength(8);
    expect(omittedCount).toBe(2);
    expect(lines.map((l) => l.key)).not.toContain('d8');
    expect(lines.map((l) => l.key)).not.toContain('d9');
    expect(new Set(lines.map((l) => l.color)).size).toBe(8);
  });

  it("draws the lines in the design tokens' categorical chart colours", () => {
    expect(CHART_LINE_COLORS.light).toEqual(DataViz.light.categorical);
    expect(CHART_LINE_COLORS.dark).toEqual(DataViz.dark.categorical);
  });
});
