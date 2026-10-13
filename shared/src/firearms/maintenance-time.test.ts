// vitest.config.ts pins TZ to Europe/Stockholm, so "local" below is CET/CEST.
import { describe, expect, it } from 'vitest';

import {
  maintenanceDue,
  maintenanceDueDay,
  maintenanceTimeNotificationAt,
  maintenanceTimeStatus,
} from './maintenance-time';

/** Local noon on a day, so a test date never sits on a midnight boundary. */
const noon = (day: string) => new Date(`${day}T12:00:00`);
const FROM = '2026-01-01T10:00:00.000Z';

describe('maintenanceDueDay', () => {
  it('is null without a usable interval', () => {
    expect(maintenanceDueDay(FROM, null)).toBeNull();
    expect(maintenanceDueDay(FROM, undefined)).toBeNull();
    expect(maintenanceDueDay(FROM, 0)).toBeNull();
    expect(maintenanceDueDay(FROM, -6)).toBeNull();
    expect(maintenanceDueDay(FROM, 1.5)).toBeNull();
  });

  it('is null when the start is not a date', () => {
    expect(maintenanceDueDay('not a date', 6)).toBeNull();
  });

  it('is the same day of the month, the interval later', () => {
    expect(maintenanceDueDay(FROM, 6)).toBe('2026-07-01');
    expect(maintenanceDueDay('2026-03-15T08:00:00.000Z', 1)).toBe('2026-04-15');
  });

  it('rolls over the year', () => {
    expect(maintenanceDueDay('2026-11-20T08:00:00.000Z', 3)).toBe('2027-02-20');
    expect(maintenanceDueDay(FROM, 24)).toBe('2028-01-01');
  });

  it("clamps to the target month's last day", () => {
    expect(maintenanceDueDay('2027-01-31T08:00:00.000Z', 1)).toBe('2027-02-28');
    expect(maintenanceDueDay('2028-01-31T08:00:00.000Z', 1)).toBe('2028-02-29');
    expect(maintenanceDueDay('2026-08-31T08:00:00.000Z', 1)).toBe('2026-09-30');
  });

  it('counts from the local day, not the UTC one', () => {
    // 23:30 UTC on 31 March is 01:30 on 1 April in Stockholm (CEST).
    expect(maintenanceDueDay('2026-03-31T23:30:00.000Z', 1)).toBe('2026-05-01');
  });
});

describe('maintenanceTimeStatus', () => {
  it('is unknown without an interval or a readable start', () => {
    expect(maintenanceTimeStatus(FROM, null, noon('2027-01-01'))).toBe('unknown');
    expect(maintenanceTimeStatus('nope', 6, noon('2027-01-01'))).toBe('unknown');
  });

  // 10 months from 1 Jan 2026 is 1 Nov 2026: 304 days. 80% is day 243.2.
  it('is green below 80% of the days', () => {
    expect(maintenanceTimeStatus(FROM, 10, noon('2026-01-01'))).toBe('green');
    expect(maintenanceTimeStatus(FROM, 10, noon('2026-09-01'))).toBe('green');
  });

  it('is amber from 80% up to the due day', () => {
    expect(maintenanceTimeStatus(FROM, 10, noon('2026-09-02'))).toBe('amber');
    expect(maintenanceTimeStatus(FROM, 10, noon('2026-10-31'))).toBe('amber');
  });

  it('is red from the due day on', () => {
    expect(maintenanceTimeStatus(FROM, 10, new Date('2026-11-01T00:00:01'))).toBe('red');
    expect(maintenanceTimeStatus(FROM, 10, noon('2027-06-01'))).toBe('red');
  });

  it('turns amber on exactly 80% of the days', () => {
    // 1 Feb to 1 Jul 2026 is 150 days; day 120 is 1 June.
    const from = '2026-02-01T10:00:00.000Z';
    expect(maintenanceTimeStatus(from, 5, noon('2026-05-31'))).toBe('green');
    expect(maintenanceTimeStatus(from, 5, noon('2026-06-01'))).toBe('amber');
  });

  it('is green when the start lies in the future', () => {
    expect(maintenanceTimeStatus(FROM, 10, noon('2025-12-01'))).toBe('green');
  });
});

