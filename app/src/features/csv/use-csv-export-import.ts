// M7 (§4 M7): Settings-screen glue for CSV export/import. Data assembly and
// the share sheet / file picker live in db/csv and platform/csv-*; this
// hook turns them into the two Settings actions plus i18n'd status text.
// Import is a two-step dry-run -> confirm -> upsert flow (spec requirement):
// `planImport` never touches the DB, `confirmImport` applies a plan the
// caller already showed the user.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DryRunPlan, SessionImportGroup } from '@shotledger/shared';

import { applyImport, dryRunImport } from '@/db/csv/apply-import';
import { buildExportCsv } from '@/db/csv/build-export';
import { db } from '@/db/client';
import { pickCsvText } from '@/platform/csv-import';
import { shareCsv } from '@/platform/csv-export';

export type CsvStatus =
  | { kind: 'idle' }
  | { kind: 'export-success' }
  | { kind: 'export-failed' }
  | { kind: 'import-success'; sessionCount: number }
  | { kind: 'import-cancelled' }
  | { kind: 'import-failed' };

export interface ImportDryRunResult {
  plan: DryRunPlan;
  errors: readonly { row: number; column?: string; message: string }[];
  groups: readonly SessionImportGroup[];
}

function csvFilename(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `shotledger-export-${date}.csv`;
}

export function useCsvExportImport() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<CsvStatus>({ kind: 'idle' });

  async function exportCsv() {
    if (!db) {
      setStatus({ kind: 'export-failed' });
      return;
    }
    const csv = buildExportCsv(db);
    const ok = await shareCsv(csv, csvFilename());
    setStatus(ok ? { kind: 'export-success' } : { kind: 'export-failed' });
  }

  /** Picks a file and runs the dry-run plan, without touching the DB.
   * Returns `null` if the user cancelled the picker or there's no DB. */
  async function planImport(): Promise<ImportDryRunResult | null> {
    if (!db) {
      setStatus({ kind: 'import-failed' });
      return null;
    }
    const text = await pickCsvText();
    if (text === null) {
      setStatus({ kind: 'import-cancelled' });
      return null;
    }
    return dryRunImport(db, text);
  }

  /** Applies a plan's groups (from a `planImport` result the caller already
   * showed the user) to the DB. */
  function confirmImport(groups: readonly SessionImportGroup[]) {
    if (!db) {
      setStatus({ kind: 'import-failed' });
      return;
    }
    applyImport(db, groups);
    setStatus({ kind: 'import-success', sessionCount: groups.length });
  }

  const statusText: string | null = (() => {
    switch (status.kind) {
      case 'idle':
        return null;
      case 'export-success':
        return t('csv.exportSuccess');
      case 'export-failed':
        return t('csv.exportFailed');
      case 'import-success':
        return t('csv.importSuccess', { count: status.sessionCount });
      case 'import-cancelled':
        return t('csv.importCancelled');
      case 'import-failed':
        return t('csv.importFailed');
    }
  })();

  return { exportCsv, planImport, confirmImport, status, statusText };
}
