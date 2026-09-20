// Settings-screen glue for the sessions export/import. Data assembly and the
// share sheet / file picker live in db/json-export and platform/*-file.ts;
// this hook turns them into the two Settings actions plus i18n'd status text.
// Import is a two-step dry-run -> confirm -> upsert flow (spec requirement):
// `planImport` never touches the DB, `confirmImport` applies a plan the
// caller already showed the user.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  DryRunPlan,
  ImportError,
  ImportRecords,
  SessionImportGroup,
} from '@shotledger/shared';

import { applyImport, dryRunImport } from '@/db/json-export/apply-import';
import { buildExportJson } from '@/db/json-export/build-export';
import { db } from '@/db/client';
import { pickJsonText } from '@/platform/import-file';
import { shareJson } from '@/platform/export-file';

export type JsonExportStatus =
  | { kind: 'idle' }
  | { kind: 'export-success' }
  | { kind: 'export-failed' }
  | { kind: 'import-success'; sessionCount: number }
  | { kind: 'import-canceled' }
  | { kind: 'import-failed' };

export interface ImportDryRunResult {
  plan: DryRunPlan;
  errors: readonly ImportError[];
  groups: readonly SessionImportGroup[];
  records: ImportRecords;
}

function exportFilename(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `shotledger-export-${date}.json`;
}

export function useJsonExportImport(appVersion: string) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<JsonExportStatus>({ kind: 'idle' });

  async function exportJson() {
    if (!db) {
      setStatus({ kind: 'export-failed' });
      return;
    }
    const ok = await shareJson(buildExportJson(db, appVersion), exportFilename());
    setStatus(ok ? { kind: 'export-success' } : { kind: 'export-failed' });
  }

  /** Picks a file and runs the dry-run plan, without touching the DB.
   * Returns `null` if the user canceled the picker or there's no DB. */
  async function planImport(): Promise<ImportDryRunResult | null> {
    if (!db) {
      setStatus({ kind: 'import-failed' });
      return null;
    }
    const text = await pickJsonText();
    if (text === null) {
      setStatus({ kind: 'import-canceled' });
      return null;
    }
    return dryRunImport(db, text);
  }

  /** Applies a dry run the caller already showed the user — its sessions and
   * the firearms/licenses that came with them. */
  function confirmImport(dryRun: ImportDryRunResult) {
    if (!db) {
      setStatus({ kind: 'import-failed' });
      return;
    }
    applyImport(db, dryRun.groups, dryRun.records);
    setStatus({ kind: 'import-success', sessionCount: dryRun.groups.length });
  }

  const statusText: string | null = (() => {
    switch (status.kind) {
      case 'idle':
        return null;
      case 'export-success':
        return t('jsonExport.exportSuccess');
      case 'export-failed':
        return t('jsonExport.exportFailed');
      case 'import-success':
        return t('jsonExport.importSuccess', { count: status.sessionCount });
      case 'import-canceled':
        return t('jsonExport.importCanceled');
      case 'import-failed':
        return t('jsonExport.importFailed');
    }
  })();

  return { exportJson, planImport, confirmImport, status, statusText };
}
