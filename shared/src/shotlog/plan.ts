// ShotLog import plan (docs/specs/shotlog-import-spec.md §6, revision 2). Pure: parses,
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
import type {
  ShotlogExistingSession,
  ShotlogFirearm,
  ShotlogPlan,
  ShotlogPlanRow,
  ShotlogPlanSummary,
  ShotlogRowStatus,
  ShotlogSeries,
  ShotlogSession,
  ShotlogSuggestion,
  ShotlogTagMapping,
  ShotlogWarning,
} from './types';

export const SHOTLOG_TAG_PREFIX = 'shotlog:';
export const DATE_UNKNOWN_TAG = `${SHOTLOG_TAG_PREFIX}date-unknown`;
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
  /** Select sessions with no series by default. Off per §6. */
  includeEmpty?: boolean;
}

const EMPTY_SUMMARY_STATUSES: ShotlogRowStatus[] = [
  'new',
  'empty',
  'duplicate-in-file',
  'exact-duplicate',
  'probable-duplicate',
];

/** The generated note — what a human needs told, and nothing that is now data. */
function buildNote(session: ShotlogSession, dateUncertain: boolean, dnf: boolean): string {
  const lines: string[] = [];
  if (session.note !== '') lines.push(session.note);
  if (dnf) lines.push('ShotLog: did not finish');
  if (dateUncertain) lines.push('ShotLog: date unknown (bulk import)');
  return lines.join('\n');
}

/**
 * A `sighter` tag role (ShotLog's `Warmup`) means the session's warm-up
 * series is series 1 (maintainer 2026-10-13). A series the file itself marks
 * `Sighting=Yes` wins, and a session never gets a second sighter.
 */
function applySighterRole(series: readonly ShotlogSeries[], sighterRole: boolean): ShotlogSeries[] {
  const markFirst = sighterRole && !series.some((entry) => entry.isSighter);
  return series.map((entry) =>
    markFirst && entry.position === 1 ? { ...entry, isSighter: true } : entry,
  );
}

function buildSuggestion(
  session: ShotlogSession,
  dateUncertain: boolean,
  tagMapping: ShotlogTagMapping,
  knownFirearms: readonly ShotlogFirearm[],
): { suggestion: ShotlogSuggestion; warnings: ShotlogWarning[] } {
  const classification = classifyTags(session.tags, tagMapping, knownFirearms);

  const disciplineFromName = suggestDisciplineFromName(session.name);
  const disciplineId = classification.disciplineId ?? disciplineFromName;
  const disciplineSource =
    classification.disciplineId !== null ? 'tag' : disciplineFromName !== null ? 'name' : null;

  const groupFromName = suggestWeaponGroupFromName(session.name);
  const weaponGroup = classification.weaponGroup ?? groupFromName?.weaponGroup ?? null;
  const weaponGroupSource =
    classification.weaponGroup !== null ? 'tag' : groupFromName !== null ? 'name' : null;
  // A class only ever comes from whichever source also set the group, so a
  // tag-derived group is never combined with a class read off the name.
  const shooterClass =
    classification.weaponGroup !== null
      ? classification.shooterClass
      : (groupFromName?.shooterClass ?? null);

  // `final` stays a tag: which series form the final is not in the file.
  const tags = [...classification.passthroughTags];
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
      competitionName: classification.sessionType === 'competition' ? session.name : null,
      tags,
      note: buildNote(session, dateUncertain, classification.dnf),
      series: applySighterRole(session.series, classification.includesSighter),
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
  let seriesCount = 0;
  let shotCount = 0;

  for (const row of rows) {
    byStatus[row.status] += 1;
    seriesCount += row.suggestion.series.length;
    for (const entry of row.suggestion.series) shotCount += entry.shots.length;
    if (row.dateUncertain) dateUncertainCount += 1;
    for (const warning of row.warnings) {
      warningCounts[warning] = (warningCounts[warning] ?? 0) + 1;
    }
  }

  return {
    total: rows.length,
    seriesCount,
    shotCount,
    byStatus,
    errorCount,
    dateUncertainCount,
    warningCounts,
  };
}

interface RowClassification {
  status: ShotlogRowStatus;
  matchedSessions: { id: string; name: string }[];
}

/**
 * §6's status precedence, as a single early-return chain so each check is
 * load-bearing: an in-file duplicate is never matched against the database,
 * and "already imported" outranks "empty" so re-importing a session with no series
 * stays idempotent (spec §6, revision R1).
 */
function classifyRow(
  session: ShotlogSession,
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

  if (session.series.length === 0) return { status: 'empty', matchedSessions: [] };

  const probable = findProbableDuplicates(existingSessions, {
    datetime: session.datetime,
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
 * Turns raw ShotLog CSV text into a reviewable plan, one row per session. A header/empty-file
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
  const tagMapping = options.tagMapping ?? buildDefaultTagMapping(parsed.sessions);

  const lostDates = findLostDateTimestamps(parsed.sessions);
  const duplicates = markInFileDuplicates(parsed.sessions);

  const rows = parsed.sessions.map((session): ShotlogPlanRow => {
    const dateUncertain = lostDates.has(session.datetime);
    const { suggestion, warnings } = buildSuggestion(
      session,
      dateUncertain,
      tagMapping,
      knownFirearms,
    );
    const ref = session.sessionId;

    const duplicateOfLine = duplicates.get(session.line) ?? null;
    const { status, matchedSessions } = classifyRow(
      session,
      ref,
      duplicateOfLine,
      suggestion,
      existingSessions,
    );

    return {
      line: session.line,
      ref,
      datetime: session.datetime,
      name: session.name,
      status,
      dateUncertain,
      warnings: [...session.warnings, ...warnings],
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
