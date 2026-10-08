import { describe, expect, it } from 'vitest';

import type { ShooterProfile } from './eligibility';
import {
  disciplinesForRegulations,
  programsForDiscipline,
  shooterClassesForDiscipline,
} from './index';
import {
  defaultProgramFor,
  derivedWeaponGroup,
  eventsUnder,
  firstDisciplineFor,
  preferredEventId,
  shooterClassesInOrder,
} from './session-defaults';

const NO_PROFILE: ShooterProfile = {
  birthYear: null,
  skillClass: null,
  competesInWomensClasses: false,
};
const HER: ShooterProfile = { birthYear: 1964, skillClass: '2', competesInWomensClasses: true };

describe('defaultProgramFor', () => {
  it('H1 defaultProgramFor: competition preselects the first program, training none', () => {
    const first = programsForDiscipline('spsf-precision')[0]!.id;
    expect(defaultProgramFor('competition', 'spsf-precision')).toBe(first);
    expect(defaultProgramFor('training', 'spsf-precision')).toBeNull();
    // A discipline with no programs has nothing to preselect.
    expect(programsForDiscipline('generic-rings')).toHaveLength(0);
    expect(defaultProgramFor('competition', 'generic-rings')).toBeNull();
  });
});

describe('firstDisciplineFor', () => {
  it('H3 firstDisciplineFor: the first federation discipline, else the first at all', () => {
    // Generic disciplines sort first in every filtered list.
    expect(disciplinesForRegulations(['svsf'])[0]!.federation).toBe('generic');
    expect(firstDisciplineFor('svsf')).toBe(
      disciplinesForRegulations(['svsf']).find((d) => d.federation !== 'generic')!.id,
    );
    expect(firstDisciplineFor('spsf')).toBe('spsf-precision');
    // An unknown regelverk filters to the generic disciplines only.
    expect(firstDisciplineFor('none')).toBe(disciplinesForRegulations(['none'])[0]!.id);
  });
});

describe('derivedWeaponGroup', () => {
  const link = (groupId: string, isDefaultForGroup = 0) => ({ groupId, isDefaultForGroup });

  it('H2 derivedWeaponGroup: one group, else the one default-marked, else null', () => {
    expect(derivedWeaponGroup([])).toBeNull();
    expect(derivedWeaponGroup([link('spsf:C')])).toBe('spsf:C');
    expect(derivedWeaponGroup([link('spsf:C'), link('spsf:B', 1)])).toBe('spsf:B');
    expect(derivedWeaponGroup([link('spsf:C', 1), link('spsf:B')])).toBe('spsf:C');
    expect(derivedWeaponGroup([link('spsf:C'), link('spsf:B')])).toBeNull();
    expect(derivedWeaponGroup([link('spsf:C', 1), link('spsf:B', 1)])).toBeNull();
  });
});

describe('eventsUnder and preferredEventId', () => {
  it('H4 events are ranked for the shooter under the regelverk logged; the first is preselected', () => {
    const ids = (regulationId: string, disciplineId: string, profile: ShooterProfile) =>
      eventsUnder(regulationId, disciplineId, profile, 2026).map((event) => event.id);
    // Ranked, never filtered: the same four, eligible ones first.
    expect(ids('issf', 'issf-air-pistol', NO_PROFILE)).toEqual([
      'issf-air-pistol:men:open',
      'issf-air-pistol:men:junior',
      'issf-air-pistol:women:open',
      'issf-air-pistol:women:junior',
    ]);
    expect(ids('issf', 'issf-air-pistol', HER)).toEqual([
      'issf-air-pistol:women:open',
      'issf-air-pistol:men:open',
      'issf-air-pistol:men:junior',
      'issf-air-pistol:women:junior',
    ]);
    expect(preferredEventId('issf', 'issf-air-pistol', NO_PROFILE, 2026)).toBe(
      'issf-air-pistol:men:open',
    );
    expect(preferredEventId('issf', 'issf-air-pistol', HER, 2026)).toBe(
      'issf-air-pistol:women:open',
    );
    // SvSF adds its national classes to ISSF's own (effectiveRegulationIds).
    expect(ids('issf', 'issf-sport-pistol', NO_PROFILE)).not.toContain(
      'issf-sport-pistol:men:open',
    );
    expect(ids('svsf', 'issf-sport-pistol', NO_PROFILE)).toContain('issf-sport-pistol:men:open');
    // An SPSF discipline has no events: nothing to preselect.
    expect(ids('spsf', 'spsf-precision', HER)).toEqual([]);
    expect(preferredEventId('spsf', 'spsf-precision', HER, 2026)).toBeNull();
    // Eligibility is judged in the year given: a junior in 2026 is not one in 2060.
    const junior: ShooterProfile = {
      ...NO_PROFILE,
      birthYear: 2010,
      competesInWomensClasses: true,
    };
    expect(ids('issf', 'issf-air-pistol', junior).slice(0, 2)).toEqual([
      'issf-air-pistol:women:open',
      'issf-air-pistol:women:junior',
    ]);
    expect(
      eventsUnder('issf', 'issf-air-pistol', junior, 2060)
        .slice(0, 2)
        .map((event) => event.id),
    ).toEqual(['issf-air-pistol:women:open', 'issf-air-pistol:men:open']);
  });
});

describe('shooterClassesInOrder', () => {
  it('H5 every klass of the discipline, the shooter’s own first, narrowed by the vapengrupp', () => {
    const all = shooterClassesForDiscipline('spsf-precision');
    expect(all).toEqual(['1', '2', '3', 'Jun', 'Dam1', 'Dam2', 'Dam3', 'VetY', 'VetÄ']);
    // Nothing known: the federation's own order.
    expect(shooterClassesInOrder('spsf-precision', NO_PROFILE, 2026, null)).toEqual(all);
    // Hers first (2, Dam2, VetY), then the rest in the federation's order.
    expect(shooterClassesInOrder('spsf-precision', HER, 2026, null)).toEqual([
      '2',
      'Dam2',
      'VetY',
      '1',
      '3',
      'Jun',
      'Dam1',
      'Dam3',
      'VetÄ',
    ]);
    // Dam and Vet exist in vapengrupp C only, so under A only her skill class leads.
    expect(shooterClassesInOrder('spsf-precision', HER, 2026, 'spsf:A')).toEqual([
      '2',
      '1',
      '3',
      'Jun',
      'Dam1',
      'Dam2',
      'Dam3',
      'VetY',
      'VetÄ',
    ]);
    // A discipline without klasser offers none, whoever shoots it.
    expect(shooterClassesInOrder('issf-air-pistol', HER, 2026, null)).toEqual([]);
  });
});
