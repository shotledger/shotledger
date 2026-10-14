import { beforeEach, describe, expect, it } from 'vitest';

import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { createFirearm, getFirearm } from './firearms';
import {
  adjustFirearmRoundCount,
  lastMaintenanceAtByFirearm,
  listMaintenanceEvents,
  logMaintenanceEvent,
  softDeleteMaintenanceEvent,
} from './maintenance-events';
import { getRoundsSinceMaintenance } from './maintenance-counter';
import { applyRoundCountDelta } from './round-count';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe('logMaintenanceEvent', () => {
  it('captures the firearm round count, which rounds since maintenance counts from', () => {
    const firearm = createFirearm(db, { make: 'A', model: '1', maintenanceIntervalRounds: 500 });
    applyRoundCountDelta(db, firearm.id, 620);

    const event = logMaintenanceEvent(db, {
      firearmId: firearm.id,
      performedAt: '2026-01-01T00:00:00.000Z',
      kind: 'rengoring',
      notes: 'full clean',
    });

    expect(event.roundCountAt).toBe(620);
    expect(event.kind).toBe('rengoring');
    expect(event.isAdjustment).toBe(0);
    const updated = getFirearm(db, firearm.id);
    expect(updated?.roundCount).toBe(620); // lifetime count untouched
    expect(getRoundsSinceMaintenance(db, updated!)).toBe(0); // "since" resets
  });

  it('M3 writes only the event, never the firearm row', () => {
    const firearm = createFirearm(db, { make: 'A', model: '1' });
    applyRoundCountDelta(db, firearm.id, 40);
    const before = getFirearm(db, firearm.id);
    logMaintenanceEvent(db, {
      firearmId: firearm.id,
      performedAt: '2026-01-01T00:00:00.000Z',
      kind: 'rengoring',
    });
    expect(getFirearm(db, firearm.id)).toEqual(before);
  });

  it('M3 deleting the newest event restores the figure the previous one gives', () => {
    const firearm = createFirearm(db, { make: 'A', model: '1' });
    applyRoundCountDelta(db, firearm.id, 100);
    logMaintenanceEvent(db, {
      firearmId: firearm.id,
      performedAt: '2026-01-01T00:00:00.000Z',
      kind: 'rengoring',
    });
    applyRoundCountDelta(db, firearm.id, 60);
    const newest = logMaintenanceEvent(db, {
      firearmId: firearm.id,
      performedAt: '2026-02-01T00:00:00.000Z',
      kind: 'service',
    });
    applyRoundCountDelta(db, firearm.id, 15);
    expect(getRoundsSinceMaintenance(db, getFirearm(db, firearm.id)!)).toBe(15);

    softDeleteMaintenanceEvent(db, newest.id);
    expect(getRoundsSinceMaintenance(db, getFirearm(db, firearm.id)!)).toBe(75);
  });

  it('M2 a cleaning logged with an earlier date than the newest does not reset the figure', () => {
    const firearm = createFirearm(db, { make: 'A', model: '1' });
    applyRoundCountDelta(db, firearm.id, 100);
    logMaintenanceEvent(db, {
      firearmId: firearm.id,
      performedAt: '2026-02-01T00:00:00.000Z',
      kind: 'rengoring',
    });
    applyRoundCountDelta(db, firearm.id, 30);
    logMaintenanceEvent(db, {
      firearmId: firearm.id,
      performedAt: '2026-01-01T00:00:00.000Z',
      kind: 'service',
    });
    expect(getRoundsSinceMaintenance(db, getFirearm(db, firearm.id)!)).toBe(30);
  });
});

describe('listMaintenanceEvents', () => {
  it('lists latest-first and excludes tombstoned events', () => {
    const firearm = createFirearm(db, { make: 'A', model: '1' });
    const e1 = logMaintenanceEvent(db, {
      firearmId: firearm.id,
      performedAt: '2026-01-01T00:00:00.000Z',
      kind: 'rengoring',
    });
    const e2 = logMaintenanceEvent(db, {
      firearmId: firearm.id,
      performedAt: '2026-02-01T00:00:00.000Z',
      kind: 'service',
    });
    softDeleteMaintenanceEvent(db, e1.id);

    const list = listMaintenanceEvents(db, firearm.id);
    expect(list.map((e) => e.id)).toEqual([e2.id]);
  });
});

