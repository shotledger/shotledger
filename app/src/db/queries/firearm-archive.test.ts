// Archiving a firearm (#799): it leaves the active lists and the pickers, and
// nothing it owns changes. One file for the query layer's whole contract, so
// the decisions in docs/specs/firearm-archive-spec.md each have a test.
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { firearms, syncOutbox } from '../schema';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { listComplianceSessions } from './compliance';
import {
  addFirearmGroup,
  getDefaultFirearmForGroup,
  listAllFirearmGroupIds,
} from './firearm-groups';
import {
  archiveFirearm,
  createFirearm,
  getFirearm,
  listActiveFirearms,
  listFirearmOwnershipFacts,
  listFirearms,
  restoreFirearm,
  softDeleteFirearm,
} from './firearms';
import { addLicense, listLicenses } from './licenses';
import { listMaintenanceEvents, logMaintenanceEvent } from './maintenance-events';
import { reportMaintenanceCounterMove, setMaintenanceDueListener } from './maintenance-due';
import { createSession, listSessions } from './sessions';
import { createSyncStore, readRowSync } from './sync-store';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

function pistol(make = 'Pardini', isOwn = true) {
  return createFirearm(db, { make, model: 'SP', weaponType: 'pistol', isOwn });
}

describe('archiveFirearm / restoreFirearm', () => {
  it('A1: a new firearm is active', () => {
    expect(pistol().archivedAt).toBeNull();
  });

  it('A2: archiving stamps archived_at and restoring clears it', () => {
    const f = pistol();
    const archived = archiveFirearm(db, f.id);
    expect(archived?.archivedAt).toEqual(expect.any(String));
    expect(archived?.updatedAt).toBe(archived?.archivedAt);
    expect(restoreFirearm(db, f.id)?.archivedAt).toBeNull();
  });

  it('A3: archiving twice keeps the first date', () => {
    vi.useFakeTimers();
    try {
      const f = pistol();
      vi.setSystemTime(new Date('2026-10-01T10:00:00.000Z'));
      archiveFirearm(db, f.id);
      vi.setSystemTime(new Date('2026-10-05T10:00:00.000Z'));
      expect(archiveFirearm(db, f.id)?.archivedAt).toBe('2026-10-01T10:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('A4: restoring an active firearm changes nothing, not even updated_at', () => {
    const f = pistol();
    expect(restoreFirearm(db, f.id)?.updatedAt).toBe(f.updatedAt);
  });

  it('A5: neither touches a deleted firearm', () => {
    const f = pistol();
    softDeleteFirearm(db, f.id);
    expect(archiveFirearm(db, f.id)).toBeUndefined();
    const row = db.select().from(firearms).where(eq(firearms.id, f.id)).get();
    expect(row?.archivedAt).toBeNull();
  });
});

describe('lists', () => {
  it('L1: listActiveFirearms leaves an archived firearm out; listFirearms keeps it', () => {
    const kept = pistol('A');
    const sold = pistol('B');
    archiveFirearm(db, sold.id);
    expect(listActiveFirearms(db).map((f) => f.id)).toEqual([kept.id]);
    expect(listFirearms(db).map((f) => f.id)).toEqual([kept.id, sold.id]);
  });

  it('L2: an archived firearm still opens by id', () => {
    const f = pistol();
    archiveFirearm(db, f.id);
    expect(getFirearm(db, f.id)?.make).toBe('Pardini');
  });
});

describe('history is kept', () => {
  it('H1: its sessions, licenses and maintenance are untouched', () => {
    const f = pistol();
    const session = createSession(db, {
      name: 's',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: '2026-09-01T10:00:00.000Z',
      firearmId: f.id,
    });
    addLicense(db, { firearmId: f.id, validUntil: '2030-01-01' });
    logMaintenanceEvent(db, {
      firearmId: f.id,
      kind: 'cleaning',
      performedAt: '2026-09-02T10:00:00.000Z',
    });
    archiveFirearm(db, f.id);

    expect(listSessions(db).map((s) => s.id)).toContain(session.id);
    expect(listLicenses(db, f.id)).toHaveLength(1);
    expect(listMaintenanceEvents(db, f.id)).toHaveLength(1);
  });

  it("C1: its sessions still count towards the licence activity (FAP 551-3 counts the shooter's shooting)", () => {
    const f = pistol();
    createSession(db, {
      name: 's',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: '2026-09-01T10:00:00.000Z',
      firearmId: f.id,
    });
    archiveFirearm(db, f.id);
    expect(listComplianceSessions(db).map((s) => s.firearmId)).toEqual([f.id]);
  });
});

describe('compliance inputs that describe the firearms the shooter has', () => {
  it('C2: ownership facts leave an archived firearm out', () => {
    const own = pistol('A', true);
    pistol('B', false);
    archiveFirearm(db, own.id);
    expect(listFirearmOwnershipFacts(db)).toEqual([{ weaponType: 'pistol', isOwn: false }]);
    restoreFirearm(db, own.id);
    expect(listFirearmOwnershipFacts(db)).toHaveLength(2);
  });

  it("C3: an archived firearm's weapon groups drop out of the overall licence activity", () => {
    const a = pistol('A');
    const b = pistol('B');
    addFirearmGroup(db, { firearmId: a.id, groupId: 'spsf:A' });
    addFirearmGroup(db, { firearmId: b.id, groupId: 'spsf:C' });
    archiveFirearm(db, b.id);
    expect(listAllFirearmGroupIds(db)).toEqual(['spsf:A']);
  });

  it("C4: a deleted firearm's weapon groups drop out too", () => {
    const a = pistol('A');
    addFirearmGroup(db, { firearmId: a.id, groupId: 'spsf:A' });
    softDeleteFirearm(db, a.id);
    expect(listAllFirearmGroupIds(db)).toEqual([]);
  });
});

describe('getDefaultFirearmForGroup', () => {
  it('P1: never proposes an archived firearm for a new session', () => {
    const f = pistol();
    addFirearmGroup(db, { firearmId: f.id, groupId: 'spsf:C', isDefaultForGroup: true });
    expect(getDefaultFirearmForGroup(db, 'spsf:C')?.firearmId).toBe(f.id);
    archiveFirearm(db, f.id);
    expect(getDefaultFirearmForGroup(db, 'spsf:C')).toBeUndefined();
    restoreFirearm(db, f.id);
    expect(getDefaultFirearmForGroup(db, 'spsf:C')?.firearmId).toBe(f.id);
  });
});

describe('maintenance-due notification', () => {
  it('N1: stays quiet for an archived firearm', () => {
    const heard: string[] = [];
    const off = setMaintenanceDueListener((f) => heard.push(f.id));
    try {
      const base = { id: 'f', make: 'A', model: '1', maintenanceIntervalRounds: 100 };
      reportMaintenanceCounterMove({ ...base, archivedAt: '2026-10-01T00:00:00.000Z' }, 90, 110);
      expect(heard).toEqual([]);
      reportMaintenanceCounterMove({ ...base, archivedAt: null }, 90, 110);
      expect(heard).toEqual(['f']);
    } finally {
      off();
    }
  });
});

describe('sync', () => {
  it('S1: archiving queues the row, and the payload carries archived_at', () => {
    const f = pistol();
    db.delete(syncOutbox).run();
    archiveFirearm(db, f.id);
    expect(
      db
        .select()
        .from(syncOutbox)
        .all()
        .map((r) => r.rowId),
    ).toEqual([f.id]);
    const payload = readRowSync(db, 'firearms', f.id)!.payload as Record<string, unknown>;
    expect(payload.archived_at).toEqual(expect.any(String));
  });

  it('S2: a pulled archived_at applies, and a pulled null restores', async () => {
    const store = createSyncStore(db);
    const payload = {
      id: 'remote-1',
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
      deleted_at: null,
      make: 'Walther',
      model: 'GSP',
      round_count: 0,
      rounds_since_maintenance: 0,
      archived_at: '2026-10-01T00:00:00.000Z',
    };
    const change = (p: Record<string, unknown>) => ({
      seq: 1,
      arrival: 1,
      tableName: 'firearms' as const,
      rowId: 'remote-1',
      payload: p,
      deletedAt: null,
      updatedAt: String(p.updated_at),
    });
    await store.applyChanges([change(payload)]);
    expect(getFirearm(db, 'remote-1')?.archivedAt).toBe('2026-10-01T00:00:00.000Z');
    await store.applyChanges([
      change({ ...payload, archived_at: null, updated_at: '2026-10-02T00:00:00.000Z' }),
    ]);
    expect(getFirearm(db, 'remote-1')?.archivedAt).toBeNull();
  });
});
