// Executable spec for docs/specs/m3-scoring-spec.md §6 (discipline/program
// data layer). Scenario ids (G1…G18) map 1:1 to the spec table.
import { describe, expect, it } from 'vitest';

import precisionDisciplineJson from './definitions/spsf-precision.json';
import milsnabbProgramJson from './programs/spsf-milsnabb.json';
import {
  buildProgramSkeleton,
  decimalAllowed,
  defaultSessionName,
  DISCIPLINES,
  disciplineSchema,
  findWeaponGroup,
  formatGroupAndClass,
  formatShooterClass,
  getDiscipline,
  getProgram,
  PROGRAMS,
  programSchema,
  programsForDiscipline,
  requireDiscipline,
  scoringModeFor,
  shooterClassesForDiscipline,
  weaponGroupCode,
  weaponGroupsForDiscipline,
} from './index';

describe('data validation (spec G1-G4)', () => {
  it('G1: every shipped discipline parses against disciplineSchema', () => {
    expect(DISCIPLINES.length).toBeGreaterThan(0);
    for (const discipline of DISCIPLINES) {
      expect(() => disciplineSchema.parse(discipline)).not.toThrow();
    }
  });

  it('G2: every shipped program parses against programSchema', () => {
    expect(PROGRAMS.length).toBeGreaterThan(0);
    for (const program of PROGRAMS) {
      expect(() => programSchema.parse(program)).not.toThrow();
    }
    // every program points at a discipline that exists
    for (const program of PROGRAMS) {
      expect(getDiscipline(program.disciplineId)).toBeDefined();
    }
  });

  it('G3: malformed data is rejected (negative control for G1/G2)', () => {
    expect(() =>
      disciplineSchema.parse({ ...precisionDisciplineJson, federation: 'NRA' }),
    ).toThrow();
    expect(() =>
      disciplineSchema.parse({ ...precisionDisciplineJson, defaultSeriesLength: 0 }),
    ).toThrow();
    expect(() =>
      disciplineSchema.parse({ ...precisionDisciplineJson, name: { sv: 'Precision' } }),
    ).toThrow();
    expect(() => disciplineSchema.parse({ ...precisionDisciplineJson, surprise: true })).toThrow();
    expect(() => programSchema.parse({ ...milsnabbProgramJson, scoring: 'hits' })).toThrow();
    expect(() =>
      programSchema.parse({ ...milsnabbProgramJson, structure: { sighterSeries: 1, groups: [] } }),
    ).toThrow();
  });

  it('G4: v1 ships exactly the SPSF-only discipline set of §6.2', () => {
    expect(DISCIPLINES.map((d) => d.id).sort()).toEqual([
      'generic-rings',
      'spsf-milsnabb',
      'spsf-precision',
    ]);
  });

  it('lookups find and reject by id', () => {
    expect(getDiscipline('spsf-precision')?.name.sv).toBe('Precision');
    expect(getDiscipline('issf-air-pistol')).toBeUndefined();
    expect(requireDiscipline('spsf-precision').id).toBe('spsf-precision');
    expect(() => requireDiscipline('nope')).toThrow(/unknown discipline/i);
    expect(getProgram('spsf-milsnabb')?.supportsFinal).toBe(false);
    expect(getProgram('nope')).toBeUndefined();
  });
});

