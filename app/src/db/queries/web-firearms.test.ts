// The web's Firearms pages (#796) restate the phone's firearm queries over the
// pulled rows (web/src/firearms/model.ts). These seed the phone's real schema
// through its own query functions, hand the rows to the web as the phone
// pushes them, and check the web reads back what the phone's queries return:
// the same firearms in the same order, the same licenses, groups, calibers,
// maintenance log, sight settings and derived counters.
import { APPLY_ORDER, licenseStatus } from '@shotledger/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  firearmDetail,
  firearmsList,
  type FirearmTables,
} from '../../../../web/src/firearms/model';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { listComplianceSessions } from './compliance';
import { addFirearmCaliber, listFirearmCalibers } from './firearm-calibers';
import { addFirearmGroup, listFirearmGroups } from './firearm-groups';
import { archiveFirearm, createFirearm, listFirearms } from './firearms';
import { addLicense, latestLicense, listLicenses } from './licenses';
import { getRoundsSinceMaintenance } from './maintenance-counter';
import {
  adjustFirearmRoundCount,
  lastMaintenanceAtByFirearm,
  listMaintenanceEvents,
  logMaintenanceEvent,
} from './maintenance-events';
import { setSetting } from './settings';
import { createSession, softDeleteSession } from './sessions';
import { createSightSetting, listSightSettings, softDeleteSightSetting } from './sight-settings';
import { readRowSync, SYNC_TABLES } from './sync-store';
import { softDeleteLicense } from './licenses';

type Row = Record<string, unknown>;

/** expo-sqlite binds a boolean as 1/0; the wire carries what the phone pushes. */
const asBound = (payload: unknown): Row =>
  Object.fromEntries(
    Object.entries(payload as Row).map(([key, value]) => [
      key,
      typeof value === 'boolean' ? Number(value) : value,
    ]),
  );

/** What the web pulls: every synced row as the phone pushes it, soft-deleted ones included. */
function pulled(db: Database): FirearmTables {
  const tables = {} as Record<string, Map<string, Row>>;
  for (const tableName of APPLY_ORDER) {
    const table = new Map<string, Row>();
    for (const { id } of db.select().from(SYNC_TABLES[tableName]).all() as { id: string }[]) {
      table.set(id, asBound(readRowSync(db, tableName, id)!.payload));
    }
    tables[tableName] = table;
  }
  return tables as unknown as FirearmTables;
}

const DAY = 86_400_000;

let db: Database;
let walther: string;
let colt: string;
let airgun: string;
let sold: string;

beforeEach(() => {
  db = createTestDb();
  setSetting(db, 'complianceProfile', 'se');
  // Out of make order on purpose: both lists sort by make.
  walther = createFirearm(db, {
    make: 'Walther',
    model: 'GSP',
    caliber: '.22 LR',
    weaponType: 'pistol',
    roundCount: 1200,
    maintenanceIntervalRounds: 500,
    maintenanceIntervalMonths: 6,
  }).id;
  colt = createFirearm(db, {
    make: 'Colt',
    model: 'Python',
    weaponType: 'revolver',
    roundCount: 300,
  }).id;
  airgun = createFirearm(db, {
    make: 'Steyr',
    model: 'LP10',
    weaponType: 'airgun',
    isOwn: false,
  }).id;
  sold = createFirearm(db, { make: 'Anschütz', model: 'Old', weaponType: 'rifle' }).id;
  archiveFirearm(db, sold);

  addLicense(db, { firearmId: walther, licenseNumber: 'A-1', validUntil: '2020-01-01' });
  addLicense(db, { firearmId: walther, licenseNumber: 'A-2', validUntil: '2031-06-30' });
  const gone = addLicense(db, { firearmId: walther, licenseNumber: 'A-3', validUntil: null });
  softDeleteLicense(db, gone.id);
  addLicense(db, { firearmId: colt, validUntil: null });

  addFirearmGroup(db, { firearmId: walther, groupId: 'spsf:C', isDefaultForGroup: true });
  addFirearmGroup(db, { firearmId: walther, groupId: 'spsf:A' });
  addFirearmCaliber(db, { firearmId: colt, caliber: '.38 Special' });
  addFirearmCaliber(db, { firearmId: colt, caliber: '.357 Magnum' });

  logMaintenanceEvent(db, {
    firearmId: walther,
    performedAt: '2026-03-01T10:00:00.000Z',
    kind: 'cleaning',
  });
  logMaintenanceEvent(db, {
    firearmId: walther,
    performedAt: '2026-01-01T10:00:00.000Z',
    kind: 'service',
    notes: 'springs',
  });
  adjustFirearmRoundCount(db, walther, 50, 'counted wrong');

  createSightSetting(db, { firearmId: walther, label: '25 m', elevationClicks: 0 });
  createSightSetting(db, {
    firearmId: walther,
    label: '50 m',
    elevationClicks: 6,
    windageClicks: -2,
    makeActive: true,
  });
  const deleted = createSightSetting(db, { firearmId: walther, label: 'gone' });
  softDeleteSightSetting(db, deleted);

  for (let i = 0; i < 4; i++) {
    createSession(db, {
      name: `S${i}`,
      type: 'training',
      disciplineId: 'spsf-precision',
      weaponGroup: 'spsf:C',
      firearmId: i < 2 ? walther : null,
      startedAt: new Date(Date.now() - (i + 1) * 20 * DAY).toISOString(),
    });
  }
  const deletedSession = createSession(db, {
    name: 'gone',
    type: 'training',
    disciplineId: 'spsf-precision',
    startedAt: new Date(Date.now() - DAY).toISOString(),
  });
  softDeleteSession(db, deletedSession.id);
});

