// ShotLog CSV import — shared types (docs/specs/shotlog-import-spec.md §2/§6).

/** Non-fatal per-row observations. Never block an import. */
export type ShotlogWarning =
  | 'inner-ten-exceeds-ten-count'
  | 'auto-generated-name'
  | 'firearm-column-unsupported'
  | 'conflicting-discipline-tags'
  | 'ambiguous-firearm-tag';

export interface ShotlogRow {
  /** 1-based file line (the header is line 1). */
  line: number;
  /** ISO-8601 UTC instant, verbatim from the file. */
  datetime: string;
  name: string;
  /** ShotLog's own "Session type" column — free text, always 'Practice' so far. */
  sourceType: string;
  totalScore: number;
  /** ShotLog's "Number of X". Informational only, see spec §1.1. */
  tenCount: number;
  /** ShotLog's "(X)" — mapped to our inner-ten count (VERIFY, spec §1.1). */
  innerTenCount: number;
  tags: string[];
  note: string;
  warnings: ShotlogWarning[];
}

export interface ShotlogRowError {
  line: number;
  message: string;
}

export type ShotlogParseResult =
  | { ok: true; rows: ShotlogRow[]; errors: ShotlogRowError[] }
  | { ok: false; error: 'empty' }
  | { ok: false; error: 'header-mismatch'; found: string[] };

export interface ShotlogFirearm {
  id: string;
  label: string;
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
  competitionName: string | null;
  tags: string[];
  note: string;
  totalTenths: number;
  innerTenCount: number;
  tenCount: number;
}

export type ShotlogRowStatus =
  'new' | 'empty' | 'duplicate-in-file' | 'exact-duplicate' | 'probable-duplicate';

export interface ShotlogPlanRow {
  line: number;
  ref: string;
  datetime: string;
  name: string;
  status: ShotlogRowStatus;
  /** True for rows in a lost-date group (spec §5). */
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
