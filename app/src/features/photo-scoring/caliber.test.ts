import { DEFAULT_CALIBER_KEY, caliberMmFor, resolveCaliber } from './caliber';

describe('resolveCaliber', () => {
  it.each([
    ['.22 LR', '.22'],
    ['.22LR', '.22'],
    ['22 lr', '.22'],
    ['.22', '.22'],
    ['9mm', '9mm'],
    ['9 mm Luger', '9mm'],
    ['9x19', '9mm'],
    ['9×19 Parabellum', '9mm'],
    ['.32 ACP', '.32'],
    ['7.65 Browning', '.32'],
    ['.38 Special', '.38'],
    ['.45 ACP', '.45'],
  ])('matches %s to %s', (text, expected) => {
    expect(resolveCaliber(text)).toMatchObject({ key: expected, matched: true });
  });

  it('does not mistake .223 for .22 — a different bullet on a rifle', () => {
    expect(resolveCaliber('.223 Remington').matched).toBe(false);
  });

  it('does not mistake .380 for .38', () => {
    expect(resolveCaliber('.380 Auto').matched).toBe(false);
  });

  it('takes the first candidate that matches, in priority order', () => {
    expect(resolveCaliber(null, '9mm', '.22')).toMatchObject({ key: '9mm', matched: true });
    expect(resolveCaliber(undefined, '', '.45')).toMatchObject({ key: '.45', matched: true });
  });

  it('falls back to .22 and says it guessed when nothing matches', () => {
    expect(resolveCaliber('Nagant 7.62x38R')).toEqual({
      key: DEFAULT_CALIBER_KEY,
      caliberMm: 5.6,
      matched: false,
    });
    expect(resolveCaliber()).toMatchObject({ matched: false });
    expect(resolveCaliber(null, undefined, '')).toMatchObject({ matched: false });
  });

  it('resolves each preset to its shared CALIBER_MM diameter', () => {
    expect(caliberMmFor('.22')).toBe(5.6);
    expect(caliberMmFor('9mm')).toBe(9.0);
    expect(caliberMmFor('.32')).toBe(7.65);
    expect(caliberMmFor('.38')).toBe(9.07);
    expect(caliberMmFor('.45')).toBe(11.43);
  });
});
