// What the time interval counts from, and which reminders reach the platform
// wrapper (#800). The date math is shared/src/firearms/maintenance-time.ts's
// and tested there; these pin the app's wiring around it.
import { maintenanceTimeNotificationAt } from '@shotledger/shared';

import {
  firearmMaintenanceDue,
  maintenanceCountedFrom,
  maintenanceShown,
  maintenanceTimeReminders,
  refreshMaintenanceTimeReminders,
  type MaintenanceFirearm,
} from './maintenance';

const mockClient: { db: object | null } = { db: { tag: 'drizzle-db' } };
jest.mock('@/db/client', () => ({
  get db() {
    return mockClient.db;
  },
}));

const mockFirearms: MaintenanceFirearm[] = [];
jest.mock('@/db/queries/firearms', () => ({
  listActiveFirearms: () => mockFirearms,
}));

const mockLastMaintenance = new Map<string, string>();
jest.mock('@/db/queries/maintenance-events', () => ({
  lastMaintenanceAtByFirearm: () => mockLastMaintenance,
}));

const mockSettings = new Map<string, unknown>();
jest.mock('@/db/queries/settings', () => ({
  getSetting: (_db: unknown, key: string, fallback: unknown) =>
    mockSettings.has(key) ? mockSettings.get(key) : fallback,
}));

const mockReplace = jest.fn();
jest.mock('@/platform/notifications', () => ({
  replaceMaintenanceTimeReminders: (...args: unknown[]) => mockReplace(...args),
}));

function firearm(overrides: Partial<MaintenanceFirearm> = {}): MaintenanceFirearm {
  return {
    id: 'f1',
    make: 'Pardini',
    model: 'SP',
    createdAt: '2026-01-01T10:00:00.000Z',
    maintenanceIntervalRounds: null,
    maintenanceIntervalMonths: null,
    ...overrides,
  };
}

const NOW = new Date('2026-03-01T12:00:00.000Z');

beforeEach(() => {
  mockClient.db = { tag: 'drizzle-db' };
  mockFirearms.length = 0;
  mockLastMaintenance.clear();
  mockSettings.clear();
  mockReplace.mockReset();
});

describe('maintenanceCountedFrom', () => {
  it('counts from the last maintenance', () => {
    expect(maintenanceCountedFrom(firearm(), '2026-02-01T10:00:00.000Z')).toBe(
      '2026-02-01T10:00:00.000Z',
    );
  });

  it('counts from when the firearm was added until it is first maintained', () => {
    expect(maintenanceCountedFrom(firearm(), undefined)).toBe('2026-01-01T10:00:00.000Z');
  });
});

describe('firearmMaintenanceDue', () => {
  it('is due by time on a firearm that has not been shot', () => {
    const due = firearmMaintenanceDue(
      firearm({ maintenanceIntervalRounds: 500, maintenanceIntervalMonths: 1 }),
      0,
      undefined,
      NOW,
    );
    expect(due.status).toBe('red');
    expect(due.reasons).toEqual(['time']);
  });

  it('restarts the time interval at the last maintenance', () => {
    const due = firearmMaintenanceDue(
      firearm({ maintenanceIntervalMonths: 1 }),
      0,
      '2026-02-25T10:00:00.000Z',
      NOW,
    );
    expect(due.reasons).toEqual([]);
  });

  it('takes the rounds since maintenance it is given', () => {
    const due = firearmMaintenanceDue(
      firearm({ maintenanceIntervalRounds: 500 }),
      500,
      undefined,
      NOW,
    );
    expect(due.reasons).toEqual(['rounds']);
  });
});

describe('maintenanceTimeReminders', () => {
  it('schedules one per firearm whose time limit lies ahead, from its own start', () => {
    const ahead = firearm({ id: 'ahead', maintenanceIntervalMonths: 6 });
    const restarted = firearm({
      id: 'restarted',
      make: 'Walther',
      model: 'GSP',
      maintenanceIntervalMonths: 1,
    });
    const passed = firearm({ id: 'passed', maintenanceIntervalMonths: 1 });
    const none = firearm({ id: 'none', maintenanceIntervalRounds: 500 });
    const last = new Map([['restarted', '2026-02-25T10:00:00.000Z']]);

    expect(maintenanceTimeReminders([ahead, restarted, passed, none], last, NOW)).toEqual([
      {
        firearmId: 'ahead',
        firearmLabel: 'Pardini SP',
        fireAt: maintenanceTimeNotificationAt(ahead.createdAt, 6, NOW),
      },
      {
        firearmId: 'restarted',
        firearmLabel: 'Walther GSP',
        fireAt: maintenanceTimeNotificationAt('2026-02-25T10:00:00.000Z', 1, NOW),
      },
    ]);
  });
});

describe('refreshMaintenanceTimeReminders', () => {
  it('hands every live reminder to the platform, passing the permission choice on', async () => {
    mockFirearms.push(firearm({ maintenanceIntervalMonths: 120 }));
    await refreshMaintenanceTimeReminders({ request: false });
    expect(mockReplace).toHaveBeenCalledTimes(1);
    const [reminders, options] = mockReplace.mock.calls[0] as [unknown[], unknown];
    expect(reminders).toHaveLength(1);
    expect(options).toEqual({ request: false });
  });

  it('replaces with nothing when no firearm has a time interval, clearing stale ones', async () => {
    mockFirearms.push(firearm());
    await refreshMaintenanceTimeReminders({ request: true });
    expect(mockReplace).toHaveBeenCalledWith([], { request: true });
  });

  it('clears every reminder while Maintenance is hidden (#801), even with intervals set', async () => {
    mockFirearms.push(firearm({ maintenanceIntervalMonths: 120 }));
    mockSettings.set('showMaintenance', false);
    await refreshMaintenanceTimeReminders({ request: true });
    expect(mockReplace).toHaveBeenCalledWith([], { request: false });
  });

  it('does nothing without a database', async () => {
    mockClient.db = null;
    await refreshMaintenanceTimeReminders({ request: true });
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('maintenanceShown (#801)', () => {
  it('is true unless the switch is stored as false', () => {
    const database = mockClient.db as never;
    expect(maintenanceShown(database)).toBe(true);
    for (const value of [true, null, 'false', 0]) {
      mockSettings.set('showMaintenance', value);
      expect(maintenanceShown(database)).toBe(true);
    }
    mockSettings.set('showMaintenance', false);
    expect(maintenanceShown(database)).toBe(false);
  });
});