describe('programs (spec G5-G9)', () => {
  it('G5: programs are filtered by discipline; free training is the absence of one', () => {
    expect(programsForDiscipline('spsf-precision').map((p) => p.id)).toEqual(['spsf-precision']);
    expect(programsForDiscipline('spsf-milsnabb').map((p) => p.id)).toEqual(['spsf-milsnabb']);
    expect(programsForDiscipline('generic-rings')).toEqual([]);
  });

  it('G6: precision is freeform', () => {
    const program = getProgram('spsf-precision');
    expect(program).toMatchObject({
      shotsPerSeries: 5,
      scoring: 'integer',
      supportsFinal: true,
    });
    expect(program?.structure).toBeUndefined();
  });

  it('G7: milsnabb is fixed-format per SHB J.6.1', () => {
    const program = getProgram('spsf-milsnabb');
    expect(program).toMatchObject({ shotsPerSeries: 5, scoring: 'integer', supportsFinal: false });
    expect(program?.structure).toEqual({
      sighterSeries: 1,
      groups: [
        { seriesCount: 4, timeLimitSeconds: 10 },
        { seriesCount: 4, timeLimitSeconds: 8 },
        { seriesCount: 4, timeLimitSeconds: 6 },
      ],
    });
  });

  it('G8: the milsnabb skeleton is 1 sighter + 12 scored series with time limits', () => {
    const program = getProgram('spsf-milsnabb');
    if (!program) throw new Error('milsnabb program missing');
    const skeleton = buildProgramSkeleton(program);

    expect(skeleton).toHaveLength(13);
    expect(skeleton[0]).toEqual({
      position: 1,
      isSighter: true,
      isFinal: false,
      shots: 5,
      // provserie: 5 shots at 10 s (SHB J.6.6.2) — omgång 1's limit
      timeLimitSeconds: 10,
    });
    expect(skeleton.map((s) => s.position)).toEqual([...Array(13)].map((_, i) => i + 1));
    expect(skeleton.slice(1).map((s) => s.timeLimitSeconds)).toEqual([
      10, 10, 10, 10, 8, 8, 8, 8, 6, 6, 6, 6,
    ]);
    expect(skeleton.slice(1).every((s) => !s.isSighter && !s.isFinal && s.shots === 5)).toBe(true);
    // 60 scored shots, max 600 (SHB J.6.1)
    expect(skeleton.slice(1).reduce((n, s) => n + s.shots, 0)).toBe(60);
  });

  it('G9: a freeform program pre-creates nothing', () => {
    const program = getProgram('spsf-precision');
    if (!program) throw new Error('precision program missing');
    expect(buildProgramSkeleton(program)).toEqual([]);
  });
});

describe('weapon groups and classes (spec G10-G14)', () => {
  it('G10: precision has no R (SHB F.4.4)', () => {
    const ids = weaponGroupsForDiscipline('spsf-precision').map((g) => g.id);
    expect(ids).toEqual([
      'spsf:A',
      'spsf:AM',
      'spsf:AP',
      'spsf:AG',
      'spsf:A-opt',
      'spsf:B',
      'spsf:C',
    ]);
    expect(ids).not.toContain('spsf:R');
  });

  it('G11: milsnabb adds R', () => {
    expect(weaponGroupsForDiscipline('spsf-milsnabb').map((g) => g.id)).toEqual([
      'spsf:A',
      'spsf:B',
      'spsf:C',
      'spsf:R',
    ]);
  });

  it('generic ships the airgun group only', () => {
    expect(weaponGroupsForDiscipline('generic-rings').map((g) => g.id)).toEqual(['generic:airgun']);
  });

  it('an unknown discipline has no groups to offer', () => {
    expect(() => weaponGroupsForDiscipline('nope')).toThrow(/unknown discipline/i);
  });

  it('G12: SPSF shooter classes per SHB F.2.1', () => {
    expect(shooterClassesForDiscipline('spsf-precision')).toEqual([
      '1',
      '1u',
      '1b',
      '1s',
      '2',
      '3',
      'Jun',
      'Dam1',
      'Dam2',
      'Dam3',
      'VetY',
      'VetÄ',
    ]);
    expect(shooterClassesForDiscipline('spsf-milsnabb')).toEqual(
      shooterClassesForDiscipline('spsf-precision'),
    );
    expect(shooterClassesForDiscipline('generic-rings')).toEqual([]);
  });

  it('G13: group and class display combined, never stored as one string', () => {
    expect(formatGroupAndClass('spsf:C', '2')).toBe('C 2');
    expect(formatGroupAndClass('spsf:A-opt', 'VetY')).toBe('A-opt Vet Y');
    expect(formatGroupAndClass('spsf:C', null)).toBe('C');
    expect(formatGroupAndClass(null, '2')).toBe('2');
    expect(formatGroupAndClass(null, null)).toBe('');
  });

  it('G14: class codes format for display', () => {
    expect(formatShooterClass('Dam1')).toBe('Dam 1');
    expect(formatShooterClass('Dam3')).toBe('Dam 3');
    expect(formatShooterClass('VetY')).toBe('Vet Y');
    expect(formatShooterClass('VetÄ')).toBe('Vet Ä');
    expect(formatShooterClass('2')).toBe('2');
    expect(formatShooterClass('1u')).toBe('1u');
    expect(formatShooterClass(null)).toBe('');
  });

  it('weapon group ids resolve to codes', () => {
    expect(weaponGroupCode('spsf:A-opt')).toBe('A-opt');
    expect(weaponGroupCode('generic:airgun')).toBe('airgun');
    expect(weaponGroupCode('unknown:zz')).toBe('');
    expect(weaponGroupCode(null)).toBe('');
    expect(findWeaponGroup('spsf:R')).toEqual({ id: 'spsf:R', code: 'R', federation: 'SPSF' });
    expect(findWeaponGroup('spsf:M9')?.code).toBe('M9');
    expect(findWeaponGroup(null)).toBeNull();
  });
});

