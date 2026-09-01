import { Redirect, Stack } from 'expo-router';

// Dev routes (seed/wipe demo data, component gallery) must be reachable in
// dev builds only (§4 M2) — not linked from the tab shell, and redirected
// away from a release build if someone deep-links in.
export default function DevLayout() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
