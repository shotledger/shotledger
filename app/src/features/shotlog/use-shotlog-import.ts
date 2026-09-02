// ShotLog CSV import — screen glue (docs/specs/shotlog-import-spec.md §7).
// A maintainer/dev tool: export from ShotLog on the phone, import here.
// `planImport` never touches the DB; `runImport` writes only what the user
// left selected, and the write path re-checks importability itself.
import { useState } from 'react';
import {
  applyBulkSuggestion,
  buildDefaultTagMapping,
  buildShotlogImportPlan,
  collectShotlogTags,
  parseShotlogCsv,
  type BulkSuggestionPatch,
  type ShotlogPlan,
  type ShotlogPlanRow,
  type ShotlogTagMapping,
  type ShotlogTagRole,
  type ShotlogTagUsage,
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

/** A row the user can never write is never pre-selected (§7). */
function normalizeSelection(rows: readonly ShotlogPlanRow[]): ShotlogPlanRow[] {
  return rows.map((row) => ({ ...row, selected: row.selected && isShotlogRowImportable(row) }));
}

export function useShotlogImport() {
  const [text, setText] = useState<string | null>(null);
  const [tags, setTags] = useState<ShotlogTagUsage[]>([]);
  const [tagMapping, setTagMapping] = useState<ShotlogTagMapping>({});
  const [plan, setPlan] = useState<ShotlogPlan | null>(null);
  const [status, setStatus] = useState<ShotlogImportStatus>({ kind: 'idle' });

  function buildPlan(source: string, mapping: ShotlogTagMapping) {
    if (!db) return;
    const built = buildShotlogImportPlan(source, {
      tagMapping: mapping,
      knownFirearms: listFirearms(db).map((firearm) => ({
        id: firearm.id,
        label: `${firearm.make} ${firearm.model}`.trim(),
      })),
      existingSessions: listShotlogDedupCandidates(db),
    });
    setPlan({ ...built, rows: normalizeSelection(built.rows) });
    setStatus({ kind: 'planned' });
  }

  async function planImport() {
    if (!db) {
      setStatus({ kind: 'unavailable' });
      return;
    }
    const picked = await pickCsvText();
    if (picked === null) {
      setStatus({ kind: 'cancelled' });
      return;
    }
    // Parsed once here purely to seed the mapping screen; `buildPlan` parses
    // again from the same text, so the two can never disagree.
    const parsed = parseShotlogCsv(picked);
    const rows = parsed.ok ? parsed.rows : [];
    const mapping = buildDefaultTagMapping(rows);
    setText(picked);
    setTags(collectShotlogTags(rows));
    setTagMapping(mapping);
    buildPlan(picked, mapping);
  }

  /** Change one tag's role and rebuild the plan under the new mapping. */
  function setTagRole(key: string, role: ShotlogTagRole) {
    const next = { ...tagMapping, [key]: role };
    setTagMapping(next);
    if (text !== null) buildPlan(text, next);
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
   * "Select all" means all rows that could actually be written — selecting a
   * duplicate or an unclassified row would only inflate the import button's
   * count with rows `importShotlogRows` goes on to skip.
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
    setTags([]);
    setText(null);
  }

  return {
    plan,
    status,
    tags,
    tagMapping,
    setTagRole,
    planImport,
    toggleRow,
    setAllSelected,
    editRow,
    applyToSimilar,
    runImport,
  };
}
