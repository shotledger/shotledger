// ShotLog CSV import — screen glue (docs/specs/shotlog-import-spec.md §7).
// `planImport` never touches the DB; `runImport` writes only what the user
// left selected, and the write path re-checks importability itself.
import { useState } from 'react';
import {
  applyBulkSuggestion,
  buildShotlogImportPlan,
  type BulkSuggestionPatch,
  type ShotlogPlan,
  type ShotlogPlanRow,
} from '@shotledger/shared';

import { db } from '@/db/client';
import { listFirearms } from '@/db/queries/firearms';
import {
  importShotlogRows,
  isShotlogRowImportable,
  listShotlogDedupCandidates,
} from '@/db/queries/shotlog';
import { pickCsvText } from '@/platform/csv-import';

export type ShotlogImportStatus =
  | { kind: 'idle' }
  | { kind: 'cancelled' }
  | { kind: 'unavailable' }
  | { kind: 'planned' }
  | { kind: 'imported'; created: number; skipped: number };

export function useShotlogImport() {
  const [plan, setPlan] = useState<ShotlogPlan | null>(null);
  const [status, setStatus] = useState<ShotlogImportStatus>({ kind: 'idle' });

  async function planImport() {
    if (!db) {
      setStatus({ kind: 'unavailable' });
      return;
    }
    const text = await pickCsvText();
    if (text === null) {
      setStatus({ kind: 'cancelled' });
      return;
    }
    setPlan(
      buildShotlogImportPlan(text, {
        knownFirearms: listFirearms(db).map((firearm) => ({
          id: firearm.id,
          label: `${firearm.make} ${firearm.model}`.trim(),
        })),
        existingSessions: listShotlogDedupCandidates(db),
      }),
    );
    setStatus({ kind: 'planned' });
  }

  function updateRows(next: (rows: readonly ShotlogPlanRow[]) => ShotlogPlanRow[]) {
    setPlan((current) => (current === null ? null : { ...current, rows: next(current.rows) }));
  }

  function toggleRow(line: number) {
    updateRows((rows) =>
      rows.map((row) => (row.line === line ? { ...row, selected: !row.selected } : row)),
    );
  }

  /**
   * "Select all" means all rows that could actually be written — selecting
   * a duplicate or an unclassified row would only inflate the import
   * button's count with rows `importShotlogRows` goes on to skip.
   */
  function setAllSelected(selected: boolean) {
    updateRows((rows) =>
      rows.map((row) => ({ ...row, selected: selected && isShotlogRowImportable(row) })),
    );
  }

  function editRow(line: number, patch: BulkSuggestionPatch) {
    updateRows((rows) =>
      rows.map((row) =>
        row.line === line ? { ...row, suggestion: { ...row.suggestion, ...patch } } : row,
      ),
    );
  }

  /** "Apply to all similar" — the bulk edit of spec §6. */
  function applyToSimilar(line: number, patch: BulkSuggestionPatch) {
    updateRows((rows) => applyBulkSuggestion(rows, line, patch));
  }

  function runImport() {
    if (!db || plan === null) {
      setStatus({ kind: 'unavailable' });
      return;
    }
    const outcome = importShotlogRows(db, plan.rows);
    setStatus({ kind: 'imported', created: outcome.created.length, skipped: outcome.skipped });
    setPlan(null);
  }

  return {
    plan,
    status,
    planImport,
    toggleRow,
    setAllSelected,
    editRow,
    applyToSimilar,
    runImport,
  };
}
