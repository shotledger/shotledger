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
import spsfFigurskjutningDiscipline from './definitions/spsf-figurskjutning.json';
import spsfHelmatchDiscipline from './definitions/spsf-helmatch.json';
import spsfMagnumprecisionDiscipline from './definitions/spsf-magnumprecision.json';
import spsfMilsnabbDiscipline from './definitions/spsf-milsnabb.json';
import spsfPrecisionDiscipline from './definitions/spsf-precision.json';
import svsfSnabbluftpistolDiscipline from './definitions/svsf-snabbluftpistol.json';
import issfAirPistolProgram from './programs/issf-air-pistol.json';
import issfCenterFirePistolProgram from './programs/issf-centre-fire-pistol.json';
import issfFreePistolProgram from './programs/issf-free-pistol.json';
import issfRapidFirePistolProgram from './programs/issf-rapid-fire-pistol.json';
import issfSportPistolProgram from './programs/issf-sport-pistol.json';
import issfStandardPistolProgram from './programs/issf-standard-pistol.json';
import spsfFigurskjutningProgram from './programs/spsf-figurskjutning.json';
import spsfHelmatchProgram from './programs/spsf-helmatch.json';
import spsfMagnumprecisionProgram from './programs/spsf-magnumprecision.json';
import spsfMilsnabbProgram from './programs/spsf-milsnabb.json';
import spsfPrecisionProgram from './programs/spsf-precision.json';
import svsfSnabbluftpistolProgram from './programs/svsf-snabbluftpistol.json';
import { GENERIC_SHOOTER_CLASSES, SPSF_SHOOTER_CLASSES, type ShooterClass } from './classes';
import { GENERIC_WEAPON_GROUPS, findWeaponGroup, type WeaponGroup } from './groups';
import { isKnownTargetFace } from '../target-scoring/targets';
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
  spsfMagnumprecisionDiscipline,
  spsfHelmatchDiscipline,
  spsfFigurskjutningDiscipline,
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
  spsfMagnumprecisionProgram,
  spsfHelmatchProgram,
  spsfFigurskjutningProgram,
  issfAirPistolProgram,
  issfSportPistolProgram,
  issfStandardPistolProgram,
  issfRapidFirePistolProgram,
  issfFreePistolProgram,
  issfCenterFirePistolProgram,
  svsfSnabbluftpistolProgram,
].map((raw) => assertProgramFaces(programSchema.parse(raw)));

/**
 * A group's face override must name a face the app knows; a typo would
 * otherwise surface as a series silently scored against the discipline's face.
 */
export function assertProgramFaces(program: Program): Program {
  for (const group of program.structure?.groups ?? []) {
    if (group.targetFace !== undefined && !isKnownTargetFace(group.targetFace)) {
      throw new Error(`Program ${program.id} references unknown target face ${group.targetFace}`);
    }
  }
  return program;
}

/** One series the UI should pre-create for a fixed-format program (§6.3). */
export interface SeriesSkeletonEntry {
  position: number;
  isSighter: boolean;
  isFinal: boolean;
  shots: number;
  timeLimitSeconds: number | null;
  /** The group's face, else the discipline's; null for a discipline without one. */
  targetFace: string | null;
  /** The group's stage (helmatch delmoment), null when it names none. */
  stage: string | null;
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

/**
 * A discipline's `defaultSeriesLength` — what a total-only series with no
 * stored shot count counts as (`totalOnlyShotCount`). An id this build does
 * not know (synced from a newer one) gets 5, as a new session would.
 */
export function disciplineSeriesLength(disciplineId: string): number {
  return getDiscipline(disciplineId)?.defaultSeriesLength ?? 5;
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
 * `SPSF_WEAPON_GROUPS` is the full SHB taxonomy, which stays wider than what
 * the app implements: offering a group on the firearm form promises a session
 * the user can then create. Deriving the list from `DISCIPLINES` rather than
 * hard-coding an exclusion is what made the magnum groups M1-M9 reappear on
 * their own when Magnumprecision (SHB Del G) shipped — nobody had to remember.
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
 * enabled (REGULATIONS.md § Regelverk).
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

/**
 * SPSF disciplines that have no klassindelning at all. Magnumprecision is one:
 * "I magnumprecision tillämpas ingen klassindelning" (SHB G.2.1 p. 193) — a
 * start is in a vapengrupp only, which is also why C.5.1.1.5 computes its
 * standardmedalj vapengruppsvis rather than per klass.
 */
const CLASSLESS_DISCIPLINE_IDS: ReadonlySet<string> = new Set(['spsf-magnumprecision']);

export function shooterClassesForDiscipline(disciplineId: string): readonly ShooterClass[] {
  const discipline = requireDiscipline(disciplineId);
  if (CLASSLESS_DISCIPLINE_IDS.has(discipline.id)) return GENERIC_SHOOTER_CLASSES;
  return discipline.federation === 'SPSF' ? SPSF_SHOOTER_CLASSES : GENERIC_SHOOTER_CLASSES;
}

/**
 * The series a fixed-format program pre-creates. Freeform programs (and free
 * training) return [] — series counts are never fixed there (§6.3).
 * A group's sighters come first and share its time limit and face: the
 * milsnabb provserie is shot at omgång 1's 10 s (SHB J.6.6.2).
 *
 * @Requirements DISC_003, DISC_004
 */
export function buildProgramSkeleton(program: Program): readonly SeriesSkeletonEntry[] {
  const { structure } = program;
  if (!structure) return [];

  const disciplineFace = getDiscipline(program.disciplineId)?.targetFace ?? null;
  const entries: SeriesSkeletonEntry[] = [];
  for (const group of structure.groups) {
    const shared = {
      isFinal: false,
      shots: program.shotsPerSeries,
      timeLimitSeconds: group.timeLimitSeconds ?? null,
      targetFace: group.targetFace ?? disciplineFace,
      stage: group.stage ?? null,
    };
    for (let i = 0; i < (group.sighterSeries ?? 0); i += 1) {
      entries.push({ position: entries.length + 1, isSighter: true, ...shared });
    }
    for (let i = 0; i < group.seriesCount; i += 1) {
      entries.push({ position: entries.length + 1, isSighter: false, ...shared });
    }
  }

  return entries;
}

/** Sighter series a fixed-format program lays out, across all its groups. */
export function programSighterCount(program: Program): number {
  return (program.structure?.groups ?? []).reduce(
    (total, group) => total + (group.sighterSeries ?? 0),
    0,
  );
}

/** A program's stages in group order, each once; empty when it names none. */
export function programStages(program: Program): string[] {
  const stages: string[] = [];
  for (const group of program.structure?.groups ?? []) {
    if (group.stage !== undefined && !stages.includes(group.stage)) stages.push(group.stage);
  }
  return stages;
}

/** The stage a series belongs to, by position, as its face and time limit are. */
export function seriesStage(programId: string | null, position: number): string | null {
  const program = programId ? getProgram(programId) : undefined;
  const entry = program ? buildProgramSkeleton(program)[position - 1] : undefined;
  return entry?.stage ?? null;
}

/**
 * The face a series is shot against. A fixed-format program's series resolves
 * its group by position; any other series — freeform, or appended past the
 * skeleton — is on the discipline's face.
 */
export function seriesTargetFace(
  disciplineId: string,
  programId: string | null,
  position: number,
): string | undefined {
  const program = programId ? getProgram(programId) : undefined;
  const entry = program ? buildProgramSkeleton(program)[position - 1] : undefined;
  return entry?.targetFace ?? getDiscipline(disciplineId)?.targetFace;
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
