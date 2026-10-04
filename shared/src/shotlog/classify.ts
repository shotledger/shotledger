// Turning one row's tags and name into a suggestion
// (docs/specs/shotlog-import-spec.md §3).
//
// The tag vocabulary itself is NOT decided here — `tags.ts` proposes a role
// per tag and the user confirms it on the import screen. This module only
// applies whatever mapping it is handed, plus the two fallbacks that read the
// session NAME when the tags said nothing.
import type { ShotlogFirearm, ShotlogTagMapping, ShotlogTagRole, ShotlogWarning } from './types';
import { normalizeTag } from './tags';

export interface TagClassification {
  sessionType: 'training' | 'competition';
  disciplineId: string | null;
  includesSighter: boolean;
  hasFinal: boolean;
  dnf: boolean;
  weaponGroup: string | null;
  shooterClass: string | null;
  firearmMatch: ShotlogFirearm | null;
  /** Firearm named by a tag that matches no existing firearm. */
  firearmLabel: string | null;
  /** Tags the mapping left as `ignore` — kept verbatim as ShotLedger tags. */
  passthroughTags: string[];
  warnings: ShotlogWarning[];
}

function matchFirearm(
  label: string,
  knownFirearms: readonly ShotlogFirearm[],
): ShotlogFirearm | null {
  const key = normalizeTag(label);
  const matches = knownFirearms.filter((candidate) => normalizeTag(candidate.label) === key);
  return matches.length === 1 ? matches[0]! : null;
}

/**
 * Applies a confirmed tag mapping to one row's tags. A tag with no entry in
 * the mapping is passed through as an ordinary ShotLedger tag rather than
 * guessed at — the mapping is the contract, and building it is the screen's
 * job.
 */
export function classifyTags(
  tags: readonly string[],
  mapping: ShotlogTagMapping = {},
  knownFirearms: readonly ShotlogFirearm[] = [],
): TagClassification {
  const warnings: ShotlogWarning[] = [];
  const passthroughTags: string[] = [];
  const disciplineIds: string[] = [];
  const groups: { weaponGroup: string; shooterClass: string | null }[] = [];
  const firearmLabels: string[] = [];

  let sessionType: 'training' | 'competition' = 'training';
  let includesSighter = false;
  let hasFinal = false;
  let dnf = false;

  for (const tag of tags) {
    const role: ShotlogTagRole | undefined = mapping[normalizeTag(tag)];
    if (role === undefined || role.kind === 'ignore') {
      passthroughTags.push(tag.trim());
      continue;
    }
    switch (role.kind) {
      case 'discipline':
        if (!disciplineIds.includes(role.disciplineId)) disciplineIds.push(role.disciplineId);
        break;
      case 'competition':
        sessionType = 'competition';
        break;
      case 'sighter':
        includesSighter = true;
        break;
      case 'final':
        hasFinal = true;
        break;
      case 'dnf':
        dnf = true;
        break;
      case 'weapon-group':
        if (!groups.some((group) => group.weaponGroup === role.weaponGroup)) {
          groups.push({ weaponGroup: role.weaponGroup, shooterClass: role.shooterClass });
        }
        break;
      case 'firearm':
        if (!firearmLabels.includes(role.label)) firearmLabels.push(role.label);
        break;
    }
  }

  if (disciplineIds.length > 1) warnings.push('conflicting-discipline-tags');
  if (groups.length > 1) warnings.push('conflicting-weapon-group-tags');
  if (firearmLabels.length > 1) warnings.push('ambiguous-firearm-tag');

  const group = groups.length === 1 ? groups[0]! : null;
  const firearmLabel = firearmLabels.length === 1 ? firearmLabels[0]! : null;

  return {
    sessionType,
    disciplineId: disciplineIds.length === 1 ? disciplineIds[0]! : null,
    includesSighter,
    hasFinal,
    dnf,
    weaponGroup: group?.weaponGroup ?? null,
    shooterClass: group?.shooterClass ?? null,
    firearmMatch: firearmLabel === null ? null : matchFirearm(firearmLabel, knownFirearms),
    firearmLabel,
    passthroughTags,
    warnings,
  };
}

// Milsnabb first: a name carrying both families' keywords resolves to the
// more specific one rather than to whichever pattern happens to be listed
// earlier.
const NAME_DISCIPLINE_PATTERNS: readonly { pattern: RegExp; disciplineId: string }[] = [
  { pattern: /\bms\d*\b/u, disciplineId: 'spsf-milsnabb' },
  { pattern: /milsnabb/u, disciplineId: 'spsf-milsnabb' },
  { pattern: /\bp\d\b/u, disciplineId: 'spsf-precision' },
  { pattern: /\bkp\d?\b/u, disciplineId: 'spsf-precision' },
  { pattern: /precision/u, disciplineId: 'spsf-precision' },
  { pattern: /\bprec\b/u, disciplineId: 'spsf-precision' },
];

/** Keyword fallback used only when no tag resolved the discipline (§3). */
export function suggestDisciplineFromName(name: string): string | null {
  const key = normalizeTag(name);
  for (const { pattern, disciplineId } of NAME_DISCIPLINE_PATTERNS) {
    if (pattern.test(key)) return disciplineId;
  }
  return null;
}

export interface WeaponGroupSuggestion {
  weaponGroup: string;
  shooterClass: string | null;
}

// The group is the whole final token: anchored at the end, and preceded by a
// space or the start of the name so `B/R` and `AA` are not read as a group.
const GROUP_TAIL_PATTERN = /(?:^|\s)([ABCR])([123])?$/u;

/**
 * The weapon group is conventionally the last token of a ShotLog session
 * name (`… C`, `… C1`). Ambiguous forms (`B/R`) return `null` rather than
 * picking one — spsf-domain rule: never guess a group.
 */
export function suggestWeaponGroupFromName(name: string): WeaponGroupSuggestion | null {
  const match = GROUP_TAIL_PATTERN.exec(name.trim().toUpperCase());
  if (!match) return null;
  return { weaponGroup: `spsf:${match[1]!}`, shooterClass: match[2] ?? null };
}
