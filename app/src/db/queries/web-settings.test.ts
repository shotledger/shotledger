// The web edits the five synced settings as whole rows
// (docs/specs/web-settings-edit-spec.md A1–A3). These apply them to the
// phone's real schema, through the phone's real apply path.
import {
  buildSettingsChanges,
  newSettingRow,
  readAccountSettings,
  resolveComplianceCase,
  SE_EXISTING_HANDGUN_VARIANT,
  type ChangeRow,
} from '@shotledger/shared';
import { getTableColumns } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { settings, syncOutbox } from '../schema';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { getSetting, setSetting, SETTINGS_KEYS } from './settings';
import { applyChangesSync, readRowSync } from './sync-store';
import { serverRefusals } from '../sync-conformance';

const NOW = '2026-10-07T10:00:00.000Z';

describe('web-built settings rows on the phone schema', () => {
  it('A1 column parity: newSettingRow has exactly the settings columns', () => {
    const columns = Object.values(getTableColumns(settings))
      .map((column) => column.name)
      .sort();
    expect(Object.keys(newSettingRow('birthYear', 1980, NOW)).sort()).toEqual(columns);
  });

  describe('web settings applied with applyChangesSync', () => {
    let db: Database;

    beforeEach(() => {
      db = createTestDb();
      setSetting(db, SETTINGS_KEYS.birthYear, 1975);
      // What the web pulled: the phone's own row.
      const pulledRow = readRowSync(db, 'settings', 'birthYear')!.payload as Record<
        string,
        unknown
      >;
      db.delete(syncOutbox).run();

      const pulled = new Map([['birthYear', pulledRow]]);
      const before = readAccountSettings(pulled);
      let n = 0;
      const result = buildSettingsChanges(
        { ...before, complianceProfile: 'none' },
        {
          birthYear: 1980,
          skillClass: '2',
          competesInWomensClasses: true,
          complianceProfile: 'se',
          complianceProfileVariant: SE_EXISTING_HANDGUN_VARIANT,
        },
        pulled,
        {
          newChangeId: () => `00000000-0000-4000-8000-${(n += 1).toString(16).padStart(12, '0')}`,
          now: () => NOW,
          currentYear: 2026,
        },
      );
      if (!result.ok) throw new Error(JSON.stringify(result.errors));
      expect(result.changes).toHaveLength(5);
      expect(serverRefusals(result.changes)).toEqual([]);
      const pulledBack: ChangeRow[] = result.changes.map((change, index) => ({
        tableName: change.tableName,
        rowId: change.rowId,
        seq: index + 1,
        payload: change.payload,
        deletedAt: change.deletedAt,
        updatedAt: change.updatedAt,
      }));
      applyChangesSync(db, pulledBack);
    });

    it('A2 web-built settings apply on the phone', () => {
      expect(getSetting<number | null>(db, SETTINGS_KEYS.birthYear, null)).toBe(1980);
      expect(getSetting<string | null>(db, SETTINGS_KEYS.skillClass, null)).toBe('2');
      expect(getSetting<boolean>(db, SETTINGS_KEYS.competesInWomensClasses, false)).toBe(true);
      expect(getSetting<string | null>(db, SETTINGS_KEYS.complianceProfile, null)).toBe('se');
      const stored = getSetting<string | null>(db, SETTINGS_KEYS.complianceProfileVariant, null);
      expect(stored).toBe(SE_EXISTING_HANDGUN_VARIANT);
      // The phone reads the web's case as the shooter's own choice, even with
      // no firearms to derive one from.
      expect(resolveComplianceCase('se', stored, [])).toEqual({
        variantId: SE_EXISTING_HANDGUN_VARIANT,
        isExplicit: true,
        reasonId: null,
      });
      // The phone's own row kept its created_at; only the value and stamp moved.
      const row = db.select().from(settings).all();
      expect(row.every((r) => r.deletedAt === null && r.updatedAt === NOW)).toBe(true);
    });

    it('A3 nothing applied is re-queued (the outbox stays empty)', () => {
      expect(db.select().from(syncOutbox).all()).toHaveLength(0);
    });
  });
});
