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
  GENERIC_WEAPON_GROUPS,
  formatGroupAndClass,
  formatShooterClass,
  getDiscipline,
  getProgram,
  PROGRAMS,
  programSchema,
  programsForDiscipline,
  requireDiscipline,
  resolveWeaponGroupIds,
  scoringModeFor,
  shooterClassesForDiscipline,
  SPSF_WEAPON_GROUPS,
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

  it('G4: v1 ships the SPSF + ISSF pistol discipline set (§6.2)', () => {
    expect(DISCIPLINES.map((d) => d.id).sort()).toEqual([
      'generic-rings',
      'issf-air-pistol',
      'issf-free-pistol',
      'issf-rapid-fire-pistol',
      'issf-sport-pistol',
      'issf-standard-pistol',
      'spsf-milsnabb',
      'spsf-precision',
    ]);
  });

  it('lookups find and reject by id', () => {
    expect(getDiscipline('spsf-precision')?.name.sv).toBe('Precision');
    expect(getDiscipline('issf-air-pistol')?.name.sv).toBe('Luftpistol');
    expect(getDiscipline('issf-nope')).toBeUndefined();
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

  it('a fixed-format program without time limits yields null limits', () => {
    const untimed = programSchema.parse({
      ...milsnabbProgramJson,
      structure: { sighterSeries: 1, groups: [{ seriesCount: 2 }] },
    });
    expect(buildProgramSkeleton(untimed)).toEqual([
      { position: 1, isSighter: true, isFinal: false, shots: 5, timeLimitSeconds: null },
      { position: 2, isSighter: false, isFinal: false, shots: 5, timeLimitSeconds: null },
      { position: 3, isSighter: false, isFinal: false, shots: 5, timeLimitSeconds: null },
    ]);
  });

  it('a fixed-format program without a sighter starts at the first scored series', () => {
    const noSighter = programSchema.parse({
      ...milsnabbProgramJson,
      structure: { sighterSeries: 0, groups: [{ seriesCount: 1, timeLimitSeconds: 20 }] },
    });
    expect(buildProgramSkeleton(noSighter)).toEqual([
      { position: 1, isSighter: false, isFinal: false, shots: 5, timeLimitSeconds: 20 },
    ]);
  });

  it('G9: a freeform program pre-creates nothing', () => {
    const program = getProgram('spsf-precision');
    if (!program) throw new Error('precision program missing');
    expect(buildProgramSkeleton(program)).toEqual([]);
  });
});