describe('lastMaintenanceAtByFirearm (#800)', () => {
  it('is the latest live maintenance per firearm, ignoring adjustments and tombstones', () => {
    const a = createFirearm(db, { make: 'A', model: '1' });
    const b = createFirearm(db, { make: 'B', model: '2' });
    const never = createFirearm(db, { make: 'C', model: '3' });
    // Logged out of order: a backdated entry is not the latest.
    logMaintenanceEvent(db, {
      firearmId: a.id,
      performedAt: '2026-03-01T10:00:00.000Z',
      kind: 'cleaning',
    });
    logMaintenanceEvent(db, {
      firearmId: a.id,
      performedAt: '2026-01-01T10:00:00.000Z',
      kind: 'cleaning',
    });
    const latestB = logMaintenanceEvent(db, {
      firearmId: b.id,
      performedAt: '2026-05-01T10:00:00.000Z',
      kind: 'service',
    });
    logMaintenanceEvent(db, {
      firearmId: b.id,
      performedAt: '2026-02-01T10:00:00.000Z',
      kind: 'cleaning',
    });
    softDeleteMaintenanceEvent(db, latestB.id);
    // An adjustment is dated now, later than every entry above.
    adjustFirearmRoundCount(db, a.id, 10, 'club rounds');
    adjustFirearmRoundCount(db, never.id, 10, 'club rounds');

    expect(Object.fromEntries(lastMaintenanceAtByFirearm(db))).toEqual({
      [a.id]: '2026-03-01T10:00:00.000Z',
      [b.id]: '2026-02-01T10:00:00.000Z',
    });
  });
});

describe('adjustFirearmRoundCount', () => {
  it('A2 applies a manual delta and logs an adjustment event with the reason', () => {
    const firearm = createFirearm(db, { make: 'A', model: '1' });
    applyRoundCountDelta(db, firearm.id, 100);

    const updated = adjustFirearmRoundCount(db, firearm.id, 50, 'Counted a box bought used');
    expect(updated?.roundCount).toBe(150);
    expect(getRoundsSinceMaintenance(db, updated!)).toBe(150);

    const events = listMaintenanceEvents(db, firearm.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.isAdjustment).toBe(1);
    expect(events[0]?.kind).toBe('');
    expect(events[0]?.notes).toBe('+50 · Counted a box bought used');
    expect(events[0]?.roundCountAt).toBe(150);
  });

  it('never lets the counters go below zero', () => {
    const firearm = createFirearm(db, { make: 'A', model: '1' });
    const updated = adjustFirearmRoundCount(db, firearm.id, -50, 'correction');
    expect(updated?.roundCount).toBe(0);
    expect(getRoundsSinceMaintenance(db, updated!)).toBe(0);
  });

  it('M4 an adjustment after maintenance moves the figure by the same amount', () => {
    const firearm = createFirearm(db, { make: 'A', model: '1' });
    applyRoundCountDelta(db, firearm.id, 100);
    logMaintenanceEvent(db, {
      firearmId: firearm.id,
      performedAt: '2026-01-01T00:00:00.000Z',
      kind: 'rengoring',
    });
    applyRoundCountDelta(db, firearm.id, 20);
    const updated = adjustFirearmRoundCount(db, firearm.id, 10, 'Club rental rounds');
    expect(getRoundsSinceMaintenance(db, updated!)).toBe(30);
  });

  it('records the amount the counter actually moved, after clamping', () => {
    const firearm = createFirearm(db, { make: 'A', model: '1' });
    applyRoundCountDelta(db, firearm.id, 20);
    adjustFirearmRoundCount(db, firearm.id, -50, 'correction');
    expect(listMaintenanceEvents(db, firearm.id)[0]?.notes).toBe('\u221220 · correction');
  });

  it('returns undefined for an unknown firearm', () => {
    expect(adjustFirearmRoundCount(db, 'missing', 10, 'reason')).toBeUndefined();
  });
});