describe('maintenanceDue', () => {
  const base = {
    roundsSinceMaintenance: 0,
    intervalRounds: null,
    countedFrom: FROM,
    intervalMonths: null,
  };

  it('is unknown with neither interval', () => {
    expect(maintenanceDue(base, noon('2027-01-01'))).toEqual({
      status: 'unknown',
      reasons: [],
      dueDay: null,
    });
  });

  it('is due by rounds alone', () => {
    expect(
      maintenanceDue(
        { ...base, roundsSinceMaintenance: 500, intervalRounds: 500 },
        noon('2026-02-01'),
      ),
    ).toEqual({ status: 'red', reasons: ['rounds'], dueDay: null });
  });

  it('is due by time alone, even with no rounds fired', () => {
    expect(
      maintenanceDue({ ...base, intervalRounds: 500, intervalMonths: 6 }, noon('2026-07-01')),
    ).toEqual({ status: 'red', reasons: ['time'], dueDay: '2026-07-01' });
  });

  it('names both limits when both are reached, rounds first', () => {
    expect(
      maintenanceDue(
        { ...base, roundsSinceMaintenance: 600, intervalRounds: 500, intervalMonths: 6 },
        noon('2026-08-01'),
      ).reasons,
    ).toEqual(['rounds', 'time']);
  });

  it('takes the worse half', () => {
    // Rounds amber (80%), time green.
    expect(
      maintenanceDue(
        { ...base, roundsSinceMaintenance: 400, intervalRounds: 500, intervalMonths: 10 },
        noon('2026-02-01'),
      ).status,
    ).toBe('amber');
    // Rounds green, time amber.
    expect(
      maintenanceDue(
        { ...base, roundsSinceMaintenance: 10, intervalRounds: 500, intervalMonths: 10 },
        noon('2026-10-01'),
      ).status,
    ).toBe('amber');
    // Rounds unset, time green.
    expect(maintenanceDue({ ...base, intervalMonths: 10 }, noon('2026-02-01')).status).toBe(
      'green',
    );
    // Rounds red, time amber: red, by rounds only.
    expect(
      maintenanceDue(
        { ...base, roundsSinceMaintenance: 500, intervalRounds: 500, intervalMonths: 10 },
        noon('2026-10-01'),
      ),
    ).toEqual({ status: 'red', reasons: ['rounds'], dueDay: '2026-11-01' });
  });
});

describe('maintenanceTimeNotificationAt', () => {
  it('is 09:00 local on the due day', () => {
    // 1 July is CEST (UTC+2).
    expect(maintenanceTimeNotificationAt(FROM, 6, noon('2026-03-01'))).toBe(
      '2026-07-01T07:00:00.000Z',
    );
    // 1 January is CET (UTC+1).
    expect(maintenanceTimeNotificationAt('2026-07-01T10:00:00.000Z', 6, noon('2026-08-01'))).toBe(
      '2027-01-01T08:00:00.000Z',
    );
  });

  it('is null without an interval', () => {
    expect(maintenanceTimeNotificationAt(FROM, null, noon('2026-03-01'))).toBeNull();
  });

  it('is null once the moment has come or passed', () => {
    expect(maintenanceTimeNotificationAt(FROM, 6, new Date('2026-07-01T07:00:00.000Z'))).toBeNull();
    expect(maintenanceTimeNotificationAt(FROM, 6, noon('2026-09-01'))).toBeNull();
    expect(maintenanceTimeNotificationAt(FROM, 6, new Date('2026-07-01T06:59:59.999Z'))).toBe(
      '2026-07-01T07:00:00.000Z',
    );
  });
});
