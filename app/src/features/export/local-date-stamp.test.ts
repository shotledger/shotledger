import { localDateStamp } from './local-date-stamp';

describe('localDateStamp', () => {
  it('uses the local calendar date just after local midnight', () => {
    expect(localDateStamp(new Date(2026, 8, 30, 0, 30))).toBe('2026-09-30');
  });

  it('uses the local calendar date just before local midnight', () => {
    expect(localDateStamp(new Date(2026, 8, 30, 23, 59))).toBe('2026-09-30');
  });

  it('zero-pads single-digit months and days', () => {
    expect(localDateStamp(new Date(2027, 0, 5, 12, 0))).toBe('2027-01-05');
  });
});
