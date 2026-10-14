// The optional areas a shooter can hide (#801,
// docs/specs/feature-visibility-spec.md §2.1). One synced boolean setting per
// area; only a stored `false` hides one, so an unset or unreadable value shows
// it. Hiding removes ways in, never data.

export const FEATURE_IDS = [
  'licenseActivity',
  'photos',
  'timer',
  'sightSettings',
  'ammoLots',
  'maintenance',
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

/** The `settings` row id each area is stored under. */
export const FEATURE_SETTING_KEYS = {
  licenseActivity: 'showLicenseActivity',
  photos: 'showPhotos',
  timer: 'showTimer',
  sightSettings: 'showSightSettings',
  ammoLots: 'showAmmoLots',
  maintenance: 'showMaintenance',
} as const satisfies Record<FeatureId, string>;

export type FeatureSettingKey = (typeof FEATURE_SETTING_KEYS)[FeatureId];

export type FeatureVisibility = Record<FeatureId, boolean>;

/** `get` returns a key's decoded JSON value, or undefined when it has none. */
export function readFeatureVisibility(get: (key: FeatureSettingKey) => unknown): FeatureVisibility {
  const shown = (id: FeatureId) => get(FEATURE_SETTING_KEYS[id]) !== false;
  return {
    licenseActivity: shown('licenseActivity'),
    photos: shown('photos'),
    timer: shown('timer'),
    sightSettings: shown('sightSettings'),
    ammoLots: shown('ammoLots'),
    maintenance: shown('maintenance'),
  };
}
