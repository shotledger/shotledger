import { describe, expect, it } from 'vitest';

import {
  latestMaintenanceEvent,
  roundsSinceMaintenance,
  type MaintenanceCounterEvent,
} from './maintenance-counter';

const event = (
  id: string,
  performedAt: string,
  roundCountAt: number,
  extra: Partial<MaintenanceCounterEvent> = {},
): MaintenanceCounterEvent => ({ id, performedAt, roundCountAt, isAdjustment: 0, ...extra });

describe('roundsSinceMaintenance (M2)', () => {
  it('is the whole round count when no maintenance is logged', () => {
    expect(roundsSinceMaintenance(740, [])).toBe(740);
  });

  it('counts from the one logged event', () => {
    expect(roundsSinceMaintenance(740, [event('a', '2026-09-01T10:00:00.000Z', 500)])).toBe(240);
  });

  it('ignores adjustments, which move the round count but are not maintenance', () => {
    const events = [
      event('a', '2026-09-01T10:00:00.000Z', 500),
      event('b', '2026-09-05T10:00:00.000Z', 700, { isAdjustment: 1 }),
      event('c', '2026-09-06T10:00:00.000Z', 710, { isAdjustment: true }),
    ];
    expect(roundsSinceMaintenance(740, events)).toBe(240);
  });

  it('ignores a deleted event, so deleting the newest restores the previous figure', () => {
    const events = [
      event('a', '2026-09-01T10:00:00.000Z', 500),
      event('b', '2026-09-05T10:00:00.000Z', 700, { deletedAt: '2026-09-06T10:00:00.000Z' }),
    ];
    expect(roundsSinceMaintenance(740, events)).toBe(240);
  });

  it('treats a null deletedAt as live', () => {
    expect(
      roundsSinceMaintenance(740, [
        event('a', '2026-09-01T10:00:00.000Z', 500, { deletedAt: null }),
      ]),
    ).toBe(240);
  });

  it('never goes below zero when rounds before the event were removed', () => {
    expect(roundsSinceMaintenance(450, [event('a', '2026-09-01T10:00:00.000Z', 500)])).toBe(0);
  });

  it('is zero right after maintenance', () => {
    expect(roundsSinceMaintenance(500, [event('a', '2026-09-01T10:00:00.000Z', 500)])).toBe(0);
  });
});

describe('latestMaintenanceEvent (M2)', () => {
  it('is undefined with no events, or only adjustments and deleted ones', () => {
    expect(latestMaintenanceEvent([])).toBeUndefined();
    expect(
      latestMaintenanceEvent([
        event('a', '2026-09-01T10:00:00.000Z', 500, { isAdjustment: 1 }),
        event('b', '2026-09-02T10:00:00.000Z', 600, { deletedAt: '2026-09-03T10:00:00.000Z' }),
      ]),
    ).toBeUndefined();
  });

  it('picks the newest by performedAt, not by creation order', () => {
    // 'b' was created later (higher UUIDv7) but records an older cleaning.
    const recent = event('a', '2026-09-10T10:00:00.000Z', 500);
    const backdated = event('b', '2026-08-01T10:00:00.000Z', 740);
    expect(latestMaintenanceEvent([recent, backdated])).toBe(recent);
    expect(latestMaintenanceEvent([backdated, recent])).toBe(recent);
  });

  it('breaks a tie on performedAt by id, the later-created event winning', () => {
    const first = event('0190a', '2026-09-10T10:00:00.000Z', 500);
    const second = event('0190b', '2026-09-10T10:00:00.000Z', 520);
    expect(latestMaintenanceEvent([first, second])).toBe(second);
    expect(latestMaintenanceEvent([second, first])).toBe(second);
  });
});
