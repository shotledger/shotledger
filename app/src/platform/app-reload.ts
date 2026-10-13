// Restarts the JS app in place (§0 rule 6). `reloadAppAsync` ships with the
// `expo` package itself (via expo-modules-core): it reloads the bundle on
// Android and iOS, in dev and release builds alike, and reloads the page on
// web. No `expo-updates` needed — that is only for over-the-air delivery.
import { reloadAppAsync } from 'expo';

/** Reloads the app from its entry point, reopening the database singleton. */
export async function reloadApp(reason: string): Promise<void> {
  await reloadAppAsync(reason);
}
