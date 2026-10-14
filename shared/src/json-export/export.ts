// Serializing sessions to the export envelope. Spec §2, criteria C1–C7.
import {
  JSON_EXPORT_FORMAT,
  JSON_EXPORT_VERSION,
  type FirearmExport,
  type LicenseExport,
  type MaintenanceEventExport,
  type SessionExport,
} from './types';

export interface ExportOptions {
  /** App version for the envelope header. */
  appVersion: string;
  /** Injectable so the output is deterministic under test. */
  generatedAt?: string;
  /** The firearms the sessions reference. Optional so a caller with none to
   *  offer still writes the arrays — they are always present in the file. */
  firearms?: readonly FirearmExport[];
  licenses?: readonly LicenseExport[];
  maintenanceEvents?: readonly MaintenanceEventExport[];
}

/**
 * The whole export, as a string ready to write.
 *
 * Two spaces, not minified: this is a file a user may open and read, and the
 * size difference is irrelevant next to the photos in a backup.
 */
export function exportSessionsToJson(
  sessions: readonly SessionExport[],
  options: ExportOptions,
): string {
  return JSON.stringify(
    {
      format: JSON_EXPORT_FORMAT,
      formatVersion: JSON_EXPORT_VERSION,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      app: { name: 'ShotLedger', version: options.appVersion },
      sessions,
      firearms: options.firearms ?? [],
      licenses: options.licenses ?? [],
      maintenanceEvents: options.maintenanceEvents ?? [],
    },
    null,
    2,
  );
}
