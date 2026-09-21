// Discipline and program registry (§6.2 / §6.3). The JSON data files are the
// source of truth; they are validated against the zod schemas at module load,
// so a malformed data file fails at startup rather than at scoring time.
import genericRings from './definitions/generic-rings.json';
import { activeFederations } from '../regulations/registry';
// ISSF and SvSF ship events, not vapengrupper (§6.4a) — every definition
// below has weaponGroups: [] rather than a new "issf group" concept; see
// docs/reference/issf-rules.md and svsf-rules.md.
import issfAirPistolDiscipline from './definitions/issf-air-pistol.json';
import issfCenterFirePistolDiscipline from './definitions/issf-centre-fire-pistol.json';
import issfFreePistolDiscipline from './definitions/issf-free-pistol.json';
import issfRapidFirePistolDiscipline from './definitions/issf-rapid-fire-pistol.json';
import issfSportPistolDiscipline from './definitions/issf-sport-pistol.json';
import issfStandardPistolDiscipline from './definitions/issf-standard-pistol.json';
import spsfFaltDiscipline from './definitions/spsf-falt.json';
import spsfMilsnabbDiscipline from './definitions/spsf-milsnabb.json';
import spsfPrecisionDiscipline from './definitions/spsf-precision.json';
import svsfSnabbluftpistolDiscipline from './definitions/svsf-snabbluftpistol.json';
import issfAirPistolProgram from './programs/issf-air-pistol.json';
import issfCenterFirePistolProgram from './programs/issf-centre-fire-pistol.json';
import issfFreePistolProgram from './programs/issf-free-pistol.json';
import issfRapidFirePistolProgram from './programs/issf-rapid-fire-pistol.json';
import issfSportPistolProgram from './programs/issf-sport-pistol.json';
import issfStandardPistolProgram from './programs/issf-standard-pistol.json';
import spsfMilsnabbProgram from './programs/spsf-milsnabb.json';
import spsfPrecisionProgram from './programs/spsf-precision.json';
import svsfSnabbluftpistolProgram from './programs/svsf-snabbluftpistol.json';
import { GENERIC_SHOOTER_CLASSES, SPSF_SHOOTER_CLASSES, type ShooterClass } from './classes';
import { GENERIC_WEAPON_GROUPS, findWeaponGroup, type WeaponGroup } from './groups';
import { disciplineSchema, programSchema, type Discipline, type Program } from './schema';

export * from './schema';
export * from './groups';
export * from './classes';
export * from './entries';
export * from './eligibility';

export const DISCIPLINES: readonly Discipline[] = [
  spsfPrecisionDiscipline,
  spsfMilsnabbDiscipline,
  // Registered, but not yet enterable: fält scores hits on figures, and the
  // station entry UI is a follow-up on #315. `ringScoringDisciplines` is what
  // keeps it out of the pickers until then.
  spsfFaltDiscipline,
  genericRings,
  issfAirPistolDiscipline,
  issfSportPistolDiscipline,
  issfStandardPistolDiscipline,
  issfRapidFirePistolDiscipline,
  issfFreePistolDiscipline,
  issfCenterFirePistolDiscipline,
  // SvSF's own, after ISSF's: the new-session form lands on the first
  // non-generic discipline, and for an SvSF shooter that should be luftpistol.
  svsfSnabbluftpistolDiscipline,
].map((raw) => disciplineSchema.parse(raw));

export const PROGRAMS: readonly Program[] = [
  spsfPrecisionProgram,
  spsfMilsnabbProgram,
  issfAirPistolProgram,
  issfSportPistolProgram,
  issfStandardPistolProgram,
  issfRapidFirePistolProgram,
  issfFreePistolProgram,
  issfCenterFirePistolProgram,
  svsfSnabbluftpistolProgram,
].map((raw) => programSchema.parse(raw));

/** One series the UI should pre-create for a fixed-format program (§6.3). */
export interface SeriesSkeletonEntry {
  position: number;
  isSighter: boolean;
  isFinal: boolean;
  shots: number;
  timeLimitSeconds: number | null;
}

export interface SessionNameParts {
  /** Localized session type, e.g. 'Training' / 'Tävling'. */
  typeLabel: string;
  dateLabel: string;
}

/**
 * The ring-scored members of a discipline list, in order.
 *
 * Every screen that enters or imports a score assumes a ring value per shot.
 * Fält does not work that way and has no entry UI yet (#315), so the pickers
 * filter through this rather than the registry — and stop filtering by
 * deleting the call, once there is something to offer.
 */
