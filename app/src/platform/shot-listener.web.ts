// Web stub for the microphone shot listener — expo-audio's web build ships
// `AudioStream` as a stub that never streams, so the timer reports
// itself as unavailable in the web preview (same precedent as expo-sqlite's
// db/client.web.ts). Everything else on the screen still renders.
import type { LevelWindow } from '@shotledger/shared';

import type { MicPermission, ShotListenerHandle, ShotListenerOptions } from './shot-listener';

export function isShotListeningAvailable(): boolean {
  return false;
}

export async function getMicPermission(): Promise<MicPermission> {
  return 'unavailable';
}

export async function ensureMicPermission(): Promise<MicPermission> {
  return 'unavailable';
}

export async function startShotListening(
  _onWindow: (window: LevelWindow) => void,
  _options?: ShotListenerOptions,
): Promise<ShotListenerHandle> {
  throw new Error('shot listening unavailable on web');
}
