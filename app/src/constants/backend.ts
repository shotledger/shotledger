// Where the optional ShotLedger sync backend lives. Configurable per build
// via app.json's `expo.extra.apiBaseUrl` (or EXPO_PUBLIC_API_BASE_URL for a
// local Worker), so no URL is baked into the code and no secret is needed —
// the base URL is public information; the session token is not, and lives in
// SecureStore (docs/specs/sync-app-spec.md §0).
import Constants from 'expo-constants';

export const DEFAULT_API_BASE_URL = 'https://web.shotledger.app';

function fromExtra(): string | undefined {
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: unknown } | undefined;
  return typeof extra?.apiBaseUrl === 'string' && extra.apiBaseUrl.length > 0
    ? extra.apiBaseUrl
    : undefined;
}

export function apiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  const resolved = (fromEnv && fromEnv.length > 0 ? fromEnv : fromExtra()) ?? DEFAULT_API_BASE_URL;
  return resolved.replace(/\/+$/, '');
}
