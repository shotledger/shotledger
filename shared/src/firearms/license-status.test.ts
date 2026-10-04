import { describe, expect, it } from 'vitest';

import { licenseStatus } from './license-status';

// Every `now` is built with the local Date constructor, so each assertion
// holds in whatever zone runs it — the stored value is a day on that clock.
const NOW = new Date(2026, 8, 1, 12, 0); // 2026-09-01 local, midday

describe('licenseStatus', () => {
  it('is none when there is no license row', () => {
    expect(licenseStatus(undefined, NOW)).toBe('none');
  });

  it('is valid ("tills vidare") when valid_until is null', () => {
    expect(licenseStatus(null, NOW)).toBe('valid');
  });

  it('is valid when far from expiry', () => {
    expect(licenseStatus('2027-09-01', NOW)).toBe('valid');
  });

  it('is expiringSoon within the boundary (inclusive)', () => {
    expect(licenseStatus('2026-10-01', NOW)).toBe('expiringSoon'); // 30 days
    expect(licenseStatus('2026-09-08', NOW)).toBe('expiringSoon'); // 7 days
    expect(licenseStatus('2026-10-02', NOW)).toBe('valid'); // 31 days
  });

  it('is expired once valid_until has passed', () => {
    expect(licenseStatus('2026-08-01', NOW)).toBe('expired');
    expect(licenseStatus('2026-08-31', NOW)).toBe('expired');
  });

  it('treats the last valid day itself as expiringSoon, not expired', () => {
    expect(licenseStatus('2026-09-01', NOW)).toBe('expiringSoon');
  });

  describe('a date-only value is a local calendar day', () => {
    it('is valid all of its last day', () => {
      // "Giltig t.o.m. 1 okt" — good from local midnight to the last
      // millisecond of 1 Oct, whatever the UTC offset.
      expect(licenseStatus('2026-10-01', new Date(2026, 9, 1, 0, 0))).toBe('expiringSoon');
      expect(licenseStatus('2026-10-01', new Date(2026, 9, 1, 2, 0))).toBe('expiringSoon');
      expect(licenseStatus('2026-10-01', new Date(2026, 9, 1, 23, 59, 59, 999))).toBe(
        'expiringSoon',
      );
    });

    it('is expired from the local midnight after it', () => {
      expect(licenseStatus('2026-10-01', new Date(2026, 9, 2, 0, 0))).toBe('expired');
    });

    it('counts the expiring-soon boundary in local calendar days', () => {
      // Just after local midnight on 1 Sep is still 31 Aug in UTC east of
      // Greenwich; 1 Oct is 30 days away on the shooter's calendar all the same.
      const justAfterMidnight = new Date(2026, 8, 1, 0, 30);
      expect(licenseStatus('2026-10-01', justAfterMidnight)).toBe('expiringSoon');
      expect(licenseStatus('2026-10-02', justAfterMidnight)).toBe('valid');

      const lateEvening = new Date(2026, 8, 1, 23, 30);
      expect(licenseStatus('2026-10-01', lateEvening)).toBe('expiringSoon');
      expect(licenseStatus('2026-10-02', lateEvening)).toBe('valid');

      const lastMinuteBefore = new Date(2026, 7, 31, 23, 59, 59, 999);
      expect(licenseStatus('2026-10-01', lastMinuteBefore)).toBe('valid'); // 31 days
    });

    it('counts calendar days, not 24-hour spans, across a DST change', () => {
      // European summer time ends 2026-10-25, a 25-hour local day.
      const now = new Date(2026, 9, 1, 0, 30);
      expect(licenseStatus('2026-10-31', now)).toBe('expiringSoon'); // 30 days
      expect(licenseStatus('2026-11-01', now)).toBe('valid'); // 31 days
    });

    it('counts across a year boundary', () => {
      const newYearsEve = new Date(2026, 11, 31, 23, 0);
      expect(licenseStatus('2026-12-31', newYearsEve)).toBe('expiringSoon');
      expect(licenseStatus('2027-01-30', newYearsEve)).toBe('expiringSoon'); // 30 days
      expect(licenseStatus('2027-01-31', newYearsEve)).toBe('valid'); // 31 days
    });
  });

  describe('fails closed on a value that is not a stored date', () => {
    it.each([
      ['an empty string', ''],
      ['free text', 'next year'],
      ['an impossible day', '2026-02-31'],
      ['an impossible month', '2026-13-01'],
      ['a month of zero', '2026-00-10'],
      ['a day of zero', '2026-10-00'],
      ['a two-digit year padded to four', '0026-10-01'],
      ['an unpadded month', '2026-1-01'],
      ['a full timestamp', '2026-10-01T00:00:00.000Z'],
      ['trailing text', '2026-10-01 x'],
      ['leading text', 'x 2026-10-01'],
    ])('reads %s as expired, never valid', (_label, value) => {
      expect(licenseStatus(value, NOW)).toBe('expired');
    });
  });
});
