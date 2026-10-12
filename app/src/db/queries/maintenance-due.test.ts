// The maintenance-due notification fires once when a local write takes a
// firearm's rounds-since-maintenance across its interval (#729).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { createFirearm } from './firearms';
import { setMaintenanceDueListener, type MaintenanceDueFirearm } from './maintenance-due';
import { adjustFirearmRoundCount, logMaintenanceEvent } from './maintenance-events';
import { saveSeriesShots, setSessionExtraRounds } from './round-count';
import { addSeries } from './series';
import { createSession } from './sessions';

let db: Database;
let listener: ReturnType<typeof vi.fn<(firearm: MaintenanceDueFirearm) => void>>;
let removeListener: () => void;

beforeEach(() => {
  db = createTestDb();
  listener = vi.fn<(firearm: MaintenanceDueFirearm) => void>();
  removeListener = setMaintenanceDueListener(listener);
});

afterEach(() => {
  removeListener();
});

/** A firearm 3 rounds short of a 100-round interval, and a session on it. */
function nearlyDue() {
  const firearm = createFirearm(db, {
    make: 'Test',
    model: 'Pistol',
    maintenanceIntervalRounds: 100,
    roundsSinceMaintenance: 97,
  });
  const session = createSession(db, {
    name: 'Test',
    type: 'training',
    disciplineId: 'spsf-precision',
    firearmId: firearm.id,
    startedAt: '2026-10-12T10:00:00.000Z',
  });
  return { firearm, session };
}

const fiveShots = [90, 90, 90, 90, 90].map((valueTenths) => ({ valueTenths }));

describe('maintenance-due crossing', () => {
  it('fires once when a saved series crosses the interval', () => {
    const { firearm, session } = nearlyDue();
    const row = addSeries(db, { sessionId: session.id, position: 1 });
    saveSeriesShots(db, row.id, fiveShots);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ id: firearm.id, make: 'Test', model: 'Pistol' });
  });

  it('fires once when a rounds-only session crosses the interval', () => {
    const { firearm, session } = nearlyDue();
    setSessionExtraRounds(db, session.id, 20);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: firearm.id }));
  });

  it('fires once when a manual adjustment crosses the interval', () => {
    const { firearm } = nearlyDue();
    adjustFirearmRoundCount(db, firearm.id, 3, 'range rental');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: firearm.id }));
  });

  it('fires nothing when a write stays below the interval', () => {
    const { firearm, session } = nearlyDue();
    setSessionExtraRounds(db, session.id, 2);
    adjustFirearmRoundCount(db, firearm.id, -10, 'miscount');

    expect(listener).not.toHaveBeenCalled();
  });

  it('fires nothing without an interval', () => {
    const firearm = createFirearm(db, {
      make: 'Test',
      model: 'Pistol',
      roundsSinceMaintenance: 500,
    });
    adjustFirearmRoundCount(db, firearm.id, 1000, 'range rental');

    expect(listener).not.toHaveBeenCalled();
  });

  it('does not fire again for later rounds until maintenance resets the counter', () => {
    const { firearm, session } = nearlyDue();
    const first = addSeries(db, { sessionId: session.id, position: 1 });
    saveSeriesShots(db, first.id, fiveShots);
    const second = addSeries(db, { sessionId: session.id, position: 2 });
    saveSeriesShots(db, second.id, fiveShots);
    setSessionExtraRounds(db, session.id, 50);
    adjustFirearmRoundCount(db, firearm.id, 10, 'range rental');
    expect(listener).toHaveBeenCalledTimes(1);

    logMaintenanceEvent(db, {
      firearmId: firearm.id,
      performedAt: '2026-10-12T12:00:00.000Z',
      kind: 'cleaning',
    });
    expect(listener).toHaveBeenCalledTimes(1);

    adjustFirearmRoundCount(db, firearm.id, 100, 'range rental');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('fires nothing once the listener is removed', () => {
    removeListener();
    const { firearm } = nearlyDue();
    adjustFirearmRoundCount(db, firearm.id, 3, 'range rental');

    expect(listener).not.toHaveBeenCalled();
  });
});
