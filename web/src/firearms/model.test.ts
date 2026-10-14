// The Firearms pages' model (#796) on hand-made wire rows. Parity with the
// phone's queries on its real schema is app/src/db/queries/web-firearms.test.ts;
// these pin the composition `loadFirearmsList` and `loadFirearmDetail` add.
import {
  computeFirearmCriteria,
  computeFirearmLicenseActivity,
  getProfile,
} from '@shotledger/shared/src/compliance';
import { SE_EXISTING_HANDGUN_VARIANT } from '@shotledger/shared/src/compliance/profiles/se';
import { describe, expect, it } from 'vitest';

import { complianceSessions } from '../license-activity';
import { firearmDetail, firearmsList, lastMaintenanceAt, type FirearmTables } from './model';

const NOW = new Date('2026-10-14T12:00:00.000Z');
const STAMP = '2026-01-01T00:00:00.000Z';
const base = { created_at: STAMP, updated_at: STAMP, deleted_at: null as string | null };
type Row = Record<string, unknown>;
const byId = (rows: Row[]) => new Map(rows.map((row) => [row.id as string, row]));
const setting = (id: string, value: string) => ({ id, value, ...base });

const pistol = {
  id: 'f1',
  ...base,
  make: 'Walther',
  model: 'GSP',
  caliber: '.22 LR',
  weapon_type: 'pistol',
  is_own: 1,
  round_count: 900,
  maintenance_interval_rounds: 500,
  maintenance_interval_months: null,
  archived_at: null,
};

function tables({
  firearms = [pistol] as Row[],
  licenses = [{ id: 'l1', ...base, firearm_id: 'f1', valid_until: '2027-06-30' }] as Row[],
  settings = [
    setting('complianceProfile', '"se"'),
    setting('complianceProfileVariant', `"${SE_EXISTING_HANDGUN_VARIANT}"`),
  ],
  sessionCount = 6,
  events = [] as Row[],
} = {}): FirearmTables {
  return {
    firearms: byId(firearms),
    licenses: byId(licenses),
    firearm_groups: byId([{ id: 'g1', ...base, firearm_id: 'f1', group_id: 'spsf:C' }]),
    firearm_calibers: byId([]),
    maintenance_events: byId(events),
    sight_settings: byId([]),
    settings: byId(settings),
    sessions: byId(
      Array.from({ length: sessionCount }, (_, i) => ({
        id: `s${i}`,
        ...base,
        started_at: new Date(NOW.getTime() - (i + 1) * 7 * 86_400_000).toISOString(),
        type: 'training',
        weapon_group: 'spsf:C',
        firearm_id: i % 2 === 0 ? 'f1' : null,
      })),
    ),
  };
}

describe('firearmsList (loadFirearmsList)', () => {
  it('carries the worst license-activity status of the firearm', () => {
    const rows = tables();
    const profile = getProfile('se', SE_EXISTING_HANDGUN_VARIANT)!;
    const statuses = computeFirearmLicenseActivity(
      complianceSessions(rows),
      profile,
      ['spsf:C'],
      NOW,
    );
    const [row] = firearmsList(rows, NOW);
    expect(statuses.length).toBeGreaterThan(0);
    expect(row?.licenseActivityStatus).toBe(statuses[0]?.status);
    expect(firearmsList(tables({ sessionCount: 0 }), NOW)[0]?.licenseActivityStatus).toBe('red');
  });

  it('has no license-activity status without a profile, or for an archived firearm', () => {
    expect(firearmsList(tables({ settings: [] }), NOW)[0]?.licenseActivityStatus).toBeNull();
    const archived = { ...pistol, archived_at: '2026-10-01T00:00:00.000Z' };
    const [row] = firearmsList(tables({ firearms: [archived] }), NOW);
    expect(row).toMatchObject({ isArchived: true, licenseActivityStatus: null });
  });

  it('orders by make and leaves deleted firearms out', () => {
    const rows = firearmsList(
      tables({
        firearms: [
          { ...pistol, id: 'z', make: 'Walther' },
          { ...pistol, id: 'a', make: 'Anschütz' },
          { ...pistol, id: 'c', make: 'Colt' },
          { ...pistol, id: 'x', make: 'Benelli', deleted_at: STAMP },
        ],
      }),
      NOW,
    );
    expect(rows.map((row) => row.id)).toEqual(['a', 'c', 'z']);
  });

  it('reads license, maintenance and completeness as the phone does', () => {
    const [row] = firearmsList(tables(), NOW);
    expect(row).toMatchObject({
      make: 'Walther',
      model: 'GSP',
      weaponType: 'pistol',
      licenseStatus: 'valid',
      maintenanceStatus: 'red',
      isIncomplete: false,
    });
    const bare = { id: 'f2', ...base, make: 'Imported', model: 'Gun' };
    const [imported] = firearmsList(tables({ firearms: [bare], licenses: [] }), NOW);
    // No is_own on the row reads as the column default: own.
    expect(imported).toMatchObject({ licenseStatus: 'none', isIncomplete: true });
    const borrowed = { ...pistol, is_own: 0 };
    expect(firearmsList(tables({ firearms: [borrowed], licenses: [] }), NOW)[0]?.isIncomplete).toBe(
      false,
    );
  });
});

