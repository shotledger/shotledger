// Duplicate matching and field-level merge classification (spec §5, v2 spec
// §A.2/§A.3). Two tiers, never silent: an exact (`external_source`,
// `external_ref`) match short-circuits to merge; heuristic candidates are always surfaced for user
// confirmation, never auto-merged.

import { localDayOf } from '../../dates';

// --- §5.1 external ref -------------------------------------------------------

export function buildExternalRef(
  competitionId: number | string,
  signupId: number | string,
): string {
  return `${competitionId}:${signupId}`;
}

// --- §5.2 exact match ---------------------------------------------------------

export interface ExactMatchSessionInput {
  id: string;
  externalSource: string | null;
  externalRef: string | null;
}

export function findExactMatch<T extends ExactMatchSessionInput>(
  existingSessions: readonly T[],
  externalRef: string,
): T | null {
  // The ref carries no source prefix (#727): the source column keeps a
  // Webshooter ref from ever matching a ShotLog one.
  return (
    existingSessions.find(
      (session) => session.externalSource === 'webshooter' && session.externalRef === externalRef,
    ) ?? null
  );
}

// --- §5.3 heuristic match ------------------------------------------------------

export interface HeuristicSessionInput {
  id: string;
  externalRef: string | null;
  /** The session's stored UTC instant; matched on the local day it falls on. */
  startedAt: string;
  eventName: string;
  weaponGroup: string;
}

export interface HeuristicCandidateInput {
  /** The competition's `YYYY-MM-DD` day; a trailing time is ignored. */
  date: string;
  eventName: string;
  weaponGroup: string;
}

export interface HeuristicMatchOptions {
  /** Default 0.6 — deliberately loose since matches only ever surface a confirm/decline prompt. */
  minNameSimilarity?: number;
}

const DEFAULT_MIN_NAME_SIMILARITY = 0.6;

function normalizeForSimilarity(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, ' ');
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distances: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) distances[i]![0] = i;
  for (let j = 0; j < cols; j += 1) distances[0]![j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      distances[i]![j] = Math.min(
        distances[i - 1]![j]! + 1,
        distances[i]![j - 1]! + 1,
        distances[i - 1]![j - 1]! + cost,
      );
    }
  }
  return distances[rows - 1]![cols - 1]!;
}

/**
 * `[0,1]` similarity via normalized Levenshtein edit distance (spec §5.3):
 * chosen over token-set/n-gram approaches because competition names are
 * short one-line strings and a typo/abbreviation is exactly what edit
 * distance catches.
 */
export function nameSimilarity(a: string, b: string): number {
  const normalizedA = normalizeForSimilarity(a);
  const normalizedB = normalizeForSimilarity(b);
  const maxLength = Math.max(normalizedA.length, normalizedB.length, 1);
  return 1 - levenshteinDistance(normalizedA, normalizedB) / maxLength;
}

/**
 * Sessions with no `externalRef` (heuristic only applies to pre-feature
 * manual sessions, §A.2), matching calendar day + weapon group exactly and
 * event name above the similarity threshold. Never auto-merges — the caller
 * always surfaces these as a confirm/decline prompt.
 */
export function findHeuristicCandidates<T extends HeuristicSessionInput>(
  existingSessions: readonly T[],
  candidate: HeuristicCandidateInput,
  options: HeuristicMatchOptions = {},
): T[] {
  const minNameSimilarity = options.minNameSimilarity ?? DEFAULT_MIN_NAME_SIMILARITY;
  const candidateDay = candidate.date.slice(0, 10);

  return existingSessions.filter((session) => {
    if (session.externalRef !== null) return false;
    if (localDayOf(session.startedAt) !== candidateDay) return false;
    if (session.weaponGroup !== candidate.weaponGroup) return false;
    return nameSimilarity(session.eventName, candidate.eventName) >= minNameSimilarity;
  });
}

// --- §5.4 field-level merge -----------------------------------------------------

export const SCORE_BEARING_FIELDS = [
  'seriesOverrides',
  'officialPlacement',
  'officialStandardMedal',
  'competitionName',
  'competitionDate',
] as const;

export const ENRICHMENT_FIELDS = [
  'firearmId',
  'ammoLotId',
  'notes',
  'seriesPhotoUri',
  'tags',
] as const;

export type MergeFieldClass = 'score' | 'enrichment' | 'unknown';

export function classifyMergeField(field: string): MergeFieldClass {
  if ((SCORE_BEARING_FIELDS as readonly string[]).includes(field)) return 'score';
  if ((ENRICHMENT_FIELDS as readonly string[]).includes(field)) return 'enrichment';
  return 'unknown';
}

function isEmptyEnrichmentValue(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

export interface MergeSessionFieldsResult<T> {
  merged: T;
  unknownFields: string[];
}

/**
 * Score-bearing fields always overwrite (Webshooter is authoritative, §A.3).
 * Enrichment fields overwrite only when currently empty (never clobber a
 * user-entered value). A field this module hasn't been told how to classify
 * is dropped, not guessed, and reported in `unknownFields` — a fail-soft
 * guard for a future caller passing an unclassified field.
 */
export function mergeSessionFields<T extends Record<string, unknown>>(
  existing: T,
  incoming: Partial<T>,
): MergeSessionFieldsResult<T> {
  const merged: Record<string, unknown> = { ...existing };
  const unknownFields: string[] = [];

  for (const [key, value] of Object.entries(incoming)) {
    const fieldClass = classifyMergeField(key);
    if (fieldClass === 'score') {
      merged[key] = value;
    } else if (fieldClass === 'enrichment') {
      if (isEmptyEnrichmentValue(existing[key])) merged[key] = value;
    } else {
      unknownFields.push(key);
    }
  }

  return { merged: merged as T, unknownFields };
}
