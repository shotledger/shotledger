// Web stub for the microphone shot listener — expo-audio's web build has no
// recording implementation we can meter, so the IPSC timer reports itself as
// unavailable in the web preview (same precedent as expo-sqlite's
// db/client.web.ts). Everything else on the screen still renders.
import type { MicPermission, ShotListenerHandle } from './shot-listener';

export function isShotListeningAvailable(): boolean {
  return false;
}

export async function getMicPermission(): Promise<MicPermission> {
  return 'unavailable';
}

export async function requestMicPermission(): Promise<MicPermission> {
  return 'unavailable';
}

export async function startShotListening(
  _onLevel: (db: number) => void,
): Promise<ShotListenerHandle> {
  throw new Error('shot listening unavailable on web');
}
