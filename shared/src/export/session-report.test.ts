import { describe, expect, it } from 'vitest';

import { MIN_SHOTS_FOR_HEATMAP } from '../heatmap/heat-density';
import { ISSF_25M_RAPID_FIRE, SPSF_PISTOL_25M_PRECISION } from '../target-scoring/targets';
import {
  buildSessionReportHtml,
  reportViewHalfMm,
  targetFaceSvg,
  type SessionReportSeries,
  type SessionReportSummary,
} from './session-report';

const summary: SessionReportSummary = {
  title: 'Precision training',
  fields: [
    { label: 'Date', value: '3 Oct 2026' },
    { label: 'Discipline', value: 'Precision' },
    { label: 'Firearm', value: 'Make Model' },
  ],
  summaryHeading: 'Session Summary',
  results: [
    { label: 'Total', value: '183' },
    { label: 'Avg/Series', value: '91.5' },
  ],
  plots: [],
  distribution: null,
  generatedAtLabel: 'Generated 3 Oct 2026',
  emptyLabel: 'No series yet.',
};

const photoSeries: SessionReportSeries = {
  title: 'Series 1',
  tags: [],
  total: '94',
  values: ['X', '10', '10', '9', '9'],
  marks: [
    { xMm: 5, yMm: -3, caliberMm: 9.65 },
    { xMm: -12, yMm: 8, caliberMm: 9.65 },
    { xMm: 20, yMm: 15, caliberMm: 9.65 },
  ],
  figures: [
    { label: 'Windage', value: '4.3 mm' },
    { label: 'Elevation', value: '-6.7 mm' },
    { label: 'Mean Radius', value: '15.0 mm' },
    { label: 'Max Spread', value: '33.3 mm' },
  ],
  target: SPSF_PISTOL_25M_PRECISION,
};

const keypadSeries: SessionReportSeries = {
  title: 'Series 2',
  tags: ['Sighter'],
  total: '89',
  values: ['10', '9', '9', '8', '8'],
  marks: [],
  figures: [],
  target: SPSF_PISTOL_25M_PRECISION,
};

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('buildSessionReportHtml', () => {
  it('prints the header fields in order', () => {
    const html = buildSessionReportHtml(summary, [photoSeries]);
    const order = summary.fields.map((f) =>
      html.indexOf(`<span class="label">${f.label}</span> ${f.value}`),
    );
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('<h1>Precision training</h1>');
  });

  it('draws a target only for a series with marks; a keypad series prints values only', () => {
    const html = buildSessionReportHtml(summary, [photoSeries, keypadSeries]);
    expect(count(html, 'class="card"')).toBe(2);
    expect(count(html, '<svg')).toBe(1);
    expect(count(html, 'class="figures"')).toBe(1);
    // Every value of both series is printed.
    expect(count(html, 'class="value"')).toBe(10);
    expect(html).toContain('<span class="tag">Sighter</span>');
  });

  it('draws no target when the session has no known face', () => {
    const html = buildSessionReportHtml(summary, [{ ...photoSeries, target: null }]);
    expect(html).not.toContain('<svg');
    expect(html).toContain('Windage');
  });

  it('says so when there are no series', () => {
    const html = buildSessionReportHtml(summary, []);
    expect(html).toContain('No series yet.');
    expect(html).not.toContain('class="card"');
  });

  it('escapes every caller string', () => {
    const html = buildSessionReportHtml({ ...summary, title: '<b>&"\'' }, [
      { ...keypadSeries, title: '<script>' },
    ]);
    expect(html).toContain('&lt;b&gt;&amp;&quot;&#39;');
    expect(html).not.toContain('<script>');
  });

  it('opens with the session summary: results, then one target per plot', () => {
    const plot = {
      caption: 'All Series',
      target: SPSF_PISTOL_25M_PRECISION,
      marks: photoSeries.marks,
      figures: photoSeries.figures,
      heatmapCaption: 'All Series · Heatmap',
    };
    const html = buildSessionReportHtml({ ...summary, plots: [plot, { ...plot, caption: 'B' }] }, [
      keypadSeries,
    ]);
    expect(html.indexOf('<h2>Session Summary</h2>')).toBeLessThan(html.indexOf('class="card"'));
    expect(html).toContain(
      '<div class="result-value">91.5</div><div class="result-label">Avg/Series</div>',
    );
    expect(count(html, 'class="plot"')).toBe(2);
    expect(count(html, '<svg')).toBe(2);
    expect(html).toContain('<div class="plot-caption">B</div>');
  });

  it('adds a heat map beside the combined target from MIN_SHOTS_FOR_HEATMAP marks', () => {
    const marksOf = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        xMm: (i % 7) * 6 - 18,
        yMm: (i % 5) * 7 - 14,
        caliberMm: 5.6,
      }));
    const plot = (count: number) => ({
      caption: 'All Series',
      target: SPSF_PISTOL_25M_PRECISION,
      marks: marksOf(count),
      figures: [],
      heatmapCaption: 'All Series · Heatmap',
    });
    const below = buildSessionReportHtml({ ...summary, plots: [plot(MIN_SHOTS_FOR_HEATMAP - 1)] }, [
      keypadSeries,
    ]);
    expect(count(below, '<svg')).toBe(1);
    expect(below).not.toContain('Heatmap');
    const at = buildSessionReportHtml({ ...summary, plots: [plot(MIN_SHOTS_FOR_HEATMAP)] }, [
      keypadSeries,
    ]);
    expect(at).toContain('<div class="plot-caption">All Series · Heatmap</div>');
    expect(count(at, '<svg')).toBe(2);
    // Drawn over the face, blurred, hottest cell whitening past red.
    expect(at).toContain('filter="url(#heat-blur)"');
    expect(at).toMatch(/fill="#ff[d-f][0-9a-f]{3}" fill-opacity="0\.9"/);
  });

  it('prints the shot distribution as value over count', () => {
    const html = buildSessionReportHtml(
      {
        ...summary,
        distribution: {
          heading: 'Shot Distribution (8 shots)',
          buckets: [
            { label: '10', value: '3' },
            { label: '9', value: '5' },
          ],
        },
      },
      [keypadSeries],
    );
    expect(html).toContain('Shot Distribution (8 shots)');
    expect(html).toContain('<tr><th>10</th><th>9</th></tr><tr><td>3</td><td>5</td></tr>');
  });

  it('prints the results without a plot when no series has marks', () => {
    const html = buildSessionReportHtml(summary, [keypadSeries]);
    expect(html).toContain('class="results"');
    expect(html).not.toContain('class="plots"');
    expect(html).not.toContain('<svg');
  });

  it('draws each series on its own face', () => {
    const html = buildSessionReportHtml(summary, [
      photoSeries,
      { ...photoSeries, title: 'Series 2', target: ISSF_25M_RAPID_FIRE },
    ]);
    const viewBoxes = [...html.matchAll(/viewBox="([^"]+)"/g)].map((m) => m[1]);
    // The same marks frame differently on the two faces' ring spacing.
    expect(viewBoxes).toHaveLength(2);
    expect(viewBoxes[0]).not.toBe(viewBoxes[1]);
  });

  it('matches the snapshot', () => {
    expect(buildSessionReportHtml(summary, [photoSeries, keypadSeries])).toMatchSnapshot();
  });
});

