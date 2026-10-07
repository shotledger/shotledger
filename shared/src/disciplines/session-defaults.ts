// New-session defaults shared by the phone's form and the web's Enter Series
// page, so the two cannot drift (docs/specs/web-series-entry-spec.md C8).
import { disciplinesForRegulations, programsForDiscipline } from './index';

/**
 * A competition is the case the fixed format exists for, so it preselects it
 * (#348); training starts free (null). Both are overridable.
 */
export function defaultProgramFor(
  type: 'training' | 'competition',
  disciplineId: string,
): string | null {
  if (type !== 'competition') return null;
  return programsForDiscipline(disciplineId)[0]?.id ?? null;
}

/**
 * The discipline to land on when a regelverk is picked: the first that
 * belongs to a federation at all. Generic disciplines survive every filter
 * and sort first, so without this a shooter choosing SvSF would land on free
 * training against a ring target. Not "the regelverk's OWN federation":
 * SvSF's own discipline is snabbluftpistol, and the shooter who enabled SvSF
 * is far more likely shooting luftpistol — an ISSF definition, listed first.
 */
export function firstDisciplineFor(regulationId: string): string | undefined {
  const available = disciplinesForRegulations([regulationId]);
  return (available.find((d) => d.federation !== 'generic') ?? available[0])?.id;
}

/** One live `firearm_groups` row of a firearm. */
export interface FirearmGroupLink {
  groupId: string;
  isDefaultForGroup: number;
}

/**
 * The vapengrupp a training session takes from the gun instead of asking for
 * it (maintainer, 2026-09-13). Never nulled where it can be derived:
 * `goldSeriesThreshold` reads it, and practice series count towards the märke.
 *
 * `isDefaultForGroup` marks the go-to firearm FOR a group, not the primary
 * group OF a firearm, so it only breaks a tie. When it cannot, this returns
 * null and the caller asks rather than guessing.
 */
export function derivedWeaponGroup(links: readonly FirearmGroupLink[]): string | null {
  if (links.length === 1) return links[0]!.groupId;
  const marked = links.filter((link) => link.isDefaultForGroup === 1);
  return marked.length === 1 ? marked[0]!.groupId : null;
}
