import i18n from '@/i18n';

import {
  formatGroupAndClassWords,
  formatInnerTens,
  typeShownBesideTags,
  withoutDateSuffix,
} from './session-row-format';

describe('withoutDateSuffix', () => {
  it('drops the date a generated name ends with', () => {
    expect(withoutDateSuffix('Training — Oct 14, 2026', ['Oct 14, 2026'])).toBe('Training');
    expect(withoutDateSuffix('Precision — 2026-09-23', ['23 Sep 2026', '2026-09-23'])).toBe(
      'Precision',
    );
  });

  it('keeps a name the shooter typed', () => {
    expect(withoutDateSuffix('KM Precision C', ['Oct 8, 2026'])).toBe('KM Precision C');
    expect(withoutDateSuffix('Club — evening', ['Oct 8, 2026'])).toBe('Club — evening');
    expect(withoutDateSuffix('Training — Oct 1, 2026', ['Oct 2, 2026'])).toBe(
      'Training — Oct 1, 2026',
    );
  });
});

describe('typeShownBesideTags', () => {
  it('hides the type when a tag says the same, in any UI language and case', () => {
    expect(typeShownBesideTags('training', ['Träning'])).toBe(false);
    expect(typeShownBesideTags('training', ['training'])).toBe(false);
    expect(typeShownBesideTags('competition', ['KM', 'Tävling'])).toBe(false);
  });

  it('shows it otherwise', () => {
    expect(typeShownBesideTags('training', [])).toBe(true);
    expect(typeShownBesideTags('competition', ['Träning'])).toBe(true);
  });
});

describe('formatInnerTens', () => {
  it('always prints the count, 0X included', () => {
    expect(formatInnerTens(0)).toBe('0X');
    expect(formatInnerTens(3)).toBe('3X');
  });
});

describe('formatGroupAndClassWords', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });
  const t = i18n.t.bind(i18n);

  it('spells out the weapon group and class', () => {
    expect(formatGroupAndClassWords(t, 'spsf:C', '2')).toBe('Weapon group C, class 2');
    expect(formatGroupAndClassWords(t, 'spsf:A-opt', null)).toBe('Weapon group A Opt');
    expect(formatGroupAndClassWords(t, null, 'Dam1')).toBe('Class Dam 1');
    expect(formatGroupAndClassWords(t, 'generic:airgun', null)).toBe('Air gun');
    expect(formatGroupAndClassWords(t, null, null)).toBeNull();
  });

  it('in Swedish too', async () => {
    await i18n.changeLanguage('sv');
    expect(formatGroupAndClassWords(i18n.t.bind(i18n), 'spsf:C', '2')).toBe(
      'Vapengrupp C, klass 2',
    );
    await i18n.changeLanguage('en');
  });
});
