// Where "Save and Scan Next" goes once the scored photo is saved (#499), or
// null when it is not offered.

export interface ScanNextRow {
  position: number;
  isFinal: boolean;
  /** Any shots (or an imported total) recorded on the series. */
  hasResult: boolean;
}

export interface ScanNextInput {
  /** Fixed-format programs pre-create their series; nothing is appended. */
  isFixedFormat: boolean;
  /** The session's series; the one being saved may be absent or still empty. */
  rows: readonly ScanNextRow[];
  savedPosition: number;
  savedIsFinal: boolean;
}

export interface ScanNextTarget {
  position: number;
  isFinal: boolean;
}

export function scanNextTarget(input: ScanNextInput): ScanNextTarget | null {
  if (input.isFixedFormat) {
    // The next empty pre-created series after this one, else the first empty
    // one before it. None left means the program is complete: not offered.
    const empty = input.rows
      .filter((row) => row.position !== input.savedPosition && !row.hasResult)
      .sort((a, b) => a.position - b.position);
    const next = empty.find((row) => row.position > input.savedPosition) ?? empty[0];
    return next ? { position: next.position, isFinal: next.isFinal } : null;
  }
  // Freeform: always a new series at the end, in the same section as the one
  // just saved. It is never a sighter — a new series is added unflagged — so
  // the one-sighter-per-section rule cannot be broken.
  const last = input.rows.reduce((max, row) => Math.max(max, row.position), 0);
  return { position: Math.max(last, input.savedPosition) + 1, isFinal: input.savedIsFinal };
}
