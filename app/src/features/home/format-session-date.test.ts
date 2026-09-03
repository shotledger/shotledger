import { formatSessionDate } from './format-session-date';

describe('formatSessionDate', () => {
  it('formats Swedish without the abbreviated-month dot', () => {
    expect(formatSessionDate('2026-08-14T00:00:00.000Z', 'sv')).toBe('14 aug 2026');
  });

  it('formats English day-month-year, no comma', () => {
    expect(formatSessionDate('2026-08-14T00:00:00.000Z', 'en')).toBe('14 Aug 2026');
  });

  it('leaves a Swedish month with no dot unchanged (e.g. maj)', () => {
    expect(formatSessionDate('2026-05-05T00:00:00.000Z', 'sv')).toBe('5 maj 2026');
  });

  it('still strips the dot for a different dotted Swedish month (jan.)', () => {
    expect(formatSessionDate('2026-01-05T00:00:00.000Z', 'sv')).toBe('5 jan 2026');
  });
});
