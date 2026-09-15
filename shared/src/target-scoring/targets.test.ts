import { describe, expect, it } from 'vitest';

import { DISCIPLINES } from '../disciplines';
import {
  getTargetFace,
  ISSF_10M_AIR_PISTOL,
  ISSF_25M_PRECISION,
  ISSF_25M_RAPID_FIRE,
  requireTargetFace,
  SPSF_PISTOL_25M_PRECISION,
  SPSF_SNABBSKJUTNING_25M,
  SVSF_10M_SNABBLUFTPISTOL,
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

describe('SVSF_10M_SNABBLUFTPISTOL', () => {
  it('TG4b: 7 rings X,10..5 with the snabbluftpistol reglemente §3 diameters', () => {
    expect(SVSF_10M_SNABBLUFTPISTOL.rings.map((r) => [r.label, r.value, r.diameterMm])).toEqual([
      ['X', 10, 11],
      ['10', 10, 22],
      ['9', 9, 48.5],
      ['8', 8, 75],
      ['7', 7, 101.5],
      ['6', 6, 128],
      ['5', 5, 154.5],
    ]);
  });

  it('TG5b: referenceDiameterMm is 154.5 (black across 5-10) and not a solid disc', () => {
    expect(SVSF_10M_SNABBLUFTPISTOL.referenceDiameterMm).toBe(154.5);
    expect(SVSF_10M_SNABBLUFTPISTOL.referenceIsSolidBlack).toBe(false);
  });
});

describe('ring value / isInnerTen', () => {
  it('TG7: only ring X has isInnerTen true, on every face', () => {
    for (const face of [
      SPSF_PISTOL_25M_PRECISION,
      SPSF_SNABBSKJUTNING_25M,
      ISSF_10M_AIR_PISTOL,
      ISSF_25M_PRECISION,
      ISSF_25M_RAPID_FIRE,
      SVSF_10M_SNABBLUFTPISTOL,
    ]) {
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
    expect(getTargetFace('issf-10m-air-pistol')).toBe(ISSF_10M_AIR_PISTOL);
    expect(getTargetFace('issf-25m-precision')).toBe(ISSF_25M_PRECISION);
    expect(getTargetFace('issf-25m-rapid-fire')).toBe(ISSF_25M_RAPID_FIRE);
    expect(getTargetFace('svsf-10m-snabbluftpistol')).toBe(SVSF_10M_SNABBLUFTPISTOL);
  });

  it('TG9: unknown id returns undefined', () => {
    expect(getTargetFace('nonsense')).toBeUndefined();
  });

  it('TG10: requireTargetFace throws on an unknown id', () => {
    expect(() => requireTargetFace('nonsense')).toThrow(/Unknown target face: nonsense/);
  });

  it('TG11b: every ISSF rings discipline resolves its targetFace without throwing', () => {
    const issfRingsDisciplines = DISCIPLINES.filter(
      (d) => d.scoring === 'rings' && d.federation === 'ISSF',
    );
    expect(issfRingsDisciplines.length).toBeGreaterThan(0);
    for (const discipline of issfRingsDisciplines) {
      expect(() => requireTargetFace(discipline.targetFace)).not.toThrow();
    }
  });

  it('TG11e: every SvSF rings discipline resolves its targetFace without throwing', () => {
    const svsfRingsDisciplines = DISCIPLINES.filter(
      (d) => d.scoring === 'rings' && d.federation === 'SvSF',
    );
    expect(svsfRingsDisciplines.length).toBeGreaterThan(0);
    for (const discipline of svsfRingsDisciplines) {
      expect(() => requireTargetFace(discipline.targetFace)).not.toThrow();
    }
  });

  it('TG11c: the ISSF 25m precision face carries the same dimensions as the SPSF one', () => {
    // Same sheet of paper (GTR 6.3.4.5 / SHB F.7.1). Kept as separate entries
    // so a divergence in either rulebook is a data change; this asserts they
    // have not drifted apart by accident in the meantime.
    expect(ISSF_25M_PRECISION.rings.map((r) => [r.label, r.value, r.diameterMm])).toEqual(
      SPSF_PISTOL_25M_PRECISION.rings.map((r) => [r.label, r.value, r.diameterMm]),
    );
    expect(ISSF_25M_RAPID_FIRE.rings.map((r) => [r.label, r.value, r.diameterMm])).toEqual(
      SPSF_SNABBSKJUTNING_25M.rings.map((r) => [r.label, r.value, r.diameterMm]),
    );
  });

  it('TG11d: the air pistol face is the GTR 6.3.4.6 dimensions', () => {
    expect(ISSF_10M_AIR_PISTOL.rings.map((r) => r.diameterMm)).toEqual([
      5, 11.5, 27.5, 43.5, 59.5, 75.5, 91.5, 107.5, 123.5, 139.5, 155.5,
    ]);
    expect(ISSF_10M_AIR_PISTOL.referenceDiameterMm).toBe(59.5);
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
    for (const face of [
      SPSF_PISTOL_25M_PRECISION,
      SPSF_SNABBSKJUTNING_25M,
      ISSF_10M_AIR_PISTOL,
      ISSF_25M_PRECISION,
      ISSF_25M_RAPID_FIRE,
      SVSF_10M_SNABBLUFTPISTOL,
    ]) {
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
