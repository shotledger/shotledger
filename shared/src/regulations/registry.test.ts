import { describe, expect, it } from 'vitest';

import {
  ISSF_REGULATION_ID,
  REGULATIONS,
  SPSF_REGULATION_ID,
  SVSF_REGULATION_ID,
  activeFederations,
  defaultEnabledRegulationIds,
  effectiveRegulations,
  findRegulation,
  regulationEnabledSettingKey,
} from './registry';

describe('regulation registry', () => {
  it('gives every regulation a unique id', () => {
    // Ids key settings rows, so a collision would silently enable one
    // regulation by toggling another.
    const ids = REGULATIONS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('starts a fresh install on SPSF alone', () => {
    expect(defaultEnabledRegulationIds()).toEqual([SPSF_REGULATION_ID]);
  });

  it('namespaces each regulation setting', () => {
    expect(regulationEnabledSettingKey('spsf')).toBe('regulation.spsf.enabled');
    expect(regulationEnabledSettingKey('svsf')).not.toBe(regulationEnabledSettingKey('spsf'));
  });
});

describe('effectiveRegulations', () => {
  it('pulls in what a regulation adopts', () => {
    // The point of the whole model: SvSF competes under ISSF's rulebook, so
    // enabling SvSF must give you ISSF's disciplines without SvSF redefining
    // a single one of them.
    const ids = effectiveRegulations([SVSF_REGULATION_ID]).map((r) => r.id);

    expect(ids).toContain(SVSF_REGULATION_ID);
    expect(ids).toContain(ISSF_REGULATION_ID);
  });

  it('does not pull in the adopter when only the adopted is enabled', () => {
    // Adoption runs one way. Shooting under ISSF internationally says nothing
    // about being an SvSF member.
    const ids = effectiveRegulations([ISSF_REGULATION_ID]).map((r) => r.id);

    expect(ids).toEqual([ISSF_REGULATION_ID]);
  });

  it('returns registry order, not the order they were switched on', () => {
    const ids = effectiveRegulations([SVSF_REGULATION_ID, SPSF_REGULATION_ID]).map((r) => r.id);

    expect(ids).toEqual([SPSF_REGULATION_ID, ISSF_REGULATION_ID, SVSF_REGULATION_ID]);
  });

  it('never lists a regulation twice when two routes reach it', () => {
    const ids = effectiveRegulations([ISSF_REGULATION_ID, SVSF_REGULATION_ID]).map((r) => r.id);

    expect(ids.filter((id) => id === ISSF_REGULATION_ID)).toHaveLength(1);
  });

  it('ignores an id it does not know', () => {
    // A settings row from a build that had a regulation this one does not.
    expect(effectiveRegulations(['nra', SPSF_REGULATION_ID]).map((r) => r.id)).toEqual([
      SPSF_REGULATION_ID,
    ]);
  });

  it('returns nothing for nothing', () => {
    expect(effectiveRegulations([])).toEqual([]);
  });
});

describe('activeFederations', () => {
  it('always includes generic, so an unaffiliated shooter can still log', () => {
    expect(activeFederations([])).toEqual(['generic']);
  });

  it('includes SPSF when SPSF is on', () => {
    expect(activeFederations([SPSF_REGULATION_ID])).toContain('SPSF');
  });

  it('includes ISSF when only SvSF is on', () => {
    // SvSF's disciplines ARE ISSF's; without this, enabling SvSF would show
    // an empty discipline list.
    expect(activeFederations([SVSF_REGULATION_ID])).toContain('ISSF');
  });

  it('does not include SPSF for a shooter who only shoots SvSF', () => {
    expect(activeFederations([SVSF_REGULATION_ID])).not.toContain('SPSF');
  });
});

describe('findRegulation', () => {
  it('returns null rather than throwing on an unknown id', () => {
    expect(findRegulation('nra')).toBeNull();
  });

  it('records that SvSF adopts ISSF and ISSF adopts nothing', () => {
    expect(findRegulation(SVSF_REGULATION_ID)!.adopts).toEqual([ISSF_REGULATION_ID]);
    expect(findRegulation(ISSF_REGULATION_ID)!.adopts).toEqual([]);
  });
});
