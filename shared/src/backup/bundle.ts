// Reads a `.shotledger` bundle into its manifest and entries, refusing
// anything restore could not act on safely — before any of it touches disk.
import { type ContainerEntry, unpackContainer } from './container';
import { isSafeEntryName } from './photo-path';
import { type BackupManifest, BackupManifestSchema, MANIFEST_ENTRY_NAME } from './types';

export interface ReadBundle {
  manifest: BackupManifest;
  entries: ContainerEntry[];
}

/** `null` when the bytes are not a well-formed bundle: a bad container, a
 * missing or malformed manifest, or a photo entry name that is not a plain
 * `<id>.<ext>`. */
export function readBundle(bytes: Uint8Array): ReadBundle | null {
  let entries: ContainerEntry[];
  try {
    entries = unpackContainer(bytes);
  } catch {
    return null;
  }
  if (!entries.every((e) => isSafeEntryName(e.name))) return null;

  const manifestEntry = entries.find((e) => e.name === MANIFEST_ENTRY_NAME);
  if (!manifestEntry) return null;
  const text = new TextDecoder().decode(manifestEntry.data);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = BackupManifestSchema.safeParse(json);
  return parsed.success ? { manifest: parsed.data, entries } : null;
}
