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

/**
 * Permission for a run, prompting only when it isn't already held. Asking
 * again when it is looks like a no-op but isn't: Android answers every
 * `requestPermissions` by opening (and instantly closing) the system grant
 * activity, which backgrounds and foregrounds this one — and expo-audio
 * reacts to that by pausing every recorder it still believes is recording.
 */
export async function ensureMicPermission(): Promise<MicPermission> {
  if (!isShotListeningAvailable()) return 'unavailable';
  const current = await getMicPermission();
  if (current === 'granted') return current;
  try {
    const response = await AudioModule.requestRecordingPermissionsAsync();
    return response.granted ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

/**
 * One recorder at a time. The setup level meter and the run meter the same
 * microphone through this module, and their handles are stopped fire-and-
 * forget from React effect cleanups — so without a queue a new recorder is
 * opened while the previous one is still releasing. Android then holds a
 * recorder expo-audio still counts as recording, and the next time the
 * activity goes to the background (which the permission prompt itself does)
 * expo-audio asks it to pause: `MediaRecorder.pause()` throws
 * `IllegalStateException` on the main thread and the process dies.
 */
let queue: Promise<unknown> = Promise.resolve();

/** The listener currently holding the microphone, stopped before a new one opens. */
let active: { stop: () => Promise<void> } | null = null;

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Starts metering the microphone, calling `onLevel` with the current peak in
 * dBFS (<= 0) roughly every 60 ms. Rejects when the microphone is
 * unavailable or permission was refused.
 */
export function startShotListening(onLevel: (db: number) => void): Promise<ShotListenerHandle> {
  if (!isShotListeningAvailable()) {
    return Promise.reject(new Error('shot listening unavailable on this platform'));
  }
  return serialize(() => openRecorder(onLevel));
}

async function openRecorder(onLevel: (db: number) => void): Promise<ShotListenerHandle> {
  await active?.stop();

  // Lowest-quality preset on purpose: the audio is never played back, only
  // metered, so there is no reason to write a larger temporary file.
  const recorder = new AudioModule.AudioRecorder({
    ...RecordingPresets.LOW_QUALITY,
    isMeteringEnabled: true,
    directory: 'cache',
  });

  try {
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  } catch (error) {
    // A recorder that never started must not stay registered with expo-audio.
    try {
      recorder.release();
    } catch {
      // Best-effort cleanup.
    }
    throw error;
  }

  const interval = setInterval(() => {
    try {
      const status = recorder.getStatus();
      onLevel(status.metering ?? SILENT_DB);
    } catch {
      // A transient status read failure must not kill the run.
    }
  }, POLL_INTERVAL_MS);

  let stopped = false;
  const stopNow = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    if (active?.stop === stopNow) active = null;
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

  active = { stop: stopNow };

  // The handle's stop goes through the queue; `stopNow` is what a following
  // start calls directly, since that already holds the queue.
  return { stop: () => serialize(stopNow) };
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
