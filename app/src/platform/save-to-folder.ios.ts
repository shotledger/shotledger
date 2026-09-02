// iOS has no folder-pick-and-write API short of the document picker's
// export mode (not implemented — no Mac available to verify). Callers fall
// back to the existing share sheet instead (Files app is a share target);
// see save-to-folder.ts for the Android implementation this mirrors.
export const isFolderSaveSupported = false;

export async function pickFolder(): Promise<string | null> {
  return null;
}

export async function saveBytesToFolder(): Promise<boolean> {
  return false;
}