describe('session naming (spec G15-G17)', () => {
  it('G15: competition names combine level, program and vapengrupp', () => {
    expect(
      defaultSessionName({
        kind: 'competition',
        levelLabel: 'KM',
        programLabel: 'Precision',
        weaponGroupCode: 'C',
      }),
    ).toBe('KM Precision C');
  });

  it('G16: training names combine discipline and local date', () => {
    expect(
      defaultSessionName({
        kind: 'training',
        disciplineLabel: 'Precision',
        dateLabel: '30 aug. 2026',
      }),
    ).toBe('Precision — 30 aug. 2026');
  });

  it('G17: missing parts never leave double spaces or dangling separators', () => {
    expect(
      defaultSessionName({ kind: 'competition', levelLabel: 'KM', weaponGroupCode: 'C' }),
    ).toBe('KM C');
    expect(
      defaultSessionName({
        kind: 'competition',
        levelLabel: '',
        programLabel: '  ',
        weaponGroupCode: 'C',
      }),
    ).toBe('C');
    expect(defaultSessionName({ kind: 'competition', levelLabel: '' })).toBe('');
    expect(
      defaultSessionName({ kind: 'training', disciplineLabel: '', dateLabel: '2026-08-30' }),
    ).toBe('2026-08-30');
    expect(
      defaultSessionName({ kind: 'training', disciplineLabel: 'Precision', dateLabel: '' }),
    ).toBe('Precision');
  });
});

describe('scoring mode (spec G18)', () => {
  const precision = () => requireDiscipline('spsf-precision');
  const generic = () => requireDiscipline('generic-rings');

  it('G18: a discipline that forbids decimals never offers the toggle', () => {
    expect(decimalAllowed(precision(), null)).toBe(false);
    expect(decimalAllowed(precision(), getProgram('spsf-precision') ?? null)).toBe(false);
  });

  it('G18: a program fixes the scoring mode, so the toggle disappears', () => {
    expect(decimalAllowed(generic(), null)).toBe(true);
    const milsnabb = getProgram('spsf-milsnabb');
    expect(decimalAllowed(generic(), milsnabb ?? null)).toBe(false);
  });

  it('the effective scoring mode follows the program, then the preference', () => {
    expect(scoringModeFor(generic(), null, true)).toBe('decimal');
    expect(scoringModeFor(generic(), null, false)).toBe('integer');
    expect(scoringModeFor(precision(), null, true)).toBe('integer');
    expect(scoringModeFor(precision(), getProgram('spsf-precision') ?? null, true)).toBe('integer');
  });
});
