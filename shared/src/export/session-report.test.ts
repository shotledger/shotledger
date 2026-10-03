import { describe, expect, it } from 'vitest';

import { SPSF_PISTOL_25M_PRECISION } from '../target-scoring/targets';
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
    { label: 'Total', value: '183' },
  ],
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
};

const keypadSeries: SessionReportSeries = {
  title: 'Series 2',
  tags: ['Sighter'],
  total: '89',
  values: ['10', '9', '9', '8', '8'],
  marks: [],
  figures: [],
};

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('buildSessionReportHtml', () => {
  it('prints the header fields in order', () => {
    const html = buildSessionReportHtml(summary, SPSF_PISTOL_25M_PRECISION, [photoSeries]);
    const order = summary.fields.map((f) =>
      html.indexOf(`<span class="label">${f.label}</span> ${f.value}`),
    );
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('<h1>Precision training</h1>');
  });

  it('draws a target only for a series with marks; a keypad series prints values only', () => {
    const html = buildSessionReportHtml(summary, SPSF_PISTOL_25M_PRECISION, [
      photoSeries,
      keypadSeries,
    ]);
    expect(count(html, 'class="card"')).toBe(2);
    expect(count(html, '<svg')).toBe(1);
    expect(count(html, 'class="figures"')).toBe(1);
    // Every value of both series is printed.
    expect(count(html, 'class="value"')).toBe(10);
    expect(html).toContain('<span class="tag">Sighter</span>');
  });

  it('draws no target when the session has no known face', () => {
    const html = buildSessionReportHtml(summary, null, [photoSeries]);
    expect(html).not.toContain('<svg');
    expect(html).toContain('Windage');
  });

  it('says so when there are no series', () => {
    const html = buildSessionReportHtml(summary, SPSF_PISTOL_25M_PRECISION, []);
    expect(html).toContain('No series yet.');
    expect(html).not.toContain('class="card"');
  });

  it('escapes every caller string', () => {
    const html = buildSessionReportHtml({ ...summary, title: '<b>&"\'' }, null, [
      { ...keypadSeries, title: '<script>' },
    ]);
    expect(html).toContain('&lt;b&gt;&amp;&quot;&#39;');
    expect(html).not.toContain('<script>');
  });

  it('matches the snapshot', () => {
    expect(
      buildSessionReportHtml(summary, SPSF_PISTOL_25M_PRECISION, [photoSeries, keypadSeries]),
    ).toMatchSnapshot();
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
