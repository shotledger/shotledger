// Platform wrapper for microphone shot detection (§0 rule 6) — the IPSC shot
// timer's only native surface. Detection itself is pure and lives in
// `shared/src/timer/shot-detector.ts`; this module does nothing but hand it a
// stream of dBFS levels.
//
// PRIVACY — the reason this file is shaped the way it is: expo-audio has no
// "meter without recording" mode, so a recording must exist for `metering` to
// be populated. It is written to the OS cache directory (never the document
// directory, which is what the backup bundle and any file browser reach),
// never read back, never shared, never synced, and `stop()` deletes it in a
// `finally` so an error on the way out still removes it. Nothing but the
// numeric level ever leaves this module. Do not add a code path that reads,
// copies, uploads or keeps `recorder.uri`.
import { AudioModule, RecordingPresets, setAudioModeAsync } from 'expo-audio';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/** How often the recorder's metering is polled. ~60 ms is well inside the 80 ms shot debounce. */
const POLL_INTERVAL_MS = 60;

/** Level reported when the OS has no reading yet — far below every sensitivity threshold. */
const SILENT_DB = -160;

export type MicPermission = 'granted' | 'denied' | 'unavailable';

export interface ShotListenerHandle {
  /** Stops metering and deletes the temporary recording. Safe to call twice. */
  stop: () => Promise<void>;
}

/** False on web, where expo-audio has no recording implementation we can meter. */
export function isShotListeningAvailable(): boolean {
  return Platform.OS !== 'web';
}

export async function getMicPermission(): Promise<MicPermission> {
  if (!isShotListeningAvailable()) return 'unavailable';
  try {
    const response = await AudioModule.getRecordingPermissionsAsync();
    return response.granted ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

export async function requestMicPermission(): Promise<MicPermission> {
  if (!isShotListeningAvailable()) return 'unavailable';
  try {
    const response = await AudioModule.requestRecordingPermissionsAsync();
    return response.granted ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

/**
 * Starts metering the microphone, calling `onLevel` with the current peak in
 * dBFS (<= 0) roughly every 60 ms. Rejects when the microphone is
 * unavailable or permission was refused.
 */
export async function startShotListening(
  onLevel: (db: number) => void,
): Promise<ShotListenerHandle> {
  if (!isShotListeningAvailable()) throw new Error('shot listening unavailable on this platform');

  // Lowest-quality preset on purpose: the audio is never played back, only
  // metered, so there is no reason to write a larger temporary file.
  const recorder = new AudioModule.AudioRecorder({
    ...RecordingPresets.LOW_QUALITY,
    isMeteringEnabled: true,
    directory: 'cache',
  });

  await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
  await recorder.prepareToRecordAsync();
  recorder.record();

  const interval = setInterval(() => {
    try {
      const status = recorder.getStatus();
      onLevel(status.metering ?? SILENT_DB);
    } catch {
      // A transient status read failure must not kill the run.
    }
  }, POLL_INTERVAL_MS);

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    clearInterval(interval);
    const uri = recorder.uri;
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
    } finally {
      deleteRecording(uri);
      try {
        recorder.release();
      } catch {
        // Best-effort cleanup.
      }
    }
  };

  return { stop };
}

/** Deletes the temp recording. Best-effort and synchronous so it also runs from a `finally`. */
function deleteRecording(uri: string | null): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // The OS clears its own cache directory anyway; never surface this.
  }
}
