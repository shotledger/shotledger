// Platform wrapper for expo-secure-store (§0 rule 6). The Webshooter token
// is a hard "never a DB row" rule (integration spec §1) — this is its only
// storage. Web has no SecureStore-backed keychain; ShotLedger's web preview
// path is unaffected since Webshooter connect is a native-only flow (same
// posture as expo-sqlite's db/client.web.ts null-db fallback).
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const WEBSHOOTER_TOKEN_KEY = 'webshooter_token';
// ShotLedger backend session token (better-auth bearer plugin). Same "never
// a DB row" rule as the Webshooter token — docs/specs/sync-app-spec.md §0.
const SYNC_SESSION_TOKEN_KEY = 'shotledger_session_token';

export async function getWebshooterToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await SecureStore.getItemAsync(WEBSHOOTER_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setWebshooterToken(token: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.setItemAsync(WEBSHOOTER_TOKEN_KEY, token);
  } catch {
    // Best-effort, same posture as platform/notifications.ts — a failed
    // keychain write surfaces to the caller as "still disconnected" rather
    // than a crash; the connect flow re-checks token presence afterwards.
  }
}

export async function clearWebshooterToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.deleteItemAsync(WEBSHOOTER_TOKEN_KEY);
  } catch {
    // best-effort, see setWebshooterToken
  }
}

export async function getSessionToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await SecureStore.getItemAsync(SYNC_SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setSessionToken(token: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.setItemAsync(SYNC_SESSION_TOKEN_KEY, token);
  } catch {
    // Best-effort, see setWebshooterToken. A failed keychain write surfaces
    // as "still signed out" on the next launch rather than a crash.
  }
}

export async function clearSessionToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.deleteItemAsync(SYNC_SESSION_TOKEN_KEY);
  } catch {
    // best-effort, see setSessionToken
  }
}
