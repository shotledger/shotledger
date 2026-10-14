// ShotLog CSV import — shared types (docs/specs/shotlog-import-spec.md,
// revision 2: the per-shot export).

/** Non-fatal per-row observations. Never block an import. */
export type ShotlogWarning =
  | 'auto-generated-name'
  | 'firearm-column-unsupported'
  | 'conflicting-discipline-tags'
  | 'conflicting-weapon-group-tags'
  | 'ambiguous-firearm-tag'
  /** A row's `Series total` disagrees with its shots; the shots win. */
  | 'series-total-mismatch'
  /** A row's `X` or `(X)` count disagrees with its shots; the shots win. */
  | 'x-count-mismatch'
  | 'segment-unsupported'
  /** `Family` is not `ring_generic`, the only one measured (spec §1). */
  | 'family-unsupported'
  /** Series numbers in file order are not 1..n; positions are renumbered. */
  | 'series-gap'
  /** More than one `Sighting=Yes` series; only the first is a sighter. */
  | 'multiple-sighter-series'
  /** The local time falls in a DST gap or overlap (spec Q1). */
  | 'ambiguous-local-time';

export interface ShotlogShot {
  /** Integer scoring ×10: `9` → 90, `X` and `(X)` → 100. */
  valueTenths: number;
  /** `(X)` — centrumtia. A plain `X` is an ordinary ten. */
  isInnerTen: boolean;
}

export interface ShotlogSeries {
  /** 1-based file line of the series row. */
  line: number;
  /** 1..n in file order (the file's own `Series` number may have gaps). */
  position: number;
  isSighter: boolean;
  shots: ShotlogShot[];
}

/** One ShotLog session: every row sharing a `Session ID` (spec §2). */
export interface ShotlogSession {
  /** 1-based file line of the session's first row (the header is line 1). */
  line: number;
  /** ShotLog's `Session ID`, e.g. `S-0a1b2c3d`. Also the `external_ref`. */
  sessionId: string;
  /** `Datetime` verbatim: local wall time, no zone. */
  localDatetime: string;
  /** `localDatetime` resolved in the device's zone, as an ISO-8601 UTC instant. */
  datetime: string;
  name: string;
  /** ShotLog's own "Session type" column — free text, always 'Practice' so far. */
  sourceType: string;
  /** ShotLog's `Discipline` label, e.g. `Generic (ring scoring)`. Display only. */
  discipline: string;
  /** ShotLog's `Family`, e.g. `ring_generic`. */
  family: string;
  tags: string[];
  note: string;
  /** Empty for a session ShotLog exported with no series. */
  series: ShotlogSeries[];
  warnings: ShotlogWarning[];
}

export interface ShotlogRowError {
  line: number;
  message: string;
}

export type ShotlogParseResult =
  | { ok: true; sessions: ShotlogSession[]; errors: ShotlogRowError[] }
  | { ok: false; error: 'empty' }
  | { ok: false; error: 'header-mismatch'; found: string[] };

export interface ShotlogFirearm {
  id: string;
  label: string;
}

/**
 * What one ShotLog tag means. The import screen shows every distinct tag in
 * the file with a default role and lets the user change it, so no personal
 * tagging convention is baked into the code (spec §3).
 */
export type ShotlogTagRole =
  | { kind: 'ignore' }
  | { kind: 'discipline'; disciplineId: string }
  | { kind: 'competition' }
  /** The row's total INCLUDES a sighter series (maintainer 2026-09-02). */
  | { kind: 'sighter' }
  | { kind: 'final' }
  | { kind: 'dnf' }
  | { kind: 'weapon-group'; weaponGroup: string; shooterClass: string | null }
  | { kind: 'firearm'; label: string };

/** Roles keyed by `normalizeTag(tag)`. */
export type ShotlogTagMapping = Record<string, ShotlogTagRole>;

export interface ShotlogTagUsage {
  /** `normalizeTag` key — what `ShotlogTagMapping` is indexed by. */
  key: string;
  /** The tag as first written in the file, for display. */
  label: string;
  count: number;
}

/** Existing session, narrowed to what duplicate detection needs (spec §6). */
export interface ShotlogExistingSession {
  id: string;
  name: string;
  /** ISO-8601; only the calendar day is compared. */
  startedAt: string;
  /** Nullable defensively: a caller may hold a session it could not classify. */
  disciplineId: string | null;
  weaponGroup: string | null;
  externalSource: string | null;
  externalRef: string | null;
}

export type ShotlogSuggestionSource = 'tag' | 'name' | null;

export interface ShotlogSuggestion {
  sessionType: 'training' | 'competition';
  disciplineId: string | null;
  disciplineSource: ShotlogSuggestionSource;
  weaponGroup: string | null;
  weaponGroupSource: ShotlogSuggestionSource;
  shooterClass: string | null;
  firearmId: string | null;
  /** Firearm named by a tag that no existing firearm matches (§7). */
  firearmLabel: string | null;
  competitionName: string | null;
  tags: string[];
  note: string;
  /** The session's series, with a `sighter` tag role applied to series 1 (§3). */
  series: ShotlogSeries[];
  dnf: boolean;
}

export type ShotlogRowStatus =
  'new' | 'empty' | 'duplicate-in-file' | 'exact-duplicate' | 'probable-duplicate';

export interface ShotlogPlanRow {
  line: number;
  /** ShotLog's `Session ID`, written as the session's `external_ref`. */
  ref: string;
  datetime: string;
  name: string;
  status: ShotlogRowStatus;
  /** True for sessions in a lost-date group (spec §5). */
  dateUncertain: boolean;
  warnings: ShotlogWarning[];
  /** Set when status is 'duplicate-in-file': the surviving row's line. */
  duplicateOfLine: number | null;
  /** Set when status is 'exact-duplicate' or 'probable-duplicate'. */
  matchedSessions: { id: string; name: string }[];
  suggestion: ShotlogSuggestion;
  selected: boolean;
}

export interface ShotlogPlanSummary {
  total: number;
  /** Series and shots across every session in the plan. */
  seriesCount: number;
  shotCount: number;
  byStatus: Record<ShotlogRowStatus, number>;
  errorCount: number;
  dateUncertainCount: number;
  warningCounts: Partial<Record<ShotlogWarning, number>>;
}

export interface ShotlogPlan {
  rows: ShotlogPlanRow[];
  errors: ShotlogRowError[];
  summary: ShotlogPlanSummary;
}
