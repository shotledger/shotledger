import { formatAmmoRecipe } from './format-ammo-recipe';

const gr = (value: number) => `${value} gr`;

describe('formatAmmoRecipe', () => {
  it('joins projectile and powder without a slash', () => {
    expect(
      formatAmmoRecipe(
        {
          bulletMake: 'H&N',
          bulletModel: 'Wadcutter',
          bulletWeightGr: 125,
          powder: 'Vihtavuori N310',
          powderChargeGr: 3.1,
        },
        gr,
      ),
    ).toBe('H&N Wadcutter 125 gr · Vihtavuori N310 3.1 gr');
  });

  it('returns null for a factory lot with no projectile or powder data', () => {
    expect(formatAmmoRecipe({ bulletMake: null, powder: null }, gr)).toBeNull();
    expect(formatAmmoRecipe({}, gr)).toBeNull();
  });

  it('renders a factory lot that only records a bullet weight', () => {
    expect(formatAmmoRecipe({ bulletWeightGr: 115 }, gr)).toBe('115 gr');
  });

  it('drops the separator when only the powder is known', () => {
    expect(formatAmmoRecipe({ powder: 'Vihtavuori N320', powderChargeGr: 4.1 }, gr)).toBe(
      'Vihtavuori N320 4.1 gr',
    );
  });

  it('drops the separator when only the projectile is known', () => {
    expect(formatAmmoRecipe({ bulletMake: 'H&N', bulletWeightGr: 125 }, gr)).toBe('H&N 125 gr');
  });

  it('treats blank strings as absent', () => {
    expect(formatAmmoRecipe({ bulletMake: '  ', bulletModel: '', powder: '   ' }, gr)).toBeNull();
    expect(formatAmmoRecipe({ bulletMake: ' H&N ', powder: '  ' }, gr)).toBe('H&N');
  });

  it('keeps a zero charge rather than dropping it as falsy', () => {
    expect(formatAmmoRecipe({ powder: 'Vihtavuori N310', powderChargeGr: 0 }, gr)).toBe(
      'Vihtavuori N310 0 gr',
    );
  });
});
