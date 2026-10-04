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

// Reminders fire at 09:00 local time; the expected instants are built with the
// local Date constructor so they hold in whatever zone runs the tests.
const nineAm = (year: number, monthIndex: number, day: number) =>
  new Date(year, monthIndex, day, 9, 0).toISOString();

describe('licenseExpiryNotifications', () => {
  const validUntil = '2027-01-01';

  it('returns [] for tills vidare (null valid_until)', () => {
    expect(licenseExpiryNotifications(null)).toEqual([]);
  });

  it('returns all future lead-time reminders, computed from valid_until', () => {
    const now = new Date(2026, 0, 1);
    const result = licenseExpiryNotifications(validUntil, now);
    expect(result.map((r) => r.leadDays)).toEqual([90, 30, 7]);
  });

  it('fires at 09:00 local time on the day the lead time names', () => {
    const now = new Date(2026, 0, 1);
    expect(licenseExpiryNotifications(validUntil, now)).toEqual([
      { leadDays: 90, fireAt: nineAm(2026, 9, 3) },
      { leadDays: 30, fireAt: nineAm(2026, 11, 2) },
      { leadDays: 7, fireAt: nineAm(2026, 11, 25) },
    ]);
  });

  it('counts lead times in calendar days across a DST change', () => {
    // European summer time ends 2026-10-25: a 24-hour step back from
    // 1 Nov would land an hour off 09:00.
    const now = new Date(2026, 8, 1);
    expect(licenseExpiryNotifications('2026-11-01', now, [7, 30])).toEqual([
      { leadDays: 7, fireAt: nineAm(2026, 9, 25) },
      { leadDays: 30, fireAt: nineAm(2026, 9, 2) },
    ]);
  });

  it.each([
    // European DST: summer time ends 2026-10-25 (a 25-hour day) and
    // starts 2026-03-29 (a 23-hour day); 09:00 is 09:00 on, before and after.
    ['the day before summer time ends', '2026-11-01', 8, [2026, 9, 24]],
    ['the day summer time ends', '2026-11-01', 7, [2026, 9, 25]],
    ['the day after summer time ends', '2026-11-01', 6, [2026, 9, 26]],
    ['the day before summer time starts', '2026-04-05', 8, [2026, 2, 28]],
    ['the day summer time starts', '2026-04-05', 7, [2026, 2, 29]],
    ['the day after summer time starts', '2026-04-05', 6, [2026, 2, 30]],
  ] as const)('fires at 09:00 on %s', (_label, until, leadDays, [y, m, d]) => {
    const [reminder] = licenseExpiryNotifications(until, new Date(2026, 0, 1), [leadDays]);
    expect(reminder?.fireAt).toBe(nineAm(y, m, d));
    const local = new Date(reminder!.fireAt);
    expect([local.getHours(), local.getMinutes(), local.getDate()]).toEqual([9, 0, d]);
  });

  it('drops lead times that already lie in the past', () => {
    const now = new Date(2026, 11, 20); // 12 days before expiry
    const result = licenseExpiryNotifications(validUntil, now);
    expect(result.map((r) => r.leadDays)).toEqual([7]);
  });

  it('drops a reminder whose instant is exactly now', () => {
    const now = new Date(2026, 11, 25, 9, 0); // the 7-day reminder's instant
    expect(licenseExpiryNotifications(validUntil, now)).toEqual([]);
    const justBefore = new Date(now.getTime() - 1);
    expect(licenseExpiryNotifications(validUntil, justBefore).map((r) => r.leadDays)).toEqual([7]);
  });

  it('still schedules a reminder due later today, before 09:00', () => {
    const earlyMorning = new Date(2026, 11, 25, 0, 30);
    expect(licenseExpiryNotifications(validUntil, earlyMorning)).toEqual([
      { leadDays: 7, fireAt: nineAm(2026, 11, 25) },
    ]);
  });

  it('returns [] once every lead time has passed', () => {
    const now = new Date(2026, 11, 31, 23, 0);
    expect(licenseExpiryNotifications(validUntil, now)).toEqual([]);
  });

  it('honors a custom lead-time list', () => {
    const now = new Date(2026, 0, 1);
    expect(licenseExpiryNotifications(validUntil, now, [1])).toEqual([
      { leadDays: 1, fireAt: nineAm(2026, 11, 31) },
    ]);
  });

  it.each([
    ['an empty string', ''],
    ['free text', 'next year'],
    ['an impossible day', '2026-02-31'],
    ['a full timestamp', '2027-01-01T00:00:00.000Z'],
  ])('schedules nothing for %s', (_label, value) => {
    expect(licenseExpiryNotifications(value, new Date(2026, 0, 1))).toEqual([]);
  });
});
