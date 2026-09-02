import { describe, expect, it } from 'vitest';

import { buildShootingLogHtml, type PdfLogEntry, type PdfLogSummary } from './pdf-log';

const columns = {
  date: 'Date',
  discipline: 'Discipline',
  type: 'Type',
  seriesCount: 'Series',
  score: 'Score',
  location: 'Location',
  empty: 'No sessions in this period.',
};

function summary(overrides: Partial<PdfLogSummary> = {}): PdfLogSummary {
  return {
    title: 'Shooting log',
    periodLabel: '2026-03-01 – 2026-09-01',
    firearmLabel: null,
    totalSessions: 2,
    totalShots: 20,
    generatedAtLabel: 'Generated 2026-09-01',
    columns,
    ...overrides,
  };
}

const entries: PdfLogEntry[] = [
  {
    date: '2026-08-01',
    discipline: 'Precision',
    type: 'Training',
    seriesCount: 6,
    score: '270',
    location: 'Malmö Skyttegille',
  },
  {
    date: '2026-08-15',
    discipline: 'Precision',
    type: 'Competition',
    seriesCount: 10,
    score: '460',
    location: 'Malmö Skyttegille',
  },
];

describe('buildShootingLogHtml', () => {
  it('matches the snapshot with entries', () => {
    expect(buildShootingLogHtml(summary(), entries)).toMatchSnapshot();
  });

  it('matches the snapshot with a firearm filter', () => {
    expect(
      buildShootingLogHtml(summary({ firearmLabel: 'AW93 .22 LR' }), entries),
    ).toMatchSnapshot();
  });

  it('matches the snapshot with no entries', () => {
    expect(
      buildShootingLogHtml(summary({ totalSessions: 0, totalShots: 0 }), []),
    ).toMatchSnapshot();
  });

  it('escapes HTML-significant characters in free text fields', () => {
    const html = buildShootingLogHtml(summary(), [
      {
        date: '2026-08-01',
        discipline: '<script>alert(1)</script>',
        type: 'Training',
        seriesCount: 1,
        score: '9',
        location: 'A & B "range"',
      },
    ]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B &quot;range&quot;');
  });

  it('is valid enough HTML to contain matching doctype/html tags', () => {
    const html = buildShootingLogHtml(summary(), entries);
    expect(html.trim().startsWith('<!doctype html>')).toBe(true);
    expect(html.trim().endsWith('</html>')).toBe(true);
  });
});