describe('the web firearm pages read what the phone queries return', () => {
  it('lists every live firearm by make, the archived one flagged (listFirearms)', () => {
    const rows = firearmsList(pulled(db));
    expect(rows.map((row) => row.id)).toEqual(listFirearms(db).map((f) => f.id));
    expect(rows.map((row) => row.isArchived)).toEqual(
      listFirearms(db).map((f) => f.archivedAt != null),
    );
  });

  it('takes the license status from the latest live license (latestLicense)', () => {
    const rows = firearmsList(pulled(db));
    for (const firearm of listFirearms(db)) {
      expect(rows.find((row) => row.id === firearm.id)?.licenseStatus).toBe(
        licenseStatus(latestLicense(db, firearm.id)?.validUntil),
      );
    }
  });

  it('reads each child table in the phone order, deleted rows left out', () => {
    const tables = pulled(db);
    for (const firearm of listFirearms(db)) {
      const detail = firearmDetail(tables, firearm.id)!;
      expect(detail.licenses.map((l) => [l.id, l.licenseNumber, l.validUntil])).toEqual(
        listLicenses(db, firearm.id).map((l) => [l.id, l.licenseNumber, l.validUntil]),
      );
      expect(detail.groups.map((g) => [g.id, g.groupId, g.isDefaultForGroup])).toEqual(
        listFirearmGroups(db, firearm.id).map((g) => [g.id, g.groupId, g.isDefaultForGroup]),
      );
      expect(detail.calibers.map((c) => [c.id, c.caliber])).toEqual(
        listFirearmCalibers(db, firearm.id).map((c) => [c.id, c.caliber]),
      );
      expect(detail.maintenanceEvents.map((e) => [e.id, e.kind, e.notes, e.isAdjustment])).toEqual(
        listMaintenanceEvents(db, firearm.id).map((e) => [e.id, e.kind, e.notes, e.isAdjustment]),
      );
      expect(
        detail.sightSettings.map((s) => [s.id, s.label, s.elevationClicks, s.isActive]),
      ).toEqual(
        listSightSettings(db, firearm.id).map((s) => [
          s.id,
          s.label,
          s.elevationClicks,
          s.isActive,
        ]),
      );
    }
  });

  it('derives the same maintenance counters (getRoundsSinceMaintenance, lastMaintenanceAtByFirearm)', () => {
    const tables = pulled(db);
    const lastAt = lastMaintenanceAtByFirearm(db);
    for (const firearm of listFirearms(db)) {
      const detail = firearmDetail(tables, firearm.id)!;
      expect(detail.firearm.roundCount).toBe(firearm.roundCount);
      expect(detail.roundsSinceMaintenance).toBe(getRoundsSinceMaintenance(db, firearm));
      expect(detail.lastMaintenanceAt).toBe(lastAt.get(firearm.id));
    }
    // The adjustment moved the count, not the reference event.
    expect(firearmDetail(tables, walther)!.roundsSinceMaintenance).toBe(50);
  });

  it('carries the firearm fields the phone shows', () => {
    const detail = firearmDetail(pulled(db), airgun)!;
    expect(detail.firearm).toMatchObject({
      make: 'Steyr',
      model: 'LP10',
      weaponType: 'airgun',
      isOwn: false,
      caliber: null,
      archivedAt: null,
    });
    expect(firearmDetail(pulled(db), sold)!.firearm.archivedAt).not.toBeNull();
  });

  it('measures license activity on the live sessions (listComplianceSessions)', () => {
    const detail = firearmDetail(pulled(db), walther)!;
    const total = detail.licenseActivities.reduce(
      (sum, activity) => Math.max(sum, activity.activityCount),
      0,
    );
    expect(detail.profile?.id).toBe('se');
    expect(total).toBe(listComplianceSessions(db).length);
  });
});
