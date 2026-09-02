// Tag and session-name interpretation (docs/specs/shotlog-import-spec.md §3).
// ShotLog has no discipline, weapon-group or firearm field: all three live in
// free-text tags or in the tail of the session name. Everything here produces
// a *suggestion* the user edits — nothing is applied silently.
import type { ShotlogFirearm, ShotlogWarning } from './types';

export interface TagClassification {
  sessionType: 'training' | 'competition';
  disciplineId: string | null;
  includesWarmup: boolean;
  hasFinal: boolean;
  dnf: boolean;
  /** From the `A Opt` tag (VERIFY, spec §1.1). */
  weaponGroupHint: string | null;
  firearmMatch: ShotlogFirearm | null;
  /** Tags kept verbatim as ShotLedger tags. */
  passthroughTags: string[];
  warnings: ShotlogWarning[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, ' ');
}

const COMPETITION_TAG = 'tävling';
const WARMUP_TAG = 'warmup';
const FINAL_TAG = 'final';
const DNF_TAG = 'dnf';
const A_OPT_TAG = 'a opt';

const DISCIPLINE_TAGS: Record<string, string> = {
  precision: 'spsf-precision',
  milsnabb: 'spsf-milsnabb',
};

/**
 * Splits ShotLog's `|`-separated tag list into the structured fields it
 * encodes plus the leftovers. A vocabulary tag is consumed — it never also
 * becomes a passthrough tag.
 */
export function classifyTags(
  tags: readonly string[],
  knownFirearms: readonly ShotlogFirearm[] = [],
): TagClassification {
  const warnings: ShotlogWarning[] = [];
  const passthroughTags: string[] = [];
  const disciplineIds: string[] = [];
  const firearmMatches: ShotlogFirearm[] = [];

  let sessionType: 'training' | 'competition' = 'training';
  let includesWarmup = false;
  let hasFinal = false;
  let dnf = false;
  let weaponGroupHint: string | null = null;

  for (const tag of tags) {
    const key = normalize(tag);
    if (key === COMPETITION_TAG) {
      sessionType = 'competition';
      continue;
    }
    const discipline = DISCIPLINE_TAGS[key];
    if (discipline !== undefined) {
      if (!disciplineIds.includes(discipline)) disciplineIds.push(discipline);
      continue;
    }
    if (key === WARMUP_TAG) {
      includesWarmup = true;
      continue;
    }
    if (key === FINAL_TAG) {
      hasFinal = true;
      continue;
    }
    if (key === DNF_TAG) {
      dnf = true;
      continue;
    }
    if (key === A_OPT_TAG) {
      weaponGroupHint = 'spsf:A-opt';
      continue;
    }
    const matched = knownFirearms.filter((candidate) => normalize(candidate.label) === key);
    if (matched.length > 0) {
      for (const firearm of matched) {
        if (!firearmMatches.some((match) => match.id === firearm.id)) firearmMatches.push(firearm);
      }
      continue;
    }
    passthroughTags.push(tag.trim());
  }

  if (disciplineIds.length > 1) warnings.push('conflicting-discipline-tags');
  if (firearmMatches.length > 1) warnings.push('ambiguous-firearm-tag');

  return {
    sessionType,
    disciplineId: disciplineIds.length === 1 ? disciplineIds[0]! : null,
    includesWarmup,
    hasFinal,
    dnf,
    weaponGroupHint,
    firearmMatch: firearmMatches.length === 1 ? firearmMatches[0]! : null,
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

/** Keyword fallback used only when no discipline tag is present (§3). */
export function suggestDisciplineFromName(name: string): string | null {
  const key = normalize(name);
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