describe('firearmDetail (loadFirearmDetail)', () => {
  it('is null for a firearm that is not there or deleted', () => {
    expect(firearmDetail(tables(), 'nope', NOW)).toBeNull();
    expect(
      firearmDetail(tables({ firearms: [{ ...pistol, deleted_at: STAMP }] }), 'f1', NOW),
    ).toBeNull();
  });

  it('counts the criteria for the own handgun with a time-limited permit, with a lapse each', () => {
    const rows = tables();
    const detail = firearmDetail(rows, 'f1', NOW)!;
    const expected = computeFirearmCriteria(
      complianceSessions(rows),
      getProfile('se', SE_EXISTING_HANDGUN_VARIANT)!,
      { id: 'f1', weaponType: 'pistol', isOwn: true, hasTimeLimitedPermit: true },
      NOW,
    );
    expect(detail.firearmCriteria).toEqual(expected);
    expect(detail.firearmCriteria.length).toBeGreaterThan(0);
    expect(detail.firearmCriteriaLapses).toHaveLength(detail.firearmCriteria.length);
    expect(detail.licenseActivityLapses).toHaveLength(detail.licenseActivities.length);
  });

  it('a permit "tills vidare" turns the renewal criterion off', () => {
    const open = tables({ licenses: [{ id: 'l1', ...base, firearm_id: 'f1', valid_until: null }] });
    const ids = firearmDetail(open, 'f1', NOW)!.firearmCriteria.map((c) => c.criterionId);
    const limited = firearmDetail(tables(), 'f1', NOW)!.firearmCriteria.map((c) => c.criterionId);
    expect(limited.length).toBeGreaterThan(ids.length);
  });

  it('measures nothing without a profile', () => {
    const detail = firearmDetail(tables({ settings: [] }), 'f1', NOW)!;
    expect(detail.profile).toBeNull();
    expect(detail.licenseActivities).toEqual([]);
    expect(detail.firearmCriteria).toEqual([]);
  });

  it('counts the time interval from the last maintenance, never from an adjustment', () => {
    const events = [
      {
        id: 'e1',
        ...base,
        firearm_id: 'f1',
        performed_at: '2026-02-01T10:00:00.000Z',
        kind: 'cleaning',
        round_count_at: 700,
        notes: null,
        is_adjustment: 0,
      },
      {
        id: 'e2',
        ...base,
        firearm_id: 'f1',
        performed_at: '2026-09-01T10:00:00.000Z',
        kind: '',
        round_count_at: 900,
        notes: '+200: recount',
        is_adjustment: 1,
      },
    ];
    const rows = tables({ events, firearms: [{ ...pistol, maintenance_interval_months: 6 }] });
    expect(lastMaintenanceAt(rows, 'f1')).toBe('2026-02-01T10:00:00.000Z');
    const detail = firearmDetail(rows, 'f1', NOW)!;
    expect(detail.roundsSinceMaintenance).toBe(200);
    expect(detail.maintenanceDue.reasons).toEqual(['time']);
    expect(detail.maintenanceEvents.map((e) => e.id)).toEqual(['e2', 'e1']);
  });
});
