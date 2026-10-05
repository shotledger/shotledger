// What the hole suggestions did in real use, one entry per saved photo series:
// what was suggested, what the shooter kept, nudged, deleted or added, under
// which lock and flags. Dev builds only, kept on the device and exported from
// /dev, so an experiment flag can be judged on numbers (#264).
import type { Mark } from './marks';

/** A suggestion as it first landed on the canvas. */
export interface PlacedSuggestion {
  readonly id: string;
  readonly xMm: number;
  readonly yMm: number;
  readonly filled: boolean;
}

export interface AssistCounts {
  /** Suggestions placed on the canvas; `filled` of them came from the fill. */
  readonly suggested: number;
  readonly filled: number;
  /** Suggestions saved where they landed. */
  readonly kept: number;
  /** Suggestions saved after the shooter moved them. */
  readonly nudged: number;
  /** Suggestions the shooter removed (deleted, or undone). */
  readonly deleted: number;
  readonly deletedFilled: number;
  /** Marks the shooter tapped in themselves. */
  readonly added: number;
}

/** The detector's outcome: never ran, still running at save, or how it ended. */
export type SuggestionOutcome = 'none' | 'pending' | 'unsure' | 'ran';

export interface AssistEntry {
  readonly at: string;
  readonly faceId: string;
  readonly lock: 'auto' | 'closeup' | 'manual';
  readonly flags: Readonly<Record<string, boolean>>;
  readonly seriesLength: number;
  readonly caliberMm: number;
  readonly outcome: SuggestionOutcome;
  readonly timingsMs: {
    /** Photo picked to marking screen. */
    readonly lock: number | null;
    /** The detector's own pass. */
    readonly suggest: number | null;
    /** Marking screen to save. */
    readonly marking: number | null;
  };
  readonly counts: AssistCounts;
  readonly suggestions: readonly Omit<PlacedSuggestion, 'id'>[];
  readonly marks: readonly {
    readonly xMm: number;
    readonly yMm: number;
    readonly suggested: boolean;
    readonly filled: boolean;
    readonly moved: boolean;
  }[];
}

export function countAssist(
  placed: readonly PlacedSuggestion[],
  saved: readonly Mark[],
): AssistCounts {
  const savedIds = new Set(saved.map((m) => m.id));
  const removed = placed.filter((p) => !savedIds.has(p.id));
  return {
    suggested: placed.length,
    filled: placed.filter((p) => p.filled).length,
    kept: saved.filter((m) => m.suggested && !m.moved).length,
    nudged: saved.filter((m) => m.suggested && m.moved).length,
    deleted: removed.length,
    deletedFilled: removed.filter((p) => p.filled).length,
    added: saved.filter((m) => !m.suggested).length,
  };
}

/** One row of the /dev summary: every entry saved under one flag combination. */
export interface AssistSummary {
  /** The flags that were on, sorted; empty when none were. */
  readonly flagsOn: readonly string[];
  readonly series: number;
  readonly counts: AssistCounts;
  /** Saved suggestions over placed suggestions; null with none placed. */
  readonly precision: number | null;
  /** Saved suggestions over saved marks; null with nothing saved. */
  readonly recall: number | null;
}

const ZERO: AssistCounts = {
  suggested: 0,
  filled: 0,
  kept: 0,
  nudged: 0,
  deleted: 0,
  deletedFilled: 0,
  added: 0,
};

function addCounts(a: AssistCounts, b: AssistCounts): AssistCounts {
  return {
    suggested: a.suggested + b.suggested,
    filled: a.filled + b.filled,
    kept: a.kept + b.kept,
    nudged: a.nudged + b.nudged,
    deleted: a.deleted + b.deleted,
    deletedFilled: a.deletedFilled + b.deletedFilled,
    added: a.added + b.added,
  };
}

/**
 * Pools the entries by which flags were on. "Recall" counts a mark the
 * shooter added as a hole the detector missed, which holds as long as the
 * shooter marks every hole of the series.
 */
export function summarizeAssist(entries: readonly AssistEntry[]): AssistSummary[] {
  const groups = new Map<string, { flagsOn: string[]; series: number; counts: AssistCounts }>();
  for (const entry of entries) {
    const flagsOn = Object.keys(entry.flags)
      .filter((name) => entry.flags[name])
      .sort();
    const key = flagsOn.join(',');
    const group = groups.get(key) ?? { flagsOn, series: 0, counts: ZERO };
    groups.set(key, {
      flagsOn,
      series: group.series + 1,
      counts: addCounts(group.counts, entry.counts),
    });
  }
  return [...groups.values()]
    .sort(
      (a, b) =>
        a.flagsOn.length - b.flagsOn.length || a.flagsOn.join().localeCompare(b.flagsOn.join()),
    )
    .map(({ flagsOn, series, counts }) => {
      const hits = counts.kept + counts.nudged;
      const saved = hits + counts.added;
      return {
        flagsOn,
        series,
        counts,
        precision: counts.suggested > 0 ? hits / counts.suggested : null,
        recall: saved > 0 ? hits / saved : null,
      };
    });
}
