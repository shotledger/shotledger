// The Shot Distribution header interpolates its shot count rather than
// concatenating one on, so it needs i18next's plural resolution to actually
// work for both bundles — a missing `_one` silently renders the raw key.
import i18next from 'i18next';

import en from './en.json';
import sv from './sv.json';

const t = i18next.createInstance();

beforeAll(async () => {
  await t.init({
    resources: { en: { translation: en }, sv: { translation: sv } },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
});

describe('stats.distributionTitleWithCount', () => {
  it('English picks the singular for one shot and the plural otherwise', () => {
    expect(t.t('stats.distributionTitleWithCount', { count: 1, lng: 'en' })).toBe(
      'Shot Distribution (1 shot)',
    );
    expect(t.t('stats.distributionTitleWithCount', { count: 30, lng: 'en' })).toBe(
      'Shot Distribution (30 shots)',
    );
    expect(t.t('stats.distributionTitleWithCount', { count: 0, lng: 'en' })).toBe(
      'Shot Distribution (0 shots)',
    );
  });

  it('Swedish resolves both categories — "skott" is invariant', () => {
    expect(t.t('stats.distributionTitleWithCount', { count: 1, lng: 'sv' })).toBe(
      'Fördelning (1 skott)',
    );
    expect(t.t('stats.distributionTitleWithCount', { count: 30, lng: 'sv' })).toBe(
      'Fördelning (30 skott)',
    );
  });
});

describe('shotDiagnostics.lastMark', () => {
  const values = { peak: '-12.0', excess: '38.0' };

  it('English says "sample" for a one-sample event', () => {
    expect(t.t('shotDiagnostics.lastMark', { ...values, count: 1, lng: 'en' })).toContain(
      'spanning 1 sample.',
    );
    expect(t.t('shotDiagnostics.lastMark', { ...values, count: 4, lng: 'en' })).toContain(
      'spanning 4 samples.',
    );
  });

  it('Swedish resolves both categories — "sampel" is invariant', () => {
    expect(t.t('shotDiagnostics.lastMark', { ...values, count: 1, lng: 'sv' })).toContain(
      'över 1 sampel.',
    );
    expect(t.t('shotDiagnostics.lastMark', { ...values, count: 4, lng: 'sv' })).toContain(
      'över 4 sampel.',
    );
  });
});
