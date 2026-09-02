import { describe, expect, it } from 'vitest';

import { licenseStatus } from './license-status';

const NOW = new Date('2026-09-01T00:00:00.000Z');

describe('licenseStatus', () => {
  it('is none when there is no license row', () => {
    expect(licenseStatus(undefined, NOW)).toBe('none');
  });

  it('is valid ("tills vidare") when valid_until is null', () => {
    expect(licenseStatus(null, NOW)).toBe('valid');
  });

  it('is valid when far from expiry', () => {
    expect(licenseStatus('2027-09-01T00:00:00.000Z', NOW)).toBe('valid');
  });

  it('is expiringSoon within the boundary (inclusive)', () => {
    expect(licenseStatus('2026-10-01T00:00:00.000Z', NOW)).toBe('expiringSoon'); // 30 days
    expect(licenseStatus('2026-09-08T00:00:00.000Z', NOW)).toBe('expiringSoon'); // 7 days
  });

  it('is expired once valid_until has passed', () => {
    expect(licenseStatus('2026-08-01T00:00:00.000Z', NOW)).toBe('expired');
  });

  it('treats the exact expiry instant as expiringSoon, not expired', () => {
    expect(licenseStatus(NOW.toISOString(), NOW)).toBe('expiringSoon');
  });
});
