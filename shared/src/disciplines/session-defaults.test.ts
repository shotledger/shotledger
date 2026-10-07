import { describe, expect, it } from 'vitest';

import { disciplinesForRegulations, programsForDiscipline } from './index';
import { defaultProgramFor, derivedWeaponGroup, firstDisciplineFor } from './session-defaults';

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
