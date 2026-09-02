// ShotLog tag vocabulary (docs/specs/shotlog-import-spec.md §3).
//
// ShotLog has no discipline, weapon-group or firearm field: a user encodes
// all of it in one free-text `|`-separated tag list, in whatever personal
// convention they settled on. Nothing here may hard-code one person's
// convention — the defaults below are generic SPSF vocabulary, derived from
// `shared/src/disciplines` wherever a registry exists, and every one of them
// is only a DEFAULT the user overrides on the import screen before anything
// is written.
import { DISCIPLINES, SPSF_WEAPON_GROUPS } from '../disciplines';
import type { ShotlogRow, ShotlogTagRole, ShotlogTagMapping, ShotlogTagUsage } from './types';

/** Case- and whitespace-insensitive tag key. */
export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/gu, ' ');
}

// Swedish/English abbreviations that no registry carries but every SPSF
// shooter writes. Kept deliberately short: a guess the user can override,
// not a vocabulary.
const DISCIPLINE_ALIASES: Record<string, string> = {
  milsnabb: 'spsf-milsnabb',
  mil: 'spsf-milsnabb',
  prec: 'spsf-precision',
};

const COMPETITION_TAGS = new Set(['tävling', 'tavling', 'competition', 'comp']);
const SIGHTER_TAGS = new Set(['warmup', 'warm up', 'uppvärmning', 'provskott', 'sighter']);
const FINAL_TAGS = new Set(['final', 'finals']);
const DNF_TAGS = new Set(['dnf', 'ej fullföljt']);

/** A weapon-group code with an optional trailing shooter class, e.g. `C1`. */
const GROUP_WITH_CLASS = /^(.+?)\s*([123])$/u;

function matchDiscipline(key: string): string | null {
  for (const discipline of DISCIPLINES) {
    if (normalizeTag(discipline.name.sv) === key || normalizeTag(discipline.name.en) === key) {
      return discipline.id;
    }
  }
  return DISCIPLINE_ALIASES[key] ?? null;
}

/** `a opt` and `a-opt` both name the group whose registry code is `A-opt`. */
function matchWeaponGroupCode(key: string): string | null {
  // Every separator is dropped one at a time; a `+` quantifier here would be
  // an equivalent mutant, since a global replace already removes them all.
  const collapsed = key.replace(/[\s-]/gu, '');
  for (const group of SPSF_WEAPON_GROUPS) {
    if (group.code.toLowerCase().replace(/-/gu, '') === collapsed) return group.id;
  }
  return null;
}

/**
 * The generic guess for one tag. Everything unrecognised is guessed as a
 * firearm name, because that is the only field ShotLog has no column for at
 * all — the user demotes it to `ignore` on the import screen when it is not.
 */
export function defaultTagRole(tag: string): ShotlogTagRole {
  const key = normalizeTag(tag);
  if (key === '') return { kind: 'ignore' };

  const disciplineId = matchDiscipline(key);
  if (disciplineId !== null) return { kind: 'discipline', disciplineId };

  if (COMPETITION_TAGS.has(key)) return { kind: 'competition' };
  if (SIGHTER_TAGS.has(key)) return { kind: 'sighter' };
  if (FINAL_TAGS.has(key)) return { kind: 'final' };
  if (DNF_TAGS.has(key)) return { kind: 'dnf' };

  const bare = matchWeaponGroupCode(key);
  if (bare !== null) return { kind: 'weapon-group', weaponGroup: bare, shooterClass: null };

  const withClass = GROUP_WITH_CLASS.exec(key);
  if (withClass) {
    const grouped = matchWeaponGroupCode(withClass[1]!);
    if (grouped !== null) {
      return { kind: 'weapon-group', weaponGroup: grouped, shooterClass: withClass[2]! };
    }
  }

  return { kind: 'firearm', label: tag.trim() };
}

/**
 * Every distinct tag in the file with how often it occurs, most frequent
 * first (ties alphabetical) so the mapping screen leads with the tags that
 * decide the most rows.
 */
export function collectShotlogTags(rows: readonly ShotlogRow[]): ShotlogTagUsage[] {
  const seen = new Map<string, ShotlogTagUsage>();
  for (const row of rows) {
    for (const tag of row.tags) {
      const key = normalizeTag(tag);
      if (key === '') continue;
      const existing = seen.get(key);
      if (existing) existing.count += 1;
      else seen.set(key, { key, label: tag.trim(), count: 1 });
    }
  }
  return [...seen.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** The starting mapping the user then edits: one default role per tag. */
export function buildDefaultTagMapping(rows: readonly ShotlogRow[]): ShotlogTagMapping {
  const mapping: ShotlogTagMapping = {};
  for (const usage of collectShotlogTags(rows)) {
    mapping[usage.key] = defaultTagRole(usage.label);
  }
  return mapping;
}
