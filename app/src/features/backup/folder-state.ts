// Pure state machine for the remembered "save to folder" destination: which
// SAF folder URI (if any) is persisted, and how it changes in response to a
// pick, a write, or an
// explicit "forget". No IO here — use-backup-export-import.ts drives this
// with the platform/db calls and persists the result via the settings
// table, the same way lastBackupAt is persisted.
export type FolderEvent =
  | { type: 'pick-succeeded'; folderUri: string }
  | { type: 'pick-canceled' }
  | { type: 'write-succeeded' }
  | { type: 'write-failed' }
  | { type: 'forget' };

/** `current` is the remembered folder URI, or `null` if none is set yet.
 * A failed write forgets the folder — SAF access can be revoked or the
 * folder deleted outside the app, so the next attempt re-prompts rather
 * than repeating the same failure. */
export function reduceFolderState(current: string | null, event: FolderEvent): string | null {
  switch (event.type) {
    case 'pick-succeeded':
      return event.folderUri;
    case 'pick-canceled':
    case 'write-succeeded':
      return current;
    case 'write-failed':
    case 'forget':
      return null;
  }
}