export function ringScoringDisciplines(
  list: readonly Discipline[] = DISCIPLINES,
): readonly Discipline[] {
  return list.filter((discipline) => discipline.scoring === 'rings');
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

/**
 * Resolves federation-scoped group ids to definitions. A data file naming a
 * group that does not exist is a packaging bug, not a runtime condition —
 * it throws rather than silently offering a shorter picker.
 */
export function resolveWeaponGroupIds(
  ids: readonly string[],
  context: string,
): readonly WeaponGroup[] {
  return ids.map((id) => {
    const group = findWeaponGroup(id);
    if (!group) throw new Error(`${context} references unknown weapon group ${id}`);
    return group;
  });
}

/** Vapengrupper valid for a discipline, in the data file's order. */
export function weaponGroupsForDiscipline(disciplineId: string): readonly WeaponGroup[] {
  const discipline = requireDiscipline(disciplineId);
  return resolveWeaponGroupIds(discipline.weaponGroups, `Discipline ${disciplineId}`);
}

/**
 * Vapengrupper a session could actually be logged under — the union of every
 * implemented discipline's groups, plus the generic ones, which are appended
 * explicitly because no discipline declares them.
 *
 * `SPSF_WEAPON_GROUPS` is the full SHB taxonomy, which is wider than what v1
 * implements: the magnum groups M1-M9 belong to Magnumprecision (SHB Part G),
 * a discipline this app does not have yet, so offering them on the firearm
 * form promises a session the user cannot then create. Deriving the list from
 * `DISCIPLINES` rather than hard-coding an exclusion means they reappear on
 * their own the moment a discipline declares them — nobody has to remember.
 */
export function selectableWeaponGroups(): readonly WeaponGroup[] {
  const seen = new Set<string>();
  const groups: WeaponGroup[] = [];
  const add = (group: WeaponGroup): void => {
    if (seen.has(group.id)) return;
    seen.add(group.id);
    groups.push(group);
  };
  for (const discipline of DISCIPLINES) {
    for (const group of resolveWeaponGroupIds(
      discipline.weaponGroups,
      `Discipline ${discipline.id}`,
    )) {
      add(group);
    }
  }
  // Explicitly, not via a discipline. The generic groups belong to the firearm
  // rather than to any discipline's rules, and deriving them from DISCIPLINES
  // made `generic:airgun` vanish from the firearm form the moment the practice
  // discipline stopped declaring it — taking the firearms already assigned to
  // it with it.
  for (const group of GENERIC_WEAPON_GROUPS) {
    add(group);
  }
  return groups;
}

/**
 * The disciplines a shooter should be offered, given the regulations they have
 * enabled (ADR 0011).
 *
 * Filtering is silent — the discipline list simply contains what applies, and
 * the regulation is implied by the discipline rather than being a separate
 * step when creating a session (maintainer, 2026-09-12).
 *
 * `generic` disciplines survive every filter: practice against a ring target
 * belongs to no federation, so a shooter with everything switched off still
 * has something to log.
 */
export function disciplinesForRegulations(
  enabledRegulationIds: readonly string[],
): readonly Discipline[] {
  const federations = new Set(activeFederations(enabledRegulationIds));
  return DISCIPLINES.filter((discipline) => federations.has(discipline.federation));
}

/** Vapengrupper reachable through the enabled regulations' disciplines. */
export function weaponGroupsForRegulations(
  enabledRegulationIds: readonly string[],
): readonly WeaponGroup[] {
  const seen = new Set<string>();
  const groups: WeaponGroup[] = [];
  for (const discipline of disciplinesForRegulations(enabledRegulationIds)) {
    for (const group of resolveWeaponGroupIds(
      discipline.weaponGroups,
      `Discipline ${discipline.id}`,
    )) {
      if (seen.has(group.id)) continue;
      seen.add(group.id);
      groups.push(group);
    }
  }
  return groups;
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
 * Default session name: `<type> — <local date>`, e.g. "Training — 9 Sep 2026".
 * Labels arrive already localized from the UI. Competitions carry their own
 * Competition Name field, so this stays the same shape for both types.
 */
export function defaultSessionName(parts: SessionNameParts): string {
  return [parts.typeLabel.trim(), parts.dateLabel.trim()].filter(Boolean).join(' — ');
}
