import { SIGHT_CLICK_MAX, SIGHT_CLICK_MIN, sightClicksForSave } from './sight-clicks';

describe('the sight-click range', () => {
  it('is symmetric around the shooter’s zero', () => {
    expect(SIGHT_CLICK_MIN).toBe(-SIGHT_CLICK_MAX);
    expect(SIGHT_CLICK_MAX).toBeGreaterThan(0);
  });
});

describe('sightClicksForSave', () => {
  it('keeps "not recorded" as NULL', () => {
    expect(sightClicksForSave(null)).toBeNull();
  });

  it('passes signed in-range integers through unchanged', () => {
    expect(sightClicksForSave(0)).toBe(0);
    expect(sightClicksForSave(4)).toBe(4);
    expect(sightClicksForSave(-2)).toBe(-2);
    expect(sightClicksForSave(SIGHT_CLICK_MAX)).toBe(SIGHT_CLICK_MAX);
    expect(sightClicksForSave(SIGHT_CLICK_MIN)).toBe(SIGHT_CLICK_MIN);
  });

  it('never hands a fraction to an integer column', () => {
    expect(sightClicksForSave(3.5)).toBe(4);
    expect(sightClicksForSave(-3.5)).toBe(-3);
  });

  it('clamps a value outside the range onto the bound', () => {
    expect(sightClicksForSave(1000)).toBe(SIGHT_CLICK_MAX);
    expect(sightClicksForSave(-1000)).toBe(SIGHT_CLICK_MIN);
  });

  it('turns a non-finite value into NULL rather than a made-up number', () => {
    expect(sightClicksForSave(Number.NaN)).toBeNull();
    expect(sightClicksForSave(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
