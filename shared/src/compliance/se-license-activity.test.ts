// The FAP 551-3 numbers driven through the (unchanged) license-activity computation, so the
// reading of "sammantaget i genomsnitt" is executable rather than only
// written down. Spec: docs/specs/compliance-fap551-spec.md, behaviors R1–R7.
import { describe, expect, it } from 'vitest';

import { computeLicenseActivityForWeaponGroup } from './license-activity';
import { getProfile } from './profile-registry';
import { SE_EXISTING_HANDGUN_VARIANT, SE_FIRST_HANDGUN_VARIANT } from './profiles/se';
import type { ComplianceSession } from './types';

const NOW = new Date('2026-09-16T12:00:00.000Z');
const GROUP = 'spsf:C';

/** `count` sessions, one a day, ending `endDaysAgo` days before NOW. */
function sessions(count: number, endDaysAgo = 0): ComplianceSession[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    startedAt: new Date(NOW.getTime() - (endDaysAgo + i) * 86_400_000).toISOString(),
    type: 'training' as const,
    weaponGroup: GROUP,
  }));
}

function statusFor(list: ComplianceSession[], variant: string) {
  return computeLicenseActivityForWeaponGroup(list, getProfile('se', variant)!, GROUP, NOW);
}

describe('the SE profile through license activity', () => {
  it('R1: 5 § — twelve activities in the window is on track', () => {
    const result = statusFor(sessions(12), SE_FIRST_HANDGUN_VARIANT);
    expect(result?.activityCount).toBe(12);
    expect(result?.requiredActivities).toBe(12);
    expect(result?.status).toBe('green');
  });

  it('R2: 5 § — eleven is short of the requirement but above half', () => {
    expect(statusFor(sessions(11), SE_FIRST_HANDGUN_VARIANT)?.status).toBe('amber');
  });

  it('R3: 5 § — five is below half of twelve', () => {
    expect(statusFor(sessions(5), SE_FIRST_HANDGUN_VARIANT)?.status).toBe('red');
  });

  it('R4: 6 § — six activities in the window is on track', () => {
    const result = statusFor(sessions(6), SE_EXISTING_HANDGUN_VARIANT);
    expect(result?.activityCount).toBe(6);
    expect(result?.requiredActivities).toBe(6);
    expect(result?.status).toBe('green');
  });

  it('R5: the same six activities are only amber under 5 § — the case decides', () => {
    expect(statusFor(sessions(6), SE_FIRST_HANDGUN_VARIANT)?.status).toBe('amber');
  });

  it('R6: twelve in one week counts — "sammantaget i genomsnitt" is a window total', () => {
    const oneWeek = Array.from({ length: 12 }, (_, i) => ({
      id: `w${i}`,
      // Twelve sessions inside a single week, five months into the window.
      startedAt: new Date(NOW.getTime() - (140 + (i % 7)) * 86_400_000).toISOString(),
      type: 'training' as const,
      weaponGroup: GROUP,
    }));
    const result = statusFor(oneWeek, SE_FIRST_HANDGUN_VARIANT);
    expect(result?.activityCount).toBe(12);
    expect(result?.status).toBe('green');
  });

  it('R7: an activity a day before the window does not count toward the twelve', () => {
    const inWindow = sessions(11);
    const windowStart = new Date(statusFor(inWindow, SE_FIRST_HANDGUN_VARIANT)!.windowStartIso);
    const justOutside: ComplianceSession = {
      id: 'old',
      startedAt: new Date(windowStart.getTime() - 86_400_000).toISOString(),
      type: 'training',
      weaponGroup: GROUP,
    };
    const result = statusFor([...inWindow, justOutside], SE_FIRST_HANDGUN_VARIANT);
    expect(result?.activityCount).toBe(11);
    expect(result?.status).toBe('amber');
  });
});
