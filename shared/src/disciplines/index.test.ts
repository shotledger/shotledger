// Executable spec for docs/specs/m3-scoring-spec.md §6 (discipline/program
// data layer). Scenario ids (G1…G18) map 1:1 to the spec table.
import { describe, expect, it } from 'vitest';

import faltDisciplineJson from './definitions/spsf-falt.json';
import precisionDisciplineJson from './definitions/spsf-precision.json';
import milsnabbProgramJson from './programs/spsf-milsnabb.json';
import {
  assertProgramFaces,
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
  programSighterCount,
  programStages,
  programsForDiscipline,
  requireDiscipline,
  resolveWeaponGroupIds,
  ringScoringDisciplines,
  scoringModeFor,
  selectableWeaponGroups,
  seriesStage,
  seriesTargetFace,
  disciplinesForRegulations,
  shooterClassesForDiscipline,
  weaponGroupsForRegulations,
  SPSF_WEAPON_GROUPS,
  weaponGroupLabel,
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
      programSchema.parse({ ...milsnabbProgramJson, structure: { groups: [] } }),
    ).toThrow();
  });

  it('G4: v1 ships the SPSF + ISSF + SvSF pistol discipline set (§6.2)', () => {
    expect(DISCIPLINES.map((d) => d.id).sort()).toEqual([
      'generic-rings',
      'issf-air-pistol',
      'issf-centre-fire-pistol',
      'issf-free-pistol',
      'issf-rapid-fire-pistol',
      'issf-sport-pistol',
      'issf-standard-pistol',
      'spsf-falt',
      'spsf-figurskjutning',
      'spsf-helmatch',
      'spsf-magnumprecision',
      'spsf-milsnabb',
      'spsf-precision',
      'svsf-snabbluftpistol',
    ]);
  });

  it('lists every ISSF discipline before the SvSF ones', () => {
    // The new-session form lands on the first non-generic discipline of the
    // regelverk picked; an SvSF shooter should get luftpistol, not
    // snabbluftpistol.
    const federations = DISCIPLINES.map((d) => d.federation);
    expect(federations.lastIndexOf('ISSF')).toBeLessThan(federations.indexOf('SvSF'));
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
      groups: [
        { seriesCount: 4, timeLimitSeconds: 10, sighterSeries: 1 },
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
      targetFace: 'spsf-snabbskjutning-25m',
      stage: null,
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
      structure: { groups: [{ seriesCount: 2, sighterSeries: 1 }] },
    });
    const face = 'spsf-snabbskjutning-25m';
    expect(buildProgramSkeleton(untimed)).toEqual([
      {
        position: 1,
        isSighter: true,
        isFinal: false,
        shots: 5,
        timeLimitSeconds: null,
        targetFace: face,
        stage: null,
      },
      {
        position: 2,
        isSighter: false,
        isFinal: false,
        shots: 5,
        timeLimitSeconds: null,
        targetFace: face,
        stage: null,
      },
      {
        position: 3,
        isSighter: false,
        isFinal: false,
        shots: 5,
        timeLimitSeconds: null,
        targetFace: face,
        stage: null,
      },
    ]);
  });

  it('a fixed-format program without a sighter starts at the first scored series', () => {
    const noSighter = programSchema.parse({
      ...milsnabbProgramJson,
      structure: { groups: [{ seriesCount: 1, timeLimitSeconds: 20 }] },
    });
    expect(buildProgramSkeleton(noSighter)).toEqual([
      {
        position: 1,
        isSighter: false,
        isFinal: false,
        shots: 5,
        timeLimitSeconds: 20,
        targetFace: 'spsf-snabbskjutning-25m',
        stage: null,
      },
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
    { id: 'issf-rapid-fire-pistol', shots: 60, series: 12, sighterSeries: 2 },
    { id: 'issf-sport-pistol', shots: 60, series: 12, sighterSeries: 2 },
    { id: 'issf-centre-fire-pistol', shots: 60, series: 12, sighterSeries: 2 },
  ];

  it.each(issfPrograms)(
    '$id: $shots scored shots across $series series',
    ({ id, shots, series, sighterSeries }) => {
      const program = getProgram(id);
      if (!program) throw new Error(`${id} program missing`);
      expect(program.federation).toBe('ISSF');
      expect(program.scoring).toBe('integer');
      expect(program.supportsFinal).toBe(false);
      if (!program.structure) throw new Error(`${id} has no structure`);
      expect(programSighterCount(program)).toBe(sighterSeries);

      const scoredSeriesCount = program.structure.groups.reduce((n, g) => n + g.seriesCount, 0);
      expect(scoredSeriesCount).toBe(series);
      const scoredShots = scoredSeriesCount * program.shotsPerSeries;
      expect(scoredShots).toBe(shots);

      const skeleton = buildProgramSkeleton(program);
      expect(skeleton.filter((s) => s.isSighter)).toHaveLength(sighterSeries);
      expect(skeleton.filter((s) => !s.isSighter)).toHaveLength(series);
      expect(skeleton).toHaveLength(sighterSeries + series);
    },
  );

  it('issf-air-pistol and issf-free-pistol have unlimited (unmodeled) sighters, not a fixed count', () => {
    // Documented in issf-rules.md: ISSF allows unlimited sighting shots
    // during prep time for these two events, which a fixed sighterSeries
    // count cannot express, so both ship sighterSeries: 0.
    expect(getProgram('issf-air-pistol')?.structure?.groups[0]?.sighterSeries).toBe(0);
    expect(getProgram('issf-free-pistol')?.structure?.groups[0]?.sighterSeries).toBe(0);
  });

  it('issf-standard-pistol: 150/20/10 second stages (8.7.6.5)', () => {
    const program = getProgram('issf-standard-pistol');
    expect(program?.structure?.groups).toEqual([
      { seriesCount: 4, timeLimitSeconds: 150, sighterSeries: 1 },
      { seriesCount: 4, timeLimitSeconds: 20 },
      { seriesCount: 4, timeLimitSeconds: 10 },
    ]);
  });

  it('issf-rapid-fire-pistol: 8/6/4 second series, repeated across two stages (8.7.6.3.a)', () => {
    const program = getProgram('issf-rapid-fire-pistol');
    // 8.7.6.3.b: one 8 s sighting series before each stage.
    expect(program?.structure?.groups).toEqual([
      { seriesCount: 2, timeLimitSeconds: 8, sighterSeries: 1 },
      { seriesCount: 2, timeLimitSeconds: 6 },
      { seriesCount: 2, timeLimitSeconds: 4 },
      { seriesCount: 2, timeLimitSeconds: 8, sighterSeries: 1 },
      { seriesCount: 2, timeLimitSeconds: 6 },
      { seriesCount: 2, timeLimitSeconds: 4 },
    ]);
    const skeleton = buildProgramSkeleton(program!);
    expect(skeleton[7]).toMatchObject({ isSighter: true, timeLimitSeconds: 8 });
  });

  it('issf-sport-pistol: 240s precision stage, untimed rapid stage (8.7.6.4)', () => {
    const program = getProgram('issf-sport-pistol');
    // The rapid-fire stage is shot on the rapid fire face (GTR 6.3.4.4);
    // each stage opens with its own sighting series (8.7.6.4.a).
    expect(program?.structure?.groups).toEqual([
      { seriesCount: 6, timeLimitSeconds: 240, sighterSeries: 1 },
      { seriesCount: 6, targetFace: 'issf-25m-rapid-fire', sighterSeries: 1 },
    ]);
    const skeleton = buildProgramSkeleton(program!);
    expect(skeleton[7]).toMatchObject({
      isSighter: true,
      timeLimitSeconds: null,
      targetFace: 'issf-25m-rapid-fire',
    });
  });

  it('issf-centre-fire-pistol: the same course as 25m Pistol (8.7.6.4 governs both)', () => {
    // Rule 8.7.6.4 is "Specific Rules for 25m Pistol and 25m Centre Fire
    // Pistol"; the caliber lives on the firearm, so the programs are one shape.
    const centerFire = getProgram('issf-centre-fire-pistol');
    const sportPistol = getProgram('issf-sport-pistol');
    expect(centerFire?.structure).toEqual(sportPistol?.structure);
    expect(centerFire?.shotsPerSeries).toBe(sportPistol?.shotsPerSeries);
    expect(getDiscipline('issf-centre-fire-pistol')?.targetFace).toBe(
      getDiscipline('issf-sport-pistol')?.targetFace,
    );
    expect(getDiscipline('issf-centre-fire-pistol')?.name).toEqual({
      sv: 'Grovpistol',
      en: '25m Centre Fire Pistol',
    });
  });

  it('ISSF disciplines ship no vapengrupper (§6.4a) and no klasser', () => {
    for (const id of issfPrograms.map((p) => p.id)) {
      expect(weaponGroupsForDiscipline(id)).toEqual([]);
      expect(shooterClassesForDiscipline(id)).toEqual([]);
    }
  });
});

describe('SvSF pistol programs (docs/reference/svsf-rules.md)', () => {
  it('svsf-snabbluftpistol: 60 shots as two rounds of 2x10 s, 2x8 s, 2x6 s (§6.1)', () => {
    const program = getProgram('svsf-snabbluftpistol');
    expect(program).toMatchObject({
      federation: 'SvSF',
      shotsPerSeries: 5,
      scoring: 'integer',
      supportsFinal: false,
    });
    expect(program?.structure).toEqual({
      // §6.3: one 5-shot provserie at 10 s before each round.
      groups: [
        { seriesCount: 2, timeLimitSeconds: 10, sighterSeries: 1 },
        { seriesCount: 2, timeLimitSeconds: 8 },
        { seriesCount: 2, timeLimitSeconds: 6 },
        { seriesCount: 2, timeLimitSeconds: 10, sighterSeries: 1 },
        { seriesCount: 2, timeLimitSeconds: 8 },
        { seriesCount: 2, timeLimitSeconds: 6 },
      ],
    });
    const skeleton = buildProgramSkeleton(program!);
    expect(skeleton).toHaveLength(14);
    expect(skeleton[0]).toMatchObject({ isSighter: true, timeLimitSeconds: 10 });
    expect(skeleton[7]).toMatchObject({ isSighter: true, timeLimitSeconds: 10 });
    expect(skeleton.filter((s) => !s.isSighter).reduce((n, s) => n + s.shots, 0)).toBe(60);
  });

  it('svsf-snabbluftpistol is SvSF-owned, integer, and scored on its own 10 m face', () => {
    const discipline = requireDiscipline('svsf-snabbluftpistol');
    expect(discipline).toMatchObject({
      federation: 'SvSF',
      targetFace: 'svsf-10m-snabbluftpistol',
      defaultSeriesLength: 5,
      scoring: 'rings',
      allowsDecimal: false,
      weaponGroups: [],
    });
    expect(discipline.name).toEqual({ sv: 'Snabbluftpistol', en: '10m Rapid Fire Air Pistol' });
    expect(programsForDiscipline('svsf-snabbluftpistol').map((p) => p.id)).toEqual([
      'svsf-snabbluftpistol',
    ]);
    // SPSF klasser are SPSF's; an SvSF discipline carries events instead.
    expect(shooterClassesForDiscipline('svsf-snabbluftpistol')).toEqual([]);
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

  it('G11: milsnabb adds R and A-opt, and no A sub-groups', () => {
    // SHB J.4 lists exactly five groups for militär snabbmatch: J.4.1 A,
    // J.4.2 B, J.4.3 C, J.4.4 R, and J.4.5 "Vapengrupp A optiska riktmedel"
    // (p. 288, which follows D.4.1's rules with a 2000 g optic weight cap).
    // AM/AP/AG appear nowhere in J.4 — they are precision (F.4.1.1-F.4.1.3)
    // and fältskjutning (D.4.1.1-D.4.1.4) only, so their absence is correct.
    expect(weaponGroupsForDiscipline('spsf-milsnabb').map((g) => g.id)).toEqual([
      'spsf:A',
      'spsf:A-opt',
      'spsf:B',
      'spsf:C',
      'spsf:R',
    ]);
  });

  it('selectableWeaponGroups offers only groups a session can follow', () => {
    // The rule is "reachable through a shipped discipline", not a hard-coded
    // list: M1-M9 were excluded until Magnumprecision (SHB Del G) declared
    // them, and appeared with no change here. See spec MP3.
    const ids = selectableWeaponGroups().map((g) => g.id);
    expect(ids).toContain('spsf:A-opt');
    expect(ids).toContain('generic:airgun');
    expect(ids.filter((id) => /^spsf:M\d$/.test(id))).toHaveLength(9);
  });

  it('selectableWeaponGroups is the union of the disciplines, without duplicates', () => {
    const ids = selectableWeaponGroups().map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const discipline of DISCIPLINES) {
      for (const id of discipline.weaponGroups) expect(ids).toContain(id);
    }
  });

  it('the practice discipline declares no vapengrupp', () => {
    // Vapengrupp is an SPSF classification. The practice discipline belongs to
    // no federation, so it has none to declare and the session form hides the
    // picker — the same as every ISSF discipline. The gun itself is still
    // recorded by the firearm field.
    expect(weaponGroupsForDiscipline('generic-rings')).toEqual([]);
  });

  it('still offers the generic groups on the FIREARM form, which no discipline declares', () => {
    // The regression guard for the trap this change walked into:
    // selectableWeaponGroups() derived its list from DISCIPLINES alone, so the
    // moment the practice discipline stopped declaring `generic:airgun` the
    // group vanished from the firearm form and orphaned every firearm already
    // assigned to it.
    expect(selectableWeaponGroups().map((g) => g.id)).toContain('generic:airgun');
  });

  it('an unknown discipline has no groups to offer', () => {
    expect(() => weaponGroupsForDiscipline('nope')).toThrow(/unknown discipline/i);
  });

  it('a data file naming a group that does not exist is a hard error', () => {
    expect(resolveWeaponGroupIds(['spsf:C'], 'test')).toEqual([
      { id: 'spsf:C', code: 'C', label: 'C', federation: 'SPSF' },
    ]);
    expect(() => resolveWeaponGroupIds(['spsf:C', 'spsf:ZZ'], 'test')).toThrow(
      /unknown weapon group spsf:ZZ/,
    );
  });

  it('G12: SPSF shooter classes per SHB F.2.1, without the F.2.5 klass-1 variants', () => {
    expect(shooterClassesForDiscipline('spsf-precision')).toEqual([
      '1',
      '2',
      '3',
      'Jun',
      'Dam1',
      'Dam2',
      'Dam3',
      'VetY',
      'VetÄ',
    ]);
    for (const dropped of ['1u', '1b', '1s']) {
      expect(shooterClassesForDiscipline('spsf-precision')).not.toContain(dropped);
    }
    expect(shooterClassesForDiscipline('spsf-milsnabb')).toEqual(
      shooterClassesForDiscipline('spsf-precision'),
    );
    expect(shooterClassesForDiscipline('generic-rings')).toEqual([]);
  });

  it('G13: group and class display combined, never stored as one string', () => {
    expect(formatGroupAndClass('spsf:C', '2')).toBe('C2');
    expect(formatGroupAndClass('spsf:A-opt', 'VetY')).toBe('A Opt Vet Y');
    // Multi-word halves keep the space; 'CDam 1' would be unreadable.
    expect(formatGroupAndClass('spsf:C', 'Dam1')).toBe('C Dam 1');
    expect(formatGroupAndClass('spsf:A', '3')).toBe('A3');
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
    expect(formatShooterClass('3')).toBe('3');
    expect(formatShooterClass(null)).toBe('');
  });

  it('weapon group ids resolve to labels', () => {
    expect(weaponGroupLabel('spsf:A-opt')).toBe('A Opt');
    expect(weaponGroupLabel('generic:airgun')).toBe('airgun');
    expect(weaponGroupLabel('unknown:zz')).toBe('');
    expect(weaponGroupLabel(null)).toBe('');
    expect(findWeaponGroup('spsf:R')).toEqual({
      id: 'spsf:R',
      code: 'R',
      label: 'R',
      federation: 'SPSF',
    });
    expect(findWeaponGroup('spsf:M9')?.label).toBe('M9');
    expect(findWeaponGroup(null)).toBeNull();
  });

  it('relabelling A-opt leaves the stored id alone', () => {
    // The label changed for display only; `spsf:A-opt` is what sessions and
    // firearms already have on disk, so it must not move without a migration.
    const group = findWeaponGroup('spsf:A-opt');
    expect(group).toEqual({
      id: 'spsf:A-opt',
      code: 'A-opt',
      label: 'A Opt',
      federation: 'SPSF',
    });
  });
});

describe('session naming (spec G15-G17)', () => {
  it('G15: names combine the session type and the local date', () => {
    expect(defaultSessionName({ typeLabel: 'Training', dateLabel: '30 aug 2026' })).toBe(
      'Training \u2014 30 aug 2026',
    );
    expect(defaultSessionName({ typeLabel: 'T\u00e4vling', dateLabel: '30 aug 2026' })).toBe(
      'T\u00e4vling \u2014 30 aug 2026',
    );
  });

  it('G16: competitions use the same shape as training', () => {
    expect(defaultSessionName({ typeLabel: 'Competition', dateLabel: '30 aug 2026' })).toBe(
      'Competition \u2014 30 aug 2026',
    );
  });

  it('G17: missing parts never leave double spaces or dangling separators', () => {
    expect(defaultSessionName({ typeLabel: '', dateLabel: '2026-08-30' })).toBe('2026-08-30');
    expect(defaultSessionName({ typeLabel: 'Training', dateLabel: '' })).toBe('Training');
    expect(defaultSessionName({ typeLabel: '  ', dateLabel: '  ' })).toBe('');
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
      { id: 'generic:airgun', code: 'airgun', label: 'airgun', federation: 'generic' },
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
    expect(defaultSessionName({ typeLabel: '  Training  ', dateLabel: ' 2026-08-30 ' })).toBe(
      'Training \u2014 2026-08-30',
    );
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
      { structure: { groups: [{ seriesCount: 1, sighterSeries: -1 }] } },
      { structure: { groups: [{ seriesCount: 1, sighterSeries: 1.5 }] } },
      { structure: { groups: [{ seriesCount: 0 }] } },
      { structure: { groups: [{ seriesCount: 1, timeLimitSeconds: 0 }] } },
      { structure: { groups: [{ seriesCount: 1, timeLimitSeconds: 1.5 }] } },
      { structure: { groups: [{ seriesCount: 1, targetFace: '' }] } },
      { structure: { groups: [{ seriesCount: 1, extra: true }] } },
      { structure: { groups: [{ seriesCount: 1 }], extra: true } },
      // the leading count moved onto the group
      { structure: { sighterSeries: 1, groups: [{ seriesCount: 1 }] } },
      { structure: {} },
      { surprise: true },
    ];
    for (const patch of badPrograms) {
      expect(() => programSchema.parse({ ...milsnabbProgramJson, ...patch })).toThrow();
    }

    // every federation the schema does accept
    for (const federation of ['SPSF', 'ISSF', 'SvSF', 'generic']) {
      expect(() =>
        disciplineSchema.parse({ ...precisionDisciplineJson, federation }),
      ).not.toThrow();
    }
    // an optional structure may legitimately be absent
    const { structure: _omitted, ...withoutStructure } = milsnabbProgramJson;
    expect(() => programSchema.parse(withoutStructure)).not.toThrow();
  });
});

describe('disciplinesForRegulations', () => {
  it('offers SPSF disciplines when SPSF is enabled', () => {
    const ids = disciplinesForRegulations(['spsf']).map((d) => d.id);

    expect(ids).toContain('spsf-precision');
    expect(ids).toContain('spsf-milsnabb');
  });

  it('offers ISSF disciplines when only SvSF is enabled', () => {
    // SvSF adopts ISSF rather than redefining its events, so enabling SvSF
    // alone must still produce a discipline list.
    const ids = disciplinesForRegulations(['svsf']).map((d) => d.id);

    expect(ids).toContain('issf-air-pistol');
    expect(ids).not.toContain('spsf-precision');
  });

  it("offers SvSF's own discipline only when SvSF is enabled", () => {
    // ISSF alone is the international list; snabbluftpistol is Swedish.
    expect(disciplinesForRegulations(['issf']).map((d) => d.id)).not.toContain(
      'svsf-snabbluftpistol',
    );
    expect(disciplinesForRegulations(['svsf']).map((d) => d.id)).toContain('svsf-snabbluftpistol');
  });

  it('keeps generic practice available with nothing enabled at all', () => {
    // A shooter who belongs to no federation can still log a session.
    expect(disciplinesForRegulations([]).map((d) => d.id)).toEqual(['generic-rings']);
  });

  it('unions both when a shooter competes under SPSF and SvSF', () => {
    const ids = disciplinesForRegulations(['spsf', 'svsf']).map((d) => d.id);

    expect(ids).toContain('spsf-precision');
    expect(ids).toContain('issf-air-pistol');
  });
});

describe('weaponGroupsForRegulations', () => {
  it('offers SPSF vapengrupper only when SPSF is enabled', () => {
    const codes = weaponGroupsForRegulations(['spsf']).map((g) => g.code);

    expect(codes).toContain('C');
    expect(codes).toContain('R');
  });

  it('offers no vapengrupp at all to an SvSF-only shooter', () => {
    // ISSF ships events, not vapengrupper, and the practice discipline now
    // declares none either — so a shooter under SvSF alone has no vapengrupp
    // to choose on a session. Empty is the honest answer, not a gap:
    // `selectableWeaponGroups()` still offers the generic groups on the
    // firearm form, which is where the gun is described.
    expect(weaponGroupsForRegulations(['svsf'])).toEqual([]);
  });

  it('never lists a group twice when two disciplines share it', () => {
    const ids = weaponGroupsForRegulations(['spsf']).map((g) => g.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

/**
 * The first issue a discipline is refused for — code, path and message, so a
 * refusal has to name the field the packager must fix, not merely happen.
 */
function refusal(raw: unknown): { code: string; path: readonly PropertyKey[]; message: string } {
  const result = disciplineSchema.safeParse(raw);
  if (result.success) throw new Error('expected the schema to reject this discipline');
  const issue = result.error.issues[0]!;
  return { code: issue.code, path: issue.path, message: issue.message };
}

describe('fältskjutning: a hits discipline (issue #315, spec D1-D7 / N1)', () => {
  it('D1: the schema accepts scoring: hits, with no targetFace', () => {
    expect(() => disciplineSchema.parse(faltDisciplineJson)).not.toThrow();
  });

  it('D2: a rings discipline without a targetFace is rejected', () => {
    const { targetFace: _dropped, ...withoutFace } = precisionDisciplineJson;
    expect(refusal(withoutFace)).toEqual({
      code: 'custom',
      path: ['targetFace'],
      message: 'a rings discipline must name its targetFace',
    });
  });

  it('D3: a hits discipline WITH a targetFace is rejected', () => {
    // Fält has a figure catalogue (D.7.1 pp. 99-109), not one face.
    expect(refusal({ ...faltDisciplineJson, targetFace: 'spsf-falt-c30' })).toEqual({
      code: 'custom',
      path: ['targetFace'],
      message: 'a hits discipline has no single targetFace',
    });
  });

  it('D4: a hits discipline cannot allow decimals', () => {
    expect(refusal({ ...faltDisciplineJson, allowsDecimal: true })).toEqual({
      code: 'custom',
      path: ['allowsDecimal'],
      message: 'a hits discipline has no ring value to score decimally',
    });
  });

  it('D5: spsf-falt is registered with the SHB Del D shape', () => {
    const falt = requireDiscipline('spsf-falt');
    expect(falt).toMatchObject({
      federation: 'SPSF',
      scoring: 'hits',
      // Six shots at every station (D.6.4 p. 91).
      defaultSeriesLength: 6,
      allowsDecimal: false,
    });
    expect(falt.targetFace).toBeUndefined();
    expect(falt.name).toEqual({ sv: 'Fältskjutning', en: 'Fältskjutning' });
    // A, A optisk, B, C, R -- R exists here where precision has none
    // (D.4 pp. 82-86; C.5.1.1.2 p. 69).
    expect(weaponGroupsForDiscipline('spsf-falt').map((g) => g.id)).toEqual([
      'spsf:A',
      'spsf:A-opt',
      'spsf:B',
      'spsf:C',
      'spsf:R',
    ]);
  });

  it('D6: fält ships no program -- the station count belongs to the competition', () => {
    expect(programsForDiscipline('spsf-falt')).toEqual([]);
  });

  it('D7: ringScoringDisciplines keeps the rings members, in order', () => {
    const ids = ringScoringDisciplines().map((d) => d.id);
    expect(ids).not.toContain('spsf-falt');
    expect(ids).toEqual(DISCIPLINES.filter((d) => d.scoring === 'rings').map((d) => d.id));
    expect(ringScoringDisciplines([requireDiscipline('spsf-falt')])).toEqual([]);
  });

  it('N1: the new-session picker offers exactly what it did before fält', () => {
    // Registered is not the same as enterable: there is no station entry UI
    // yet (#315), and a session nobody can score is worse than none.
    for (const regulation of [[], ['spsf'], ['issf'], ['svsf'], ['spsf', 'svsf']]) {
      const offered = ringScoringDisciplines(disciplinesForRegulations(regulation)).map(
        (d) => d.id,
      );
      expect(offered).not.toContain('spsf-falt');
      expect(offered).toEqual(
        disciplinesForRegulations(regulation)
          .filter((d) => d.id !== 'spsf-falt')
          .map((d) => d.id),
      );
    }
    expect(disciplinesForRegulations(['spsf']).map((d) => d.id)).toContain('spsf-falt');
  });
});

// Magnumprecision (SHB Del G) — executable spec:
// docs/specs/magnumprecision-spec.md, scenarios MP1-MP8.
describe('Magnumprecision (SHB Del G, spec MP1-MP8)', () => {
  const MAGNUM_GROUP_IDS = [
    'spsf:M1',
    'spsf:M2',
    'spsf:M3',
    'spsf:M4',
    'spsf:M5',
    'spsf:M6',
    'spsf:M7',
    'spsf:M8',
    'spsf:M9',
  ];

  it('MP1: the discipline is registered with Part G’s own values', () => {
    const discipline = requireDiscipline('spsf-magnumprecision');

    expect(discipline.federation).toBe('SPSF');
    // G.7.1 p. 205: "Magnumprecision genomförs mot Pistoltavla 25 m
    // precision" — the same face as F.7.1, shot at 50 m (G.7.2 p. 206).
    expect(discipline.targetFace).toBe('spsf-pistol-25m-precision');
    // G.6.4 p. 200: five shots per series.
    expect(discipline.defaultSeriesLength).toBe(5);
    expect(discipline.scoring).toBe('rings');
    expect(discipline.allowsDecimal).toBe(false);
  });

  it('MP2: declares exactly the nine magnum vapengrupper (G.4.1 pp. 196-197)', () => {
    expect(weaponGroupsForDiscipline('spsf-magnumprecision').map((g) => g.id)).toEqual(
      MAGNUM_GROUP_IDS,
    );
  });

  it('MP3: the magnum groups become selectable on the firearm form', () => {
    // Issue #82's mechanism: selectableWeaponGroups() derives from the
    // shipped disciplines, so declaring M1-M9 is all that is needed.
    const ids = selectableWeaponGroups().map((g) => g.id);

    for (const id of MAGNUM_GROUP_IDS) expect(ids).toContain(id);
  });

  it('MP4: the magnum groups follow the SPSF regulation switch', () => {
    const spsfIds = weaponGroupsForRegulations(['spsf']).map((g) => g.id);
    const issfIds = weaponGroupsForRegulations(['issf']).map((g) => g.id);

    for (const id of MAGNUM_GROUP_IDS) {
      expect(spsfIds).toContain(id);
      expect(issfIds).not.toContain(id);
    }
  });

  it('MP5: the program is freeform — G.6.1 says "minst sex" serier', () => {
    const programs = programsForDiscipline('spsf-magnumprecision');

    expect(programs).toHaveLength(1);
    const program = programs[0]!;
    expect(program.id).toBe('spsf-magnumprecision');
    expect(program.shotsPerSeries).toBe(5);
    expect(program.scoring).toBe('integer');
    // G.1.2 p. 192 "Ej tillämpligt": Part G has no final; a tie goes to
    // särskjutning (G.6.11.3 p. 204).
    expect(program.supportsFinal).toBe(false);
    expect(program.structure).toBeUndefined();
  });

  it('MP6: a freeform program pre-creates no series', () => {
    expect(buildProgramSkeleton(programsForDiscipline('spsf-magnumprecision')[0]!)).toEqual([]);
  });

  it('MP7: magnumprecision has no klassindelning (G.2.1 p. 193)', () => {
    expect(shooterClassesForDiscipline('spsf-magnumprecision')).toEqual([]);
    // The other two SPSF disciplines keep theirs — the absence is specific.
    expect(shooterClassesForDiscipline('spsf-precision').length).toBeGreaterThan(0);
    expect(shooterClassesForDiscipline('spsf-milsnabb').length).toBeGreaterThan(0);
  });

  it('MP8: reuses the precision target face rather than adding one', () => {
    expect(getDiscipline('spsf-magnumprecision')?.targetFace).toBe(
      getDiscipline('spsf-precision')?.targetFace,
    );
  });
});

describe('per-group sighters and faces (§6.3, #476)', () => {
  const twoFaces = programSchema.parse({
    ...milsnabbProgramJson,
    id: 'two-faces',
    structure: {
      groups: [
        { seriesCount: 1, timeLimitSeconds: 300, sighterSeries: 1 },
        {
          seriesCount: 1,
          timeLimitSeconds: 15,
          sighterSeries: 1,
          targetFace: 'issf-25m-rapid-fire',
        },
        { seriesCount: 1, targetFace: 'spsf-pistol-25m-precision' },
      ],
    },
  });

  it('counts the sighters of every group', () => {
    expect(programSighterCount(twoFaces)).toBe(2);
  });

  it('counts no sighters for a freeform program', () => {
    expect(programSighterCount(getProgram('spsf-precision')!)).toBe(0);
  });

  it('gives a skeleton series a null face when the discipline has none', () => {
    const orphan = programSchema.parse({ ...milsnabbProgramJson, disciplineId: 'nope' });
    expect(buildProgramSkeleton(orphan).every((s) => s.targetFace === null)).toBe(true);
  });

  it('files the centre fire rapid stage under the rapid-fire face', () => {
    const skeleton = buildProgramSkeleton(getProgram('issf-centre-fire-pistol')!);
    expect(skeleton.map((s) => s.targetFace)).toEqual([
      ...Array<string>(7).fill('issf-25m-precision'),
      ...Array<string>(7).fill('issf-25m-rapid-fire'),
    ]);
  });

  it('resolves a series face by position, falling back to the discipline', () => {
    const id = 'issf-centre-fire-pistol';
    expect(seriesTargetFace(id, id, 1)).toBe('issf-25m-precision');
    expect(seriesTargetFace(id, id, 8)).toBe('issf-25m-rapid-fire');
    // the last precision series and the rapid stage's sighter — the stage boundary
    expect(seriesTargetFace(id, id, 7)).toBe('issf-25m-precision');
    // appended past the skeleton, or no program at all
    expect(seriesTargetFace(id, id, 15)).toBe('issf-25m-precision');
    expect(seriesTargetFace(id, null, 8)).toBe('issf-25m-precision');
    expect(seriesTargetFace('spsf-precision', 'spsf-precision', 3)).toBe(
      'spsf-pistol-25m-precision',
    );
    expect(seriesTargetFace('nope', 'nope', 1)).toBeUndefined();
  });

  it('every shipped group face resolves in the target registry', () => {
    for (const program of PROGRAMS) expect(assertProgramFaces(program)).toBe(program);
  });

  it('rejects a group face the registry does not know', () => {
    const typo = programSchema.parse({
      ...milsnabbProgramJson,
      structure: { groups: [{ seriesCount: 1, targetFace: 'spsf-snabb' }] },
    });
    expect(() => assertProgramFaces(typo)).toThrow(
      /Program spsf-milsnabb references unknown target face spsf-snabb/,
    );
    // an inherited prototype key is not a face either
    const proto = programSchema.parse({
      ...milsnabbProgramJson,
      structure: { groups: [{ seriesCount: 1, targetFace: 'toString' }] },
    });
    expect(() => assertProgramFaces(proto)).toThrow(/unknown target face toString/);
  });
});

/**
 * Top-level, so reqstool can match this testcase back to its annotation — see
 * the convention in ADR 0015.
 *
 * @SVCs SVC_DISC_003
 */
it('lays out each group behind its own sighters, on its own face and time', () => {
  const threeGroups = programSchema.parse({
    ...milsnabbProgramJson,
    structure: {
      groups: [
        { seriesCount: 1, timeLimitSeconds: 300, sighterSeries: 1 },
        {
          seriesCount: 1,
          timeLimitSeconds: 15,
          sighterSeries: 1,
          targetFace: 'issf-25m-rapid-fire',
        },
        { seriesCount: 1, targetFace: 'spsf-pistol-25m-precision' },
      ],
    },
  });
  expect(
    buildProgramSkeleton(threeGroups).map((s) => [s.isSighter, s.timeLimitSeconds, s.targetFace]),
  ).toEqual([
    [true, 300, 'spsf-snabbskjutning-25m'],
    [false, 300, 'spsf-snabbskjutning-25m'],
    [true, 15, 'issf-25m-rapid-fire'],
    [false, 15, 'issf-25m-rapid-fire'],
    [false, null, 'spsf-pistol-25m-precision'],
  ]);
});

describe('Nationell helmatch and figurskjutning (SHB Del I)', () => {
  it('both are 5-shot integer rings disciplines in vapengrupp A, B and C (I.2.1, I.4)', () => {
    for (const id of ['spsf-helmatch', 'spsf-figurskjutning']) {
      const discipline = requireDiscipline(id);
      expect(discipline).toMatchObject({
        federation: 'SPSF',
        scoring: 'rings',
        allowsDecimal: false,
        defaultSeriesLength: 5,
      });
      expect(weaponGroupsForDiscipline(id).map((g) => g.id)).toEqual([
        'spsf:A',
        'spsf:B',
        'spsf:C',
      ]);
      expect(shooterClassesForDiscipline(id).length).toBeGreaterThan(0);
      expect(programsForDiscipline(id).map((p) => p.id)).toEqual([id]);
      expect(getProgram(id)).toMatchObject({ scoring: 'integer', supportsFinal: false });
    }
    expect(requireDiscipline('spsf-helmatch').targetFace).toBe('spsf-pistol-25m-precision');
  });
});

/**
 * Top-level, so reqstool can match this testcase back to its annotation — see
 * the convention in ADR 0015.
 *
 * @SVCs SVC_DISC_004
 */
it('lays out helmatch and figurskjutning as SHB I.6.1 shoots them', () => {
  const precision = 'spsf-pistol-25m-precision';
  const rapid = 'spsf-snabbskjutning-25m';
  const figure = 'spsf-helmatch-figurtavla';
  const layout = (id: string) =>
    buildProgramSkeleton(getProgram(id)!).map((s) => [
      s.isSighter,
      s.timeLimitSeconds,
      s.targetFace,
    ]);
  const c = [
    [false, 18, figure],
    [false, 16, figure],
    [false, 14, figure],
    [false, 12, figure],
  ];
  // Sighters before A and B only (I.6.6.2); 4 x 5 shots per delmoment (I.6.1).
  expect(layout('spsf-helmatch')).toEqual([
    [true, 300, precision],
    ...Array(4).fill([false, 300, precision]),
    [true, null, rapid],
    ...Array(4).fill([false, null, rapid]),
    ...c,
  ]);
  expect(layout('spsf-figurskjutning')).toEqual(c);
  const scored = buildProgramSkeleton(getProgram('spsf-helmatch')!).filter((s) => !s.isSighter);
  expect(scored.reduce((n, s) => n + s.shots, 0) * 10).toBe(600);
});

describe('program stages (helmatch delmoment, #476)', () => {
  it('S4: the helmatch skeleton carries A, B and C by position', () => {
    const program = getProgram('spsf-helmatch')!;
    expect(buildProgramSkeleton(program).map((entry) => entry.stage)).toEqual([
      ...Array<string>(5).fill('A'),
      ...Array<string>(5).fill('B'),
      ...Array<string>(4).fill('C'),
    ]);
    expect(programStages(program)).toEqual(['A', 'B', 'C']);
    expect(seriesStage('spsf-helmatch', 1)).toBe('A');
    expect(seriesStage('spsf-helmatch', 6)).toBe('B');
    expect(seriesStage('spsf-helmatch', 14)).toBe('C');
    expect(seriesStage('spsf-helmatch', 15)).toBeNull();
    expect(seriesStage(null, 1)).toBeNull();
    expect(seriesStage('spsf-milsnabb', 2)).toBeNull();
  });

  it('S4: a program without stages lists none', () => {
    expect(programStages(getProgram('spsf-milsnabb')!)).toEqual([]);
    expect(programStages(getProgram('spsf-precision')!)).toEqual([]);
  });

  it('S4: a stage id must not be empty', () => {
    expect(() =>
      programSchema.parse({
        ...milsnabbProgramJson,
        structure: { groups: [{ seriesCount: 1, stage: '' }] },
      }),
    ).toThrow();
  });
});
