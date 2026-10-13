import { describe, expect, it } from 'vitest';

import { isSyncedSettingKey, SYNCED_SETTING_KEYS } from '../sync/protocol';
import {
  FEATURE_IDS,
  FEATURE_SETTING_KEYS,
  readFeatureVisibility,
  type FeatureSettingKey,
} from './visibility';

describe('feature visibility (docs/specs/feature-visibility-spec.md §3.1)', () => {
  it('F1 nothing stored shows every area', () => {
    expect(readFeatureVisibility(() => undefined)).toEqual({
      licenseActivity: true,
      photos: true,
      timer: true,
      sightSettings: true,
      ammoLots: true,
    });
  });

  it('F2 only a stored false hides an area', () => {
    for (const shown of [true, null, 0, 'false', undefined, {}]) {
      expect(readFeatureVisibility(() => shown).photos).toBe(true);
    }
    const stored: Partial<Record<FeatureSettingKey, unknown>> = {
      showPhotos: false,
      showAmmoLots: false,
    };
    expect(readFeatureVisibility((key) => stored[key])).toEqual({
      licenseActivity: true,
      photos: false,
      timer: true,
      sightSettings: true,
      ammoLots: false,
    });
  });

  it('F2 each area reads its own key', () => {
    for (const id of FEATURE_IDS) {
      const visibility = readFeatureVisibility((key) =>
        key === FEATURE_SETTING_KEYS[id] ? false : undefined,
      );
      for (const other of FEATURE_IDS) expect(visibility[other]).toBe(other !== id);
    }
  });

  it('F3 the ids and keys are pinned, in order', () => {
    expect([...FEATURE_IDS]).toEqual([
      'licenseActivity',
      'photos',
      'timer',
      'sightSettings',
      'ammoLots',
    ]);
    expect(FEATURE_SETTING_KEYS).toEqual({
      licenseActivity: 'showLicenseActivity',
      photos: 'showPhotos',
      timer: 'showTimer',
      sightSettings: 'showSightSettings',
      ammoLots: 'showAmmoLots',
    });
  });

  it('S1 every switch syncs with the account settings, after the five account keys', () => {
    expect(SYNCED_SETTING_KEYS.slice(5)).toEqual(Object.values(FEATURE_SETTING_KEYS));
    for (const key of Object.values(FEATURE_SETTING_KEYS))
      expect(isSyncedSettingKey(key)).toBe(true);
  });
});
