// Platform wrapper for CSV export (§4 M7). The CSV text itself is a pure
// function (shared/src/csv); the write-to-cache-and-share mechanism is
// share-file.ts, shared with the analytics report's JSON export.
import { shareTextFile } from '@/platform/share-file';

/** Writes `csvText` to a cache file and opens the native share sheet. */
export async function shareCsv(csvText: string, filename: string): Promise<boolean> {
  return shareTextFile(csvText, {
    filename,
    mimeType: 'text/csv',
    uti: 'public.comma-separated-values-text',
  });
}

/** Writes `jsonText` to a cache file and opens the native share sheet. */
export async function shareJson(jsonText: string, filename: string): Promise<boolean> {
  return shareTextFile(jsonText, { filename, mimeType: 'application/json', uti: 'public.json' });
}
