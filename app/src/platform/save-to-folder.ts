// Platform wrapper for "save to a user-chosen folder" (the export-destination
// ladder: share sheet → save to a user-chosen folder → scheduled → Drive
// API). Android default: Storage Access Framework, via the `legacy`
// FileSystem API — the new File/Directory API (see backup-fs.ts) has no SAF
// support. iOS has no folder-pick-and-write API short of the document
// picker's export mode (not implemented — no Mac available to verify), so
// it falls back to the share sheet instead; see save-to-folder.ios.ts.
import { StorageAccessFramework } from 'expo-file-system/legacy';

import { bytesToBase64 } from './base64';

export const isFolderSaveSupported = true;

/** Opens the SAF folder picker. Returns the granted folder's SAF URI, or
 * `null` if the user cancelled or denied access. */
export async function pickFolder(): Promise<string | null> {
  try {
    const result = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    return result.granted ? result.directoryUri : null;
  } catch {
    return null;
  }
}

/** Writes `bytes` as a new file named `filename` inside `folderUri` (a SAF
 * directory URI from `pickFolder`). Returns `false` if the folder is no
 * longer accessible (permission revoked, folder deleted, provider error) —
 * callers should treat that as "forget the folder and ask again". */
export async function saveBytesToFolder(
  folderUri: string,
  bytes: Uint8Array,
  filename: string,
): Promise<boolean> {
  try {
    const fileUri = await StorageAccessFramework.createFileAsync(
      folderUri,
      filename,
      'application/octet-stream',
    );
    await StorageAccessFramework.writeAsStringAsync(fileUri, bytesToBase64(bytes), {
      encoding: 'base64',
    });
    return true;
  } catch {
    return false;
  }
}
