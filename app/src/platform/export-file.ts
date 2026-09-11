// Platform wrapper for the sessions export. The JSON itself is a pure
// function (shared/src/json-export); the write-to-cache-and-share mechanism is
// share-file.ts, shared with the analytics report's export.
import { shareTextFile } from '@/platform/share-file';

/** Writes `jsonText` to a cache file and opens the native share sheet. */
export async function shareJson(jsonText: string, filename: string): Promise<boolean> {
  return shareTextFile(jsonText, { filename, mimeType: 'application/json', uti: 'public.json' });
}
