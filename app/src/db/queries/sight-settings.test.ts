import { beforeEach, describe, expect, it } from 'vitest';

import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { createFirearm } from './firearms';
import {
  createSightSetting,
  listSightSettings,
  setActiveSightSetting,
  softDeleteSightSetting,
  updateSightSetting,
} from './sight-settings';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

function firearm(make = 'A') {
  return createFirearm(db, { make, model: '1' }).id;
}

describe('createSightSetting', () => {
  it('creates a setting with the given fields', () => {
    const firearmId = firearm();
    const id = createSightSetting(db, {
      firearmId,
      label: 'Mitt-mitt',
      elevationClicks: 4,
      windageClicks: -2,
      notes: 'Baseline',
    });

    const [row] = listSightSettings(db, firearmId);
    expect(row?.id).toBe(id);
    expect(row?.label).toBe('Mitt-mitt');
    expect(row?.elevationClicks).toBe(4);
    expect(row?.windageClicks).toBe(-2);
    expect(row?.notes).toBe('Baseline');
    expect(row?.isActive).toBe(0);
  });

  it('stores an unrecorded axis as NULL, not as zero', () => {
    const firearmId = firearm();
    createSightSetting(db, { firearmId, label: 'Untracked', elevationClicks: null });

    const [row] = listSightSettings(db, firearmId);
    expect(row?.elevationClicks).toBeNull();
    expect(row?.windageClicks).toBeNull();
  });

  it('keeps a recorded zero distinct from an unrecorded axis', () => {
    const firearmId = firearm();
    createSightSetting(db, { firearmId, label: 'Zero', elevationClicks: 0, windageClicks: null });

    const [row] = listSightSettings(db, firearmId);
    expect(row?.elevationClicks).toBe(0);
    expect(row?.windageClicks).toBeNull();
  });

  it('makeActive clears a previously active setting on the same firearm', () => {
    const firearmId = firearm();
    const first = createSightSetting(db, { firearmId, label: 'Mitt-mitt', makeActive: true });
    const second = createSightSetting(db, { firearmId, label: 'Boll', makeActive: true });

    const rows = listSightSettings(db, firearmId);
    expect(rows.find((r) => r.id === first)?.isActive).toBe(0);
    expect(rows.find((r) => r.id === second)?.isActive).toBe(1);
  });
});

describe('listSightSettings', () => {
  it('excludes soft-deleted rows and rows for a different firearm', () => {
    const firearmId = firearm();
    const otherFirearmId = firearm('B');
    const keep = createSightSetting(db, { firearmId, label: 'Mitt-mitt' });
    const deleted = createSightSetting(db, { firearmId, label: 'Boll' });
    createSightSetting(db, { firearmId: otherFirearmId, label: 'Other firearm setting' });
    softDeleteSightSetting(db, deleted);

    const rows = listSightSettings(db, firearmId);
    expect(rows.map((r) => r.id)).toEqual([keep]);
  });

  it('lists in stable creation order and keeps it after an edit', () => {
    const firearmId = firearm();
    const first = createSightSetting(db, { firearmId, label: 'First' });
    const second = createSightSetting(db, { firearmId, label: 'Second' });
    const third = createSightSetting(db, { firearmId, label: 'Third' });

    updateSightSetting(db, second, { elevationClicks: 3 });

    expect(listSightSettings(db, firearmId).map((r) => r.id)).toEqual([first, second, third]);
  });
});

describe('updateSightSetting', () => {
  it('bumps updatedAt and leaves other fields unchanged', () => {
    const firearmId = firearm();
    const id = createSightSetting(db, {
      firearmId,
      label: 'Mitt-mitt',
      elevationClicks: 4,
      windageClicks: -2,
    });
    const before = listSightSettings(db, firearmId)[0]!;

    updateSightSetting(db, id, { elevationClicks: 6 });

    const after = listSightSettings(db, firearmId)[0]!;
    expect(after.elevationClicks).toBe(6);
    expect(after.windageClicks).toBe(-2);
    expect(after.label).toBe('Mitt-mitt');
    expect(after.updatedAt >= before.updatedAt).toBe(true);
  });

  it('clears a recorded axis back to NULL', () => {
    const firearmId = firearm();
    const id = createSightSetting(db, {
      firearmId,
      label: 'Mitt-mitt',
      elevationClicks: 4,
      windageClicks: -2,
    });

    updateSightSetting(db, id, { elevationClicks: null });

    const after = listSightSettings(db, firearmId)[0]!;
    expect(after.elevationClicks).toBeNull();
    expect(after.windageClicks).toBe(-2);
  });
});

describe('setActiveSightSetting', () => {
  it('is exclusive per firearm and leaves a different firearm untouched', () => {
    const firearmId = firearm();
    const otherFirearmId = firearm('B');
    const a = createSightSetting(db, { firearmId, label: 'A', makeActive: true });
    const b = createSightSetting(db, { firearmId, label: 'B' });
    const otherActive = createSightSetting(db, {
      firearmId: otherFirearmId,
      label: 'Other active',
      makeActive: true,
    });

    setActiveSightSetting(db, firearmId, b);

    const rows = listSightSettings(db, firearmId);
    expect(rows.find((r) => r.id === a)?.isActive).toBe(0);
    expect(rows.find((r) => r.id === b)?.isActive).toBe(1);
    expect(listSightSettings(db, otherFirearmId).find((r) => r.id === otherActive)?.isActive).toBe(
      1,
    );
  });

  it('clears every setting for the firearm when id is null', () => {
    const firearmId = firearm();
    const a = createSightSetting(db, { firearmId, label: 'A', makeActive: true });
    const b = createSightSetting(db, { firearmId, label: 'B' });

    setActiveSightSetting(db, firearmId, null);

    const rows = listSightSettings(db, firearmId);
    expect(rows.find((r) => r.id === a)?.isActive).toBe(0);
    expect(rows.find((r) => r.id === b)?.isActive).toBe(0);
  });
});

describe('softDeleteSightSetting', () => {
  it('hides the row from subsequent listing', () => {
    const firearmId = firearm();
    const id = createSightSetting(db, { firearmId, label: 'Mitt-mitt' });

    softDeleteSightSetting(db, id);

    expect(listSightSettings(db, firearmId)).toEqual([]);
  });
});
