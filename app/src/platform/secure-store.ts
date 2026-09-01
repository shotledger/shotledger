// Platform wrapper for expo-secure-store (§0 rule 6). The WebShooter token
// is a hard "never a DB row" rule (integration spec §1) — this is its only
// storage. Web has no SecureStore-backed keychain; ShotLedger's web preview
// path is unaffected since WebShooter connect is a native-only flow (same
// posture as expo-sqlite's db/client.web.ts null-db fallback).
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const WEBSHOOTER_TOKEN_KEY = 'webshooter_token';

export async function getWebShooterToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await SecureStore.getItemAsync(WEBSHOOTER_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setWebShooterToken(token: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.setItemAsync(WEBSHOOTER_TOKEN_KEY, token);
  } catch {
    // Best-effort, same posture as platform/notifications.ts — a failed
    // keychain write surfaces to the caller as "still disconnected" rather
    // than a crash; the connect flow re-checks token presence afterwards.
  }
}

export async function clearWebShooterToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.deleteItemAsync(WEBSHOOTER_TOKEN_KEY);
  } catch {
    // best-effort, see setWebShooterToken
  }
}