describe('ISSF pistol programs (docs/reference/issf-rules.md)', () => {
  // Table-driven: id, total scored shots (= max score at 1 point/shot,
  // since 'rings' scoring never exceeds 10/shot and every series here is
  // full-value), total series (sighters excluded), sighter series count.
  const issfPrograms = [
    { id: 'issf-air-pistol', shots: 60, series: 6, sighterSeries: 0 },
    { id: 'issf-free-pistol', shots: 60, series: 12, sighterSeries: 0 },
    { id: 'issf-standard-pistol', shots: 60, series: 12, sighterSeries: 1 },
    { id: 'issf-rapid-fire-pistol', shots: 60, series: 12, sighterSeries: 1 },
    { id: 'issf-sport-pistol', shots: 60, series: 12, sighterSeries: 1 },
  ];

  it.each(issfPrograms)(
    '$id: $shots scored shots across $series series, max score = shots x 10',
    ({ id, shots, series, sighterSeries }) => {
      const program = getProgram(id);
      if (!program) throw new Error(`${id} program missing`);
      expect(program.federation).toBe('ISSF');
      expect(program.scoring).toBe('integer');
      expect(program.supportsFinal).toBe(false);
      if (!program.structure) throw new Error(`${id} has no structure`);
      expect(program.structure.sighterSeries).toBe(sighterSeries);

      const scoredSeriesCount = program.structure.groups.reduce((n, g) => n + g.seriesCount, 0);
      expect(scoredSeriesCount).toBe(series);
      const scoredShots = scoredSeriesCount * program.shotsPerSeries;
      expect(scoredShots).toBe(shots);
      const maxScore = scoredShots * 10;
      expect(maxScore).toBe(shots * 10);

      const skeleton = buildProgramSkeleton(program);
      expect(skeleton.filter((s) => s.isSighter)).toHaveLength(sighterSeries);
      expect(skeleton.filter((s) => !s.isSighter)).toHaveLength(series);
      expect(skeleton).toHaveLength(sighterSeries + series);
    },
  );

  it('issf-air-pistol and issf-free-pistol have unlimited (unmodeled) sighters, not a fixed count', () => {
    // Documented in issf-rules.md: ISSF allows unlimited sighting shots
    // during prep time for these two events, which our fixed sighterSeries
    // count cannot express, so both ship sighterSeries: 0.
    expect(getProgram('issf-air-pistol')?.structure?.sighterSeries).toBe(0);
    expect(getProgram('issf-free-pistol')?.structure?.sighterSeries).toBe(0);
  });

  it('issf-standard-pistol: 150/20/10 second stages (8.7.6.5)', () => {
    const program = getProgram('issf-standard-pistol');
    expect(program?.structure?.groups).toEqual([
      { seriesCount: 4, timeLimitSeconds: 150 },
      { seriesCount: 4, timeLimitSeconds: 20 },
      { seriesCount: 4, timeLimitSeconds: 10 },
    ]);
  });

  it('issf-rapid-fire-pistol: 8/6/4 second series, repeated across two stages (8.7.6.3.a)', () => {
    const program = getProgram('issf-rapid-fire-pistol');
    expect(program?.structure?.groups).toEqual([
      { seriesCount: 2, timeLimitSeconds: 8 },
      { seriesCount: 2, timeLimitSeconds: 6 },
      { seriesCount: 2, timeLimitSeconds: 4 },
      { seriesCount: 2, timeLimitSeconds: 8 },
      { seriesCount: 2, timeLimitSeconds: 6 },
      { seriesCount: 2, timeLimitSeconds: 4 },
    ]);
  });

  it('issf-sport-pistol: 240s precision stage, untimed rapid stage (8.7.6.4)', () => {
    const program = getProgram('issf-sport-pistol');
    expect(program?.structure?.groups).toEqual([
      { seriesCount: 6, timeLimitSeconds: 240 },
      { seriesCount: 6 },
    ]);
  });

  it('ISSF disciplines ship no vapengrupper (§6.4a) and no klasser', () => {
    for (const id of issfPrograms.map((p) => p.id)) {
      expect(weaponGroupsForDiscipline(id)).toEqual([]);
      expect(shooterClassesForDiscipline(id)).toEqual([]);
    }
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

  it('a data file naming a group that does not exist is a hard error', () => {
    expect(resolveWeaponGroupIds(['spsf:C'], 'test')).toEqual([
      { id: 'spsf:C', code: 'C', federation: 'SPSF' },
    ]);
    expect(() => resolveWeaponGroupIds(['spsf:C', 'spsf:ZZ'], 'test')).toThrow(
      /unknown weapon group spsf:ZZ/,
    );
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

// Gaps found by mutation testing (Stryker survivors).
describe('mutation-hardening', () => {
  it('ships every SPSF vapengrupp id, magnum groups included', () => {
    expect(SPSF_WEAPON_GROUPS.map((g) => g.id)).toEqual([
      'spsf:A',
      'spsf:AM',
      'spsf:AP',
      'spsf:AG',
      'spsf:A-opt',
      'spsf:B',
      'spsf:C',
      'spsf:R',
      'spsf:M1',
      'spsf:M2',
      'spsf:M3',
      'spsf:M4',
      'spsf:M5',
      'spsf:M6',
      'spsf:M7',
      'spsf:M8',
      'spsf:M9',
    ]);
    expect(SPSF_WEAPON_GROUPS.every((g) => g.federation === 'SPSF')).toBe(true);
    expect(GENERIC_WEAPON_GROUPS).toEqual([
      { id: 'generic:airgun', code: 'airgun', federation: 'generic' },
    ]);
  });

  it('only formats Dam/Vet prefixes, and only with a suffix', () => {
    expect(formatShooterClass('Dam')).toBe('Dam');
    expect(formatShooterClass('Vet')).toBe('Vet');
    expect(formatShooterClass('XDam1')).toBe('XDam1');
    expect(formatShooterClass('Dam1x')).toBe('Dam 1x');
    expect(formatShooterClass('Jun')).toBe('Jun');
  });

  it('trims the parts of a session name', () => {
    expect(
      defaultSessionName({
        kind: 'training',
        disciplineLabel: '  Precision  ',
        dateLabel: ' 2026-08-30 ',
      }),
    ).toBe('Precision — 2026-08-30');
    expect(
      defaultSessionName({
        kind: 'competition',
        levelLabel: ' KM ',
        programLabel: ' Precision ',
        weaponGroupCode: ' C ',
      }),
    ).toBe('KM Precision C');
  });

  it('a program that scores decimal forces decimal', () => {
    const decimalProgram = programSchema.parse({
      ...milsnabbProgramJson,
      id: 'test-decimal',
      scoring: 'decimal',
    });
    expect(scoringModeFor(requireDiscipline('generic-rings'), decimalProgram, false)).toBe(
      'decimal',
    );
    expect(scoringModeFor(requireDiscipline('spsf-precision'), decimalProgram, false)).toBe(
      'decimal',
    );
  });

  it('names the unknown id in lookup failures', () => {
    expect(() => requireDiscipline('nope')).toThrow(/Unknown discipline: nope/);
  });

  it('G3b: the schemas reject every shape of malformed data', () => {
    const badDisciplines = [
      { id: '' },
      { targetFace: '' },
      { name: { sv: '', en: 'Precision' } },
      { name: { sv: 'Precision', en: 'Precision', de: 'Präzision' } },
      { defaultSeriesLength: -1 },
      { defaultSeriesLength: 2.5 },
      { scoring: 'points' },
      { allowsDecimal: 'yes' },
      { weaponGroups: [''] },
      { weaponGroups: 'spsf:C' },
      { federation: '' },
    ];
    for (const patch of badDisciplines) {
      expect(() => disciplineSchema.parse({ ...precisionDisciplineJson, ...patch })).toThrow();
    }

    const badPrograms = [
      { id: '' },
      { disciplineId: '' },
      { shotsPerSeries: 0 },
      { supportsFinal: 1 },
      { structure: { sighterSeries: -1, groups: [{ seriesCount: 1 }] } },
      { structure: { sighterSeries: 1, groups: [{ seriesCount: 0 }] } },
      { structure: { sighterSeries: 1, groups: [{ seriesCount: 1, timeLimitSeconds: 0 }] } },
      { structure: { sighterSeries: 1, groups: [{ seriesCount: 1, timeLimitSeconds: 1.5 }] } },
      { structure: { sighterSeries: 1, groups: [{ seriesCount: 1, extra: true }] } },
      { structure: { sighterSeries: 1, groups: [{ seriesCount: 1 }], extra: true } },
      { structure: { groups: [{ seriesCount: 1 }] } },
      { structure: { sighterSeries: 1 } },
      { surprise: true },
    ];
    for (const patch of badPrograms) {
      expect(() => programSchema.parse({ ...milsnabbProgramJson, ...patch })).toThrow();
    }

    // every federation the schema does accept
    for (const federation of ['SPSF', 'ISSF', 'generic']) {
      expect(() =>
        disciplineSchema.parse({ ...precisionDisciplineJson, federation }),
      ).not.toThrow();
    }
    // an optional structure may legitimately be absent
    const { structure: _omitted, ...withoutStructure } = milsnabbProgramJson;
    expect(() => programSchema.parse(withoutStructure)).not.toThrow();
  });
});
