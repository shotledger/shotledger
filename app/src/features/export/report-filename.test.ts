import { sessionReportFilename } from './report-filename';

describe('sessionReportFilename', () => {
  it('names the file after the session and its local day', () => {
    expect(sessionReportFilename('Training — 12 Oct 2026', '2026-10-12T08:00:00.000Z')).toBe(
      'Training-12-Oct-2026-2026-10-12.pdf',
    );
  });

  it('keeps Swedish letters and drops punctuation', () => {
    expect(sessionReportFilename('Träning: fält/precision', '2026-10-12T08:00:00.000Z')).toBe(
      'Träning-fält-precision-2026-10-12.pdf',
    );
  });

  it('uses the local day, not the UTC one', () => {
    // 23:30 UTC on the 11th is already the 12th in Stockholm (the test zone).
    expect(sessionReportFilename('Kväll', '2026-10-11T23:30:00.000Z')).toBe('Kväll-2026-10-12.pdf');
  });

  it('falls back to a generic name when nothing usable is left', () => {
    expect(sessionReportFilename(' — ', '2026-10-12T08:00:00.000Z')).toBe('session-2026-10-12.pdf');
  });

  it('caps a long name', () => {
    const name = sessionReportFilename('a'.repeat(200), '2026-10-12T08:00:00.000Z');
    expect(name).toBe(`${'a'.repeat(60)}-2026-10-12.pdf`);
  });
});
