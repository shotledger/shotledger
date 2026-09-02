import { describe, expect, it } from 'vitest';

import { DISCIPLINES } from '../disciplines';
import {
  getTargetFace,
  requireTargetFace,
  SPSF_PISTOL_25M_PRECISION,
  SPSF_SNABBSKJUTNING_25M,
} from './targets';

describe('SPSF_PISTOL_25M_PRECISION', () => {
  it('TG1: 11 rings X,10..1 with the SHB F.7.1 diameters', () => {
    expect(SPSF_PISTOL_25M_PRECISION.rings.map((r) => [r.label, r.diameterMm])).toEqual([
      ['X', 25],
      ['10', 50],
      ['9', 100],
      ['8', 150],
      ['7', 200],
      ['6', 250],
      ['5', 300],
      ['4', 350],
      ['3', 400],
      ['2', 450],
      ['1', 500],
    ]);
  });

  it('TG2: referenceDiameterMm is 200 (black covers rings 7-10)', () => {
    expect(SPSF_PISTOL_25M_PRECISION.referenceDiameterMm).toBe(200);
  });

  it('TG3: referenceIsSolidBlack is true', () => {
    expect(SPSF_PISTOL_25M_PRECISION.referenceIsSolidBlack).toBe(true);
  });
});

describe('SPSF_SNABBSKJUTNING_25M', () => {
  it('TG4: 7 rings X,10..5 with the SHB J.7.1 diameters', () => {
    expect(SPSF_SNABBSKJUTNING_25M.rings.map((r) => [r.label, r.diameterMm])).toEqual([
      ['X', 50],
      ['10', 100],
      ['9', 180],
      ['8', 260],
      ['7', 340],
      ['6', 420],
      ['5', 500],
    ]);
  });

  it('TG5: referenceDiameterMm is 500 (black across 5-10)', () => {
    expect(SPSF_SNABBSKJUTNING_25M.referenceDiameterMm).toBe(500);
  });

  it('TG6: referenceIsSolidBlack is false', () => {
    expect(SPSF_SNABBSKJUTNING_25M.referenceIsSolidBlack).toBe(false);
  });
});

describe('ring value / isInnerTen', () => {
  it('TG7: only ring X has isInnerTen true, on both faces', () => {
    for (const face of [SPSF_PISTOL_25M_PRECISION, SPSF_SNABBSKJUTNING_25M]) {
      for (const r of face.rings) {
        expect(r.isInnerTen).toBe(r.label === 'X');
      }
    }
  });
});

describe('getTargetFace / requireTargetFace', () => {
  it('TG8: resolves both known ids', () => {
    expect(getTargetFace('spsf-pistol-25m-precision')).toBe(SPSF_PISTOL_25M_PRECISION);
    expect(getTargetFace('spsf-snabbskjutning-25m')).toBe(SPSF_SNABBSKJUTNING_25M);
  });

  it('TG9: unknown id returns undefined', () => {
    expect(getTargetFace('nonsense')).toBeUndefined();
  });

  it('TG10: requireTargetFace throws on an unknown id', () => {
    expect(() => requireTargetFace('nonsense')).toThrow(/Unknown target face: nonsense/);
  });

  it('TG11: every SPSF rings discipline resolves its targetFace without throwing', () => {
    // generic-rings (federation "generic") deliberately has no fixed SHB
    // dimensions and is out of scope here — see spec §3.
    const spsfRingsDisciplines = DISCIPLINES.filter(
      (d) => d.scoring === 'rings' && d.federation === 'SPSF',
    );
    expect(spsfRingsDisciplines.length).toBeGreaterThan(0);
    for (const discipline of spsfRingsDisciplines) {
      expect(() => requireTargetFace(discipline.targetFace)).not.toThrow();
    }
  });

  it('TG12: rings are strictly ascending with no duplicate labels or diameters', () => {
    for (const face of [SPSF_PISTOL_25M_PRECISION, SPSF_SNABBSKJUTNING_25M]) {
      const diameters = face.rings.map((r) => r.diameterMm);
      const labels = face.rings.map((r) => r.label);
      expect(new Set(labels).size).toBe(labels.length);
      expect(new Set(diameters).size).toBe(diameters.length);
      for (let i = 1; i < diameters.length; i += 1) {
        expect(diameters[i]).toBeGreaterThan(diameters[i - 1] as number);
      }
    }
  });
});
