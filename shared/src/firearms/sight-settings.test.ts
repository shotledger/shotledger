import { describe, expect, it } from 'vitest';

import { resolveActiveSightSetting, sightTurnsBetween } from './sight-settings';

const setting = (id: string, isActive: number, updatedAt: string) => ({ id, isActive, updatedAt });

describe('resolveActiveSightSetting', () => {
  it('is null when nothing is marked active', () => {
    expect(resolveActiveSightSetting([])).toBeNull();
    expect(resolveActiveSightSetting([setting('a', 0, '2026-01-01T00:00:00Z')])).toBeNull();
  });

  it('returns the single active setting', () => {
    const active = setting('b', 1, '2026-01-01T00:00:00Z');
    expect(resolveActiveSightSetting([setting('a', 0, '2026-02-01T00:00:00Z'), active])).toBe(
      active,
    );
  });

  it('prefers the most recently updated when sync left two active', () => {
    const older = setting('a', 1, '2026-01-01T00:00:00Z');
    const newer = setting('b', 1, '2026-03-01T00:00:00Z');
    expect(resolveActiveSightSetting([older, newer])).toBe(newer);
    expect(resolveActiveSightSetting([newer, older])).toBe(newer);
  });

  it('breaks an updatedAt tie on id so every device agrees', () => {
    const lower = setting('a', 1, '2026-01-01T00:00:00Z');
    const higher = setting('b', 1, '2026-01-01T00:00:00Z');
    expect(resolveActiveSightSetting([lower, higher])).toBe(higher);
    expect(resolveActiveSightSetting([higher, lower])).toBe(higher);
  });
});

describe('sightTurnsBetween', () => {
  it('is nothing to turn between identical settings', () => {
    const s = { elevationClicks: 5, windageClicks: -2 };
    expect(sightTurnsBetween(s, s)).toEqual({ elevation: null, windage: null });
  });

  it('reports up and right for a positive difference', () => {
    expect(
      sightTurnsBetween(
        { elevationClicks: -5, windageClicks: 0 },
        { elevationClicks: 5, windageClicks: 3 },
      ),
    ).toEqual({
      elevation: { direction: 'up', clicks: 10 },
      windage: { direction: 'right', clicks: 3 },
    });
  });

  it('reports down and left for a negative difference', () => {
    expect(
      sightTurnsBetween(
        { elevationClicks: 5, windageClicks: 3 },
        { elevationClicks: -5, windageClicks: 0 },
      ),
    ).toEqual({
      elevation: { direction: 'down', clicks: 10 },
      windage: { direction: 'left', clicks: 3 },
    });
  });

  it('leaves an axis null when either side never recorded it', () => {
    expect(
      sightTurnsBetween(
        { elevationClicks: null, windageClicks: 2 },
        { elevationClicks: 4, windageClicks: null },
      ),
    ).toEqual({ elevation: null, windage: null });
  });

  it('has nothing to turn when there is no setting to come from', () => {
    const to = { elevationClicks: 4, windageClicks: 4 };
    expect(sightTurnsBetween(null, to)).toEqual({ elevation: null, windage: null });
    expect(sightTurnsBetween(undefined, to)).toEqual({ elevation: null, windage: null });
    expect(sightTurnsBetween(to, null)).toEqual({ elevation: null, windage: null });
  });
});