describe('targetFaceSvg', () => {
  it('draws one circle per ring plus the black and each mark, in target-mm space', () => {
    const svg = targetFaceSvg(SPSF_PISTOL_25M_PRECISION, photoSeries.marks, 170);
    // Marks reach 29.8 mm, inside the 9 (r 50): framed on the 8 (r 75) + 5%.
    expect(svg).toContain('viewBox="-78.75 -78.75 157.5 157.5"');
    const rings = SPSF_PISTOL_25M_PRECISION.rings.length;
    // black disc + rings + marks + mean-radius circle
    expect(count(svg, '<circle')).toBe(1 + rings + 3 + 1);
    expect(svg).toContain('<circle cx="5" cy="-3" r="4.83"');
  });

  it('lightens the center of a face whose black is an annulus', () => {
    const annulus = { ...SPSF_PISTOL_25M_PRECISION, referenceIsSolidBlack: false };
    const svg = targetFaceSvg(annulus, photoSeries.marks, 170);
    const rings = SPSF_PISTOL_25M_PRECISION.rings.length;
    // black disc + light center + rings + marks + mean-radius circle
    expect(count(svg, '<circle')).toBe(1 + 1 + rings + 3 + 1);
  });

  it('draws no group overlay for a single mark', () => {
    const svg = targetFaceSvg(SPSF_PISTOL_25M_PRECISION, [photoSeries.marks[0]!], 170);
    expect(svg).not.toContain('<line');
  });
});

describe('reportViewHalfMm', () => {
  const mark = (xMm: number, yMm: number) => ({ xMm, yMm, caliberMm: 5.6 });

  it('frames one ring beyond the ring holding every mark', () => {
    // 10 (r 25) holds 22.8 mm; the 9 (r 50) frames it.
    expect(reportViewHalfMm(SPSF_PISTOL_25M_PRECISION, [mark(20, 0)])).toBeCloseTo(52.5);
  });

  it('follows the widest mark', () => {
    // 7 (r 100) holds 92.8 mm; the 6 (r 125) frames it.
    expect(reportViewHalfMm(SPSF_PISTOL_25M_PRECISION, [mark(1, 1), mark(0, -90)])).toBeCloseTo(
      131.25,
    );
  });

  it('shows the whole face for a mark in the outer rings', () => {
    expect(reportViewHalfMm(SPSF_PISTOL_25M_PRECISION, [mark(220, 0)])).toBeCloseTo(262.5);
  });

  it('widens past the face for a mark off it', () => {
    expect(reportViewHalfMm(SPSF_PISTOL_25M_PRECISION, [mark(300, 0)])).toBeCloseTo(302.8 * 1.05);
  });
});
