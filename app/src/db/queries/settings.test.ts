import { beforeEach, describe, expect, it } from 'vitest';

import { createTestDb } from '../test-db';
import type { Database } from '../types';
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
