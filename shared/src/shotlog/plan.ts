// ShotLog import plan (docs/specs/shotlog-import-spec.md §6). Pure: parses,
// classifies, dedups and proposes — never writes. The app layer shows the
// result, lets the user edit the suggestions, and only then writes.
import { classifyTags, suggestDisciplineFromName, suggestWeaponGroupFromName } from './classify';
import { buildDefaultTagMapping } from './tags';
import {
  findExactRefMatch,
  findLostDateTimestamps,
  findProbableDuplicates,
  markInFileDuplicates,
} from './dedup';
import { parseShotlogCsv } from './parse';
import { buildShotlogRef } from './ref';
import type {
  ShotlogExistingSession,
  ShotlogFirearm,
  ShotlogPlan,
  ShotlogPlanRow,
  ShotlogPlanSummary,
  ShotlogRow,
  ShotlogRowStatus,
  ShotlogSuggestion,
  ShotlogTagMapping,
  ShotlogWarning,
} from './types';

export const SHOTLOG_TAG_PREFIX = 'shotlog:';
export const DATE_UNKNOWN_TAG = `${SHOTLOG_TAG_PREFIX}date-unknown`;
export const SIGHTER_TAG = `${SHOTLOG_TAG_PREFIX}includes-sighter`;
export const FINAL_TAG = `${SHOTLOG_TAG_PREFIX}final`;
export const DNF_TAG = `${SHOTLOG_TAG_PREFIX}dnf`;

export interface ShotlogPlanOptions {
  /**
   * Role per tag, keyed by `normalizeTag`. Omit and the plan falls back to
   * `buildDefaultTagMapping` — the screen's starting point, which the user
   * then edits and passes back in (§3).
   */
  tagMapping?: ShotlogTagMapping;
  knownFirearms?: readonly ShotlogFirearm[];
  existingSessions?: readonly ShotlogExistingSession[];
  /** Select zero-score rows by default. Off per §6 status 3. */
  includeEmpty?: boolean;
}

const EMPTY_SUMMARY_STATUSES: ShotlogRowStatus[] = [
  'new',
  'empty',
  'duplicate-in-file',
  'exact-duplicate',
  'probable-duplicate',
];

/**
 * The generated note. The ten and inner-ten counts go here because the
 * schema has nowhere else to put them: a total-override series carries no
 * `shots` rows, and every ten/inner-ten statistic in `shared/src/scoring`
 * counts shot flags. Recording the confirmed semantics (maintainer
 * 2026-09-02) in prose is the most this can do without a migration.
 */
function buildNote(
  row: ShotlogRow,
  dateUncertain: boolean,
  includesSighter: boolean,
  dnf: boolean,
): string {
  const lines: string[] = [];
  if (row.note !== '') lines.push(row.note);
  lines.push(`ShotLog: ${row.tenCount} tens, ${row.innerTenCount} inner tens`);
  if (includesSighter) lines.push('ShotLog: total includes a sighter series');
  if (dnf) lines.push('ShotLog: did not finish');
  if (dateUncertain) lines.push('ShotLog: date unknown (bulk import)');
  return lines.join('\n');
}

function buildSuggestion(
  row: ShotlogRow,
  dateUncertain: boolean,
  tagMapping: ShotlogTagMapping,
  knownFirearms: readonly ShotlogFirearm[],
): { suggestion: ShotlogSuggestion; warnings: ShotlogWarning[] } {
  const classification = classifyTags(row.tags, tagMapping, knownFirearms);

  const disciplineFromName = suggestDisciplineFromName(row.name);
  const disciplineId = classification.disciplineId ?? disciplineFromName;
  const disciplineSource =
    classification.disciplineId !== null ? 'tag' : disciplineFromName !== null ? 'name' : null;

  const groupFromName = suggestWeaponGroupFromName(row.name);
  const weaponGroup = classification.weaponGroup ?? groupFromName?.weaponGroup ?? null;
  const weaponGroupSource =
    classification.weaponGroup !== null ? 'tag' : groupFromName !== null ? 'name' : null;
  // A class only ever comes from whichever source also set the group, so a
  // tag-derived group is never combined with a class read off the name.
  const shooterClass =
    classification.weaponGroup !== null
      ? classification.shooterClass
      : (groupFromName?.shooterClass ?? null);

  const tags = [...classification.passthroughTags];
  if (classification.includesSighter) tags.push(SIGHTER_TAG);
  if (classification.hasFinal) tags.push(FINAL_TAG);
  if (classification.dnf) tags.push(DNF_TAG);
  if (dateUncertain) tags.push(DATE_UNKNOWN_TAG);

  return {
    warnings: classification.warnings,
    suggestion: {
      sessionType: classification.sessionType,
      disciplineId,
      disciplineSource,
      weaponGroup,
      weaponGroupSource,
      shooterClass,
      firearmId: classification.firearmMatch?.id ?? null,
      firearmLabel: classification.firearmMatch === null ? classification.firearmLabel : null,
      competitionName: classification.sessionType === 'competition' ? row.name : null,
      tags,
      note: buildNote(row, dateUncertain, classification.includesSighter, classification.dnf),
      totalTenths: row.totalScore * 10,
      innerTenCount: row.innerTenCount,
      tenCount: row.tenCount,
      includesSighter: classification.includesSighter,
      isFinal: classification.hasFinal,
      dnf: classification.dnf,
    },
  };
}

