// Web has no usable native filesystem backing (expo-sqlite's `db` is
// already `null` on web — see db/client.web.ts) and no SAF equivalent.
// Mirrors save-to-folder.ios.ts's unsupported shape.
export const isFolderSaveSupported = false;

export async function pickFolder(): Promise<string | null> {
  return null;
}

export async function saveBytesToFolder(): Promise<boolean> {
  return false;
}
