import { beforeEach, describe, expect, it } from 'vitest';

import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { createFirearm, getFirearm } from './firearms';
import {
  adjustFirearmRoundCount,
  listMaintenanceEvents,
  logMaintenanceEvent,
  softDeleteMaintenanceEvent,
} from './maintenance-events';
import { applyRoundCountDelta } from './round-count';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe('logMaintenanceEvent', () => {
  it('captures the firearm round count and resets rounds_since_maintenance', () => {
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
    const updated = getFirearm(db, firearm.id);
    expect(updated?.roundCount).toBe(620); // lifetime count untouched
    expect(updated?.roundsSinceMaintenance).toBe(0); // "since" resets
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

describe('adjustFirearmRoundCount', () => {
  it('applies a manual delta and logs an adjustment event with the reason', () => {
    const firearm = createFirearm(db, { make: 'A', model: '1' });
    applyRoundCountDelta(db, firearm.id, 100);

    const updated = adjustFirearmRoundCount(db, firearm.id, 50, 'Counted a box bought used');
    expect(updated?.roundCount).toBe(150);
    expect(updated?.roundsSinceMaintenance).toBe(150);

    const events = listMaintenanceEvents(db, firearm.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('adjustment');
    expect(events[0]?.notes).toBe('Counted a box bought used');
    expect(events[0]?.roundCountAt).toBe(150);
  });

  it('never lets the counters go below zero', () => {
    const firearm = createFirearm(db, { make: 'A', model: '1' });
    const updated = adjustFirearmRoundCount(db, firearm.id, -50, 'correction');
    expect(updated?.roundCount).toBe(0);
    expect(updated?.roundsSinceMaintenance).toBe(0);
  });

  it('returns undefined for an unknown firearm', () => {
    expect(adjustFirearmRoundCount(db, 'missing', 10, 'reason')).toBeUndefined();
  });
});