function summarize(rows: readonly ShotlogPlanRow[], errorCount: number): ShotlogPlanSummary {
  const byStatus = Object.fromEntries(
    EMPTY_SUMMARY_STATUSES.map((status) => [status, 0]),
  ) as Record<ShotlogRowStatus, number>;
  const warningCounts: Partial<Record<ShotlogWarning, number>> = {};
  let dateUncertainCount = 0;

  for (const row of rows) {
    byStatus[row.status] += 1;
    if (row.dateUncertain) dateUncertainCount += 1;
    for (const warning of row.warnings) {
      warningCounts[warning] = (warningCounts[warning] ?? 0) + 1;
    }
  }

  return { total: rows.length, byStatus, errorCount, dateUncertainCount, warningCounts };
}

interface RowClassification {
  status: ShotlogRowStatus;
  matchedSessions: { id: string; name: string }[];
}

/**
 * §6's status precedence, as a single early-return chain so each check is
 * load-bearing: an in-file duplicate is never matched against the database,
 * and "already imported" outranks "empty" so re-importing a zero-score row
 * stays idempotent (spec §6, revision R1).
 */
function classifyRow(
  row: ShotlogRow,
  ref: string,
  duplicateOfLine: number | null,
  suggestion: ShotlogSuggestion,
  existingSessions: readonly ShotlogExistingSession[],
): RowClassification {
  if (duplicateOfLine !== null) return { status: 'duplicate-in-file', matchedSessions: [] };

  const exact = findExactRefMatch(existingSessions, ref);
  if (exact !== null) {
    return { status: 'exact-duplicate', matchedSessions: [{ id: exact.id, name: exact.name }] };
  }

  if (row.totalScore === 0) return { status: 'empty', matchedSessions: [] };

  const probable = findProbableDuplicates(existingSessions, {
    datetime: row.datetime,
    disciplineId: suggestion.disciplineId,
    weaponGroup: suggestion.weaponGroup,
  });
  if (probable.length > 0) {
    return {
      status: 'probable-duplicate',
      matchedSessions: probable.map((session) => ({ id: session.id, name: session.name })),
    };
  }

  return { status: 'new', matchedSessions: [] };
}

/**
 * Turns raw ShotLog CSV text into a reviewable plan. A header/empty-file
 * failure yields an empty plan carrying the parse error, so the caller has
 * one shape to render either way.
 */
export function buildShotlogImportPlan(
  text: string,
  options: ShotlogPlanOptions = {},
): ShotlogPlan {
  const parsed = parseShotlogCsv(text);
  if (!parsed.ok) {
    return {
      rows: [],
      errors: [{ line: 1, message: parsed.error }],
      summary: summarize([], 1),
    };
  }

  const knownFirearms = options.knownFirearms ?? [];
  const existingSessions = options.existingSessions ?? [];
  const includeEmpty = options.includeEmpty ?? false;
  const tagMapping = options.tagMapping ?? buildDefaultTagMapping(parsed.rows);

  const lostDates = findLostDateTimestamps(parsed.rows);
  const duplicates = markInFileDuplicates(parsed.rows);

  const rows = parsed.rows.map((row): ShotlogPlanRow => {
    const dateUncertain = lostDates.has(row.datetime);
    const { suggestion, warnings } = buildSuggestion(row, dateUncertain, tagMapping, knownFirearms);
    const ref = buildShotlogRef(row);

    const duplicateOfLine = duplicates.get(row.line) ?? null;
    const { status, matchedSessions } = classifyRow(
      row,
      ref,
      duplicateOfLine,
      suggestion,
      existingSessions,
    );

    return {
      line: row.line,
      ref,
      datetime: row.datetime,
      name: row.name,
      status,
      dateUncertain,
      warnings: [...row.warnings, ...warnings],
      duplicateOfLine,
      matchedSessions,
      suggestion,
      selected: status === 'new' || (status === 'empty' && includeEmpty),
    };
  });

  return { rows, errors: parsed.errors, summary: summarize(rows, parsed.errors.length) };
}

export interface BulkSuggestionPatch {
  disciplineId?: string | null;
  weaponGroup?: string | null;
  shooterClass?: string | null;
  firearmId?: string | null;
}

/**
 * "Apply to all similar" (§6): every row whose discipline AND weapon-group
 * suggestions both match the source row's takes the patch. Pure — returns a
 * new array; the caller holds the result.
 */
export function applyBulkSuggestion(
  rows: readonly ShotlogPlanRow[],
  sourceLine: number,
  patch: BulkSuggestionPatch,
): ShotlogPlanRow[] {
  const source = rows.find((row) => row.line === sourceLine);
  if (!source) return [...rows];
  return rows.map((row) => {
    if (
      row.suggestion.disciplineId !== source.suggestion.disciplineId ||
      row.suggestion.weaponGroup !== source.suggestion.weaponGroup
    ) {
      return row;
    }
    return {
      ...row,
      suggestion: {
        ...row.suggestion,
        disciplineId:
          patch.disciplineId !== undefined ? patch.disciplineId : row.suggestion.disciplineId,
        weaponGroup:
          patch.weaponGroup !== undefined ? patch.weaponGroup : row.suggestion.weaponGroup,
        shooterClass:
          patch.shooterClass !== undefined ? patch.shooterClass : row.suggestion.shooterClass,
        firearmId: patch.firearmId !== undefined ? patch.firearmId : row.suggestion.firearmId,
      },
    };
  });
}
