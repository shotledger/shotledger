// Discipline and program registry (§6.2 / §6.3). The JSON data files are the
// source of truth; they are validated against the zod schemas at module load,
// so a malformed data file fails at startup rather than at scoring time.
import genericRings from './definitions/generic-rings.json';
import spsfMilsnabbDiscipline from './definitions/spsf-milsnabb.json';
import spsfPrecisionDiscipline from './definitions/spsf-precision.json';
import spsfMilsnabbProgram from './programs/spsf-milsnabb.json';
import spsfPrecisionProgram from './programs/spsf-precision.json';
import { GENERIC_SHOOTER_CLASSES, SPSF_SHOOTER_CLASSES, type ShooterClass } from './classes';
import { findWeaponGroup, type WeaponGroup } from './groups';
import { disciplineSchema, programSchema, type Discipline, type Program } from './schema';

export * from './schema';
export * from './groups';
export * from './classes';

export const DISCIPLINES: readonly Discipline[] = [
  spsfPrecisionDiscipline,
  spsfMilsnabbDiscipline,
  genericRings,
].map((raw) => disciplineSchema.parse(raw));

export const PROGRAMS: readonly Program[] = [spsfPrecisionProgram, spsfMilsnabbProgram].map((raw) =>
  programSchema.parse(raw),
);

/** One series the UI should pre-create for a fixed-format program (§6.3). */
export interface SeriesSkeletonEntry {
  position: number;
  isSighter: boolean;
  isFinal: boolean;
  shots: number;
  timeLimitSeconds: number | null;
}

export interface CompetitionNameParts {
  kind: 'competition';
  /** Localized level label, already including the mästerskap flag (e.g. 'KM'). */
  levelLabel: string;
  programLabel?: string | null;
  weaponGroupCode?: string | null;
}

export interface TrainingNameParts {
  kind: 'training';
  disciplineLabel: string;
  dateLabel: string;
}

export function getDiscipline(id: string): Discipline | undefined {
  return DISCIPLINES.find((discipline) => discipline.id === id);
}

export function requireDiscipline(id: string): Discipline {
  const discipline = getDiscipline(id);
  if (!discipline) throw new Error(`Unknown discipline: ${id}`);
  return discipline;
}

export function getProgram(id: string): Program | undefined {
  return PROGRAMS.find((program) => program.id === id);
}

/** Programs offered for a discipline. Free training is the ABSENCE of one. */
export function programsForDiscipline(disciplineId: string): readonly Program[] {
  return PROGRAMS.filter((program) => program.disciplineId === disciplineId);
}

/** Vapengrupper valid for a discipline, in the data file's order. */
export function weaponGroupsForDiscipline(disciplineId: string): readonly WeaponGroup[] {
  return requireDiscipline(disciplineId).weaponGroups.map((id) => {
    const group = findWeaponGroup(id);
    if (!group) throw new Error(`Discipline ${disciplineId} references unknown weapon group ${id}`);
    return group;
  });
}

export function shooterClassesForDiscipline(disciplineId: string): readonly ShooterClass[] {
  return requireDiscipline(disciplineId).federation === 'SPSF'
    ? SPSF_SHOOTER_CLASSES
    : GENERIC_SHOOTER_CLASSES;
}

/**
 * The series a fixed-format program pre-creates. Freeform programs (and free
 * training) return [] — series counts are never fixed there (§6.3).
 * The provserie's time limit is omgång 1's (SHB J.6.6.2: 5 shots at 10 s),
 * which is why the structure schema needs no separate field for it.
 */
export function buildProgramSkeleton(program: Program): readonly SeriesSkeletonEntry[] {
  const { structure } = program;
  if (!structure) return [];

  const entries: SeriesSkeletonEntry[] = [];
  const firstGroupLimit = structure.groups[0]?.timeLimitSeconds ?? null;

  for (let i = 0; i < structure.sighterSeries; i += 1) {
    entries.push({
      position: entries.length + 1,
      isSighter: true,
      isFinal: false,
      shots: program.shotsPerSeries,
      timeLimitSeconds: firstGroupLimit,
    });
  }

  for (const group of structure.groups) {
    for (let i = 0; i < group.seriesCount; i += 1) {
      entries.push({
        position: entries.length + 1,
        isSighter: false,
        isFinal: false,
        shots: program.shotsPerSeries,
        timeLimitSeconds: group.timeLimitSeconds ?? null,
      });
    }
  }

  return entries;
}

/**
 * Whether the new-session form may offer the decimal toggle: only when the
 * discipline allows decimals AND no program fixes the mode (§4 M3).
 */
export function decimalAllowed(discipline: Discipline, program: Program | null): boolean {
  return discipline.allowsDecimal && program === null;
}

/** The scoring mode a session actually uses. A program always wins. */
export function scoringModeFor(
  discipline: Discipline,
  program: Program | null,
  decimalPreferred: boolean,
): 'integer' | 'decimal' {
  if (program) return program.scoring;
  return decimalAllowed(discipline, program) && decimalPreferred ? 'decimal' : 'integer';
}

/**
 * Default session name (§6.3): `<level> <program> <vapengrupp>` for
 * competitions (e.g. "KM Precision C"), `<discipline> — <local date>` for
 * training. Labels arrive already localized from the UI.
 */
export function defaultSessionName(parts: CompetitionNameParts | TrainingNameParts): string {
  if (parts.kind === 'competition') {
    return [parts.levelLabel, parts.programLabel, parts.weaponGroupCode]
      .map((part) => part?.trim() ?? '')
      .filter(Boolean)
      .join(' ');
  }
  return [parts.disciplineLabel.trim(), parts.dateLabel.trim()].filter(Boolean).join(' — ');
}
