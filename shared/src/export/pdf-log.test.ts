import { describe, expect, it } from 'vitest';

import { buildShootingLogHtml, type PdfLogEntry, type PdfLogSummary } from './pdf-log';

// The five columns of the preprinted club log, verified against real
// completed examples (#308).
const columns = {
  date: 'Date',
  location: 'Place',
  activity: 'Shooting activity',
  firearm: 'Firearm used',
  attestedBy: 'Attested by',
  empty: 'No sessions in this period.',
};

function summary(overrides: Partial<PdfLogSummary> = {}): PdfLogSummary {
  return {
    title: 'Shooting log',
    shooterLabel: 'Personal shooting log for: ______',
    personalIdLabel: 'Personal ID number: ______',
    periodLabel: '2026-03-01 – 2026-09-01',
    firearmLabel: null,
    totalsLabel: 'Sessions: 2 · Shots: 20',
    generatedAtLabel: 'Generated 2026-09-01',
    attestationNote: 'The “Attested by” column is left blank on purpose.',
    columns,
    ...overrides,
  };
}

const entries: PdfLogEntry[] = [
  {
    date: '2026-08-01',
    location: 'Malmö Skyttegille',
    activity: 'Precision · Training',
    firearm: 'Feinwerkbau AW93',
  },
  {
    date: '2026-08-15',
    location: 'Malmö Skyttegille',
    activity: 'Precision · Competition',
    firearm: 'CZ Shadow 2',
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
      buildShootingLogHtml(summary({ totalsLabel: 'Sessions: 0 · Shots: 0' }), []),
    ).toMatchSnapshot();
  });

  it('L1: names the firearm on every row', () => {
    const html = buildShootingLogHtml(summary(), entries);
    expect(html).toContain('Feinwerkbau AW93');
    expect(html).toContain('CZ Shadow 2');
  });

  it('L2: renders the "Attested by" heading but never fills its cells', () => {
    const html = buildShootingLogHtml(summary(), entries);
    expect(html).toContain('Attested by');
    // One empty signature cell per row, and nothing inside any of them.
    expect(html.match(/<td class="sign"><\/td>/g)).toHaveLength(entries.length);
    // Nothing between the tags at all — not even whitespace text.
    expect(html).not.toMatch(/<td class="sign">[^<]/);
  });

  it('L3: a session with no firearm still gets a row, with the caller’s label', () => {
    const html = buildShootingLogHtml(summary({ totalsLabel: 'Sessions: 1 · Shots: 10' }), [
      {
        date: '2026-08-01',
        location: 'Malmö Skyttegille',
        activity: 'Precision · Training',
        firearm: 'Not recorded',
      },
    ]);
    expect(html).toContain('Not recorded');
    expect(html.match(/<tr>/g)).toHaveLength(2); // header + one entry
  });

  it('L4: carries the attestation note under the table, but not when empty', () => {
    expect(buildShootingLogHtml(summary(), entries)).toContain('left blank on purpose');
    expect(
      buildShootingLogHtml(summary({ totalsLabel: 'Sessions: 0 · Shots: 0' }), []),
    ).not.toContain('left blank on purpose');
  });

  it('L5: omits the shooter line when the caller has none', () => {
    const html = buildShootingLogHtml(summary({ shooterLabel: null }), entries);
    expect(html).not.toContain('Personal shooting log for');
  });

  it('escapes HTML-significant characters in free text fields', () => {
    const html = buildShootingLogHtml(summary(), [
      {
        date: '2026-08-01',
        location: 'A & B "range"',
        activity: '<script>alert(1)</script>',
        firearm: 'CZ <b>Shadow</b>',
      },
    ]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B &quot;range&quot;');
    expect(html).toContain('CZ &lt;b&gt;Shadow&lt;/b&gt;');
  });

  it('is valid enough HTML to contain matching doctype/html tags', () => {
    const html = buildShootingLogHtml(summary(), entries);
    expect(html.trim().startsWith('<!doctype html>')).toBe(true);
    expect(html.trim().endsWith('</html>')).toBe(true);
  });
});

// #350, against a real accepted attachment (2026-09-20): the paper form asks
// for a personnummer beside the name, and the app has no business storing one.
describe('the personnummer line', () => {
  it('prints the caller\u2019s blank when one is given', () => {
    expect(buildShootingLogHtml(summary(), entries)).toContain('Personal ID number: ______');
  });

  it('is omitted entirely when null, like the name line', () => {
    expect(buildShootingLogHtml(summary({ personalIdLabel: null }), entries)).not.toContain(
      'Personal ID number',
    );
  });
});
