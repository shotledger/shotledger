import { isSyncedSettingKey, SYNCED_SETTING_KEYS } from '@shotledger/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { settings, syncOutbox } from '../schema';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { FLAG_OVERRIDES_KEY } from './feature-flags';
import { getSetting, SETTINGS_KEYS, setSetting } from './settings';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe('getSetting', () => {
  it('returns the fallback when unset', () => {
    expect(getSetting(db, SETTINGS_KEYS.theme, 'system')).toBe('system');
  });

  it('returns a previously set value', () => {
    setSetting(db, SETTINGS_KEYS.theme, 'dark');
    expect(getSetting(db, SETTINGS_KEYS.theme, 'system')).toBe('dark');
  });
});

describe('setSetting', () => {
  it('overwrites an existing value (upsert)', () => {
    setSetting(db, SETTINGS_KEYS.language, 'sv');
    setSetting(db, SETTINGS_KEYS.language, 'en');
    expect(getSetting(db, SETTINGS_KEYS.language, 'system')).toBe('en');
  });
});

// docs/specs/sync-tags-settings-spec.md §2.3, §2.5.
describe('synced account settings', () => {
  const rowOf = (id: string) => db.select().from(settings).where(eq(settings.id, id)).get();
  const queued = () =>
    db
      .select()
      .from(syncOutbox)
      .all()
      .filter((row) => row.tableName === 'settings')
      .map((row) => row.rowId)
      .sort();

  afterEach(() => {
    vi.useRealTimers();
  });

  it('S1 setSetting stamps updated_at on every write, created_at once', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T10:00:00.000Z'));
    setSetting(db, SETTINGS_KEYS.birthYear, 1980);
    const first = rowOf('birthYear')!;
    vi.setSystemTime(new Date('2026-10-14T10:00:00.005Z'));
    setSetting(db, SETTINGS_KEYS.birthYear, 1981);
    const second = rowOf('birthYear')!;
    expect(second.value).toBe('1981');
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt > first.updatedAt).toBe(true);
  });

  it('S2 clearing a synced setting writes a live null, never a tombstone', () => {
    setSetting(db, SETTINGS_KEYS.birthYear, 1980);
    setSetting(db, SETTINGS_KEYS.birthYear, null);
    expect(rowOf('birthYear')).toEqual(expect.objectContaining({ value: 'null', deletedAt: null }));
    expect(getSetting(db, SETTINGS_KEYS.birthYear, 1900)).toBeNull();
  });

  it('S3 a tombstoned settings row reads as the fallback', () => {
    setSetting(db, SETTINGS_KEYS.birthYear, 1980);
    db.update(settings)
      .set({ deletedAt: '2026-10-06T00:00:00.000Z' })
      .where(eq(settings.id, 'birthYear'))
      .run();
    expect(getSetting(db, SETTINGS_KEYS.birthYear, 1900)).toBe(1900);
  });

  it('A3 only the allowlisted keys reach the outbox, each under its own key', () => {
    for (const key of SYNCED_SETTING_KEYS) setSetting(db, key, 'x');
    expect(queued()).toEqual([...SYNCED_SETTING_KEYS].sort());

    db.delete(syncOutbox).run();
    const local = Object.values(SETTINGS_KEYS).filter((key) => !isSyncedSettingKey(key));
    expect(local.length).toBeGreaterThan(0);
    for (const key of [...local, FLAG_OVERRIDES_KEY, 'webshooter:someClass']) {
      setSetting(db, key, 'x');
      setSetting(db, key, 'y');
    }
    expect(queued()).toEqual([]);
  });

  it('every synced key is one of the app setting keys', () => {
    const appKeys: readonly string[] = Object.values(SETTINGS_KEYS);
    for (const key of SYNCED_SETTING_KEYS) expect(appKeys).toContain(key);
  });
});
