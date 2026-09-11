import { expandedSightWindow, SIGHT_CLICK_LIMIT } from './sight-clicks';

describe('expandedSightWindow', () => {
  it('starts at ±10 and stays there well inside it', () => {
    expect(expandedSightWindow(10, 0)).toBe(10);
    expect(expandedSightWindow(10, 8)).toBe(10);
    expect(expandedSightWindow(10, -8)).toBe(10);
  });

  it('opens the next step one click before the end, in both directions', () => {
    // The maintainer's rule: "expand in numbers of 10 if a user comes to -9/+9".
    expect(expandedSightWindow(10, 9)).toBe(20);
    expect(expandedSightWindow(10, -9)).toBe(20);
    expect(expandedSightWindow(20, 19)).toBe(30);
    expect(expandedSightWindow(20, -19)).toBe(30);
  });

  it('never shrinks — the thumb must not jump on the way back', () => {
    expect(expandedSightWindow(30, 2)).toBe(30);
    expect(expandedSightWindow(30, null)).toBe(30);
    expect(expandedSightWindow(30, -1)).toBe(30);
  });

  it('opens far enough in one go for a value loaded from storage', () => {
    // Editing an existing setting must not need repeated expansion steps.
    expect(expandedSightWindow(10, 47)).toBe(50);
    expect(expandedSightWindow(10, -120)).toBe(130);
  });

  it('stops at the stored range rather than running past it', () => {
    expect(expandedSightWindow(10, SIGHT_CLICK_LIMIT)).toBe(SIGHT_CLICK_LIMIT);
    expect(expandedSightWindow(SIGHT_CLICK_LIMIT, 199)).toBe(SIGHT_CLICK_LIMIT);
  });

  it('treats a junk value as no value rather than exploding the window', () => {
    expect(expandedSightWindow(10, Number.NaN)).toBe(10);
    expect(expandedSightWindow(10, Number.POSITIVE_INFINITY)).toBe(10);
  });

  it('never returns less than the ±10 floor', () => {
    expect(expandedSightWindow(0, 0)).toBe(10);
    expect(expandedSightWindow(-5, null)).toBe(10);
  });
});
