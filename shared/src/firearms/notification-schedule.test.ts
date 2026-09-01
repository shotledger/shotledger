import { describe, expect, it } from 'vitest';

import { licenseExpiryNotifications, shouldNotifyMaintenanceDue } from './notification-schedule';

describe('shouldNotifyMaintenanceDue', () => {
  it('never fires without an interval', () => {
    expect(shouldNotifyMaintenanceDue(500, 1000, null)).toBe(false);
    expect(shouldNotifyMaintenanceDue(500, 1000, 0)).toBe(false);
  });

  it('fires exactly on the transition across 100%', () => {
    expect(shouldNotifyMaintenanceDue(995, 1000, 1000)).toBe(true);
  });

  it('does not fire again once already over the threshold', () => {
    expect(shouldNotifyMaintenanceDue(1000, 1005, 1000)).toBe(false);
  });

  it('does not fire while still under the threshold', () => {
    expect(shouldNotifyMaintenanceDue(700, 900, 1000)).toBe(false);
  });

  it('does not fire on the way down after a maintenance reset', () => {
    expect(shouldNotifyMaintenanceDue(1000, 0, 1000)).toBe(false);
  });

  it('fires when a single large batch jumps straight past the threshold', () => {
    expect(shouldNotifyMaintenanceDue(100, 1200, 1000)).toBe(true);
  });
});

describe('licenseExpiryNotifications', () => {
  const validUntil = '2027-01-01T00:00:00.000Z';

  it('returns [] for tills vidare (null valid_until)', () => {
    expect(licenseExpiryNotifications(null)).toEqual([]);
  });

  it('returns all future lead-time reminders, computed from valid_until', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const result = licenseExpiryNotifications(validUntil, now);
    expect(result.map((r) => r.leadDays)).toEqual([90, 30, 7]);
    expect(result[0]?.fireAt).toBe('2026-10-03T00:00:00.000Z'); // 90 days before
  });

  it('drops lead times that already lie in the past', () => {
    const now = new Date('2026-12-20T00:00:00.000Z'); // 12 days before expiry
    const result = licenseExpiryNotifications(validUntil, now);
    expect(result.map((r) => r.leadDays)).toEqual([7]);
  });

  it('returns [] once every lead time has passed', () => {
    const now = new Date('2026-12-31T23:00:00.000Z');
    expect(licenseExpiryNotifications(validUntil, now)).toEqual([]);
  });

  it('honors a custom lead-time list', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const result = licenseExpiryNotifications(validUntil, now, [1]);
    expect(result).toHaveLength(1);
    expect(result[0]?.leadDays).toBe(1);
  });
});
