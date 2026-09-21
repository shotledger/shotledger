// Platform wrapper for microphone shot detection (§0 rule 6) — the IPSC shot
// timer's only native surface. Detection itself is pure and lives in
// `shared/src/timer/`; this module does nothing but hand it a stream of level
// windows.
//
// It captures raw PCM through expo-audio's `AudioStream` rather than metering
// a recording. The metering path could only report one coarse envelope value
// per poll, which is why detection could never be more than an amplitude
// threshold (#346) — and it had to keep a recording file alive on disk to get
// even that. `AudioStream` writes no file at all: nothing but the numeric
// level ever leaves this module, and there is no longer anything on disk for
// a later change to accidentally read, copy or sync.
import { AudioModule, setAudioModeAsync } from 'expo-audio';
import { PcmWindower, DEFAULT_WINDOW_MS, type LevelWindow } from '@shotledger/shared';
import { Platform } from 'react-native';

import { TIMER_AUDIO_MODE } from './timer-cues';

/**
 * What we ask the hardware for. Mono because a shot is in both channels and
 * the second one is only work; float32 because it is what both platforms
 * capture natively. The hardware may answer with a different rate, which is
 * why every buffer carries its own (`PcmWindower` measures against that).
 */
const STREAM_OPTIONS = { sampleRate: 48_000, channels: 1, encoding: 'float32' } as const;

export type MicPermission = 'granted' | 'denied' | 'unavailable';

export interface ShotListenerOptions {
  /**
   * Length of one level window. The detector wants ~10 ms to measure an
   * event; a meter wants something slower than it can redraw.
   */
  windowMs?: number;
}

export interface ShotListenerHandle {
  /** Stops the capture and releases the microphone. Safe to call twice. */
  stop: () => Promise<void>;
}

/** False on web, where expo-audio's AudioStream is a stub that never streams. */
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
 * One capture at a time. The setup level meter and the run meter the same
 * microphone through this module, and their handles are stopped fire-and-
 * forget from React effect cleanups — so without a queue a second capture is
 * opened while the first is still releasing, and the microphone is held by
 * an object nothing has a reference to any more.
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
 * Starts capturing, calling `onWindow` with one peak level per `windowMs` of
 * audio. Rejects when the microphone is unavailable or permission was
 * refused.
 *
 * Windows arrive in bursts: the native side hands over ~100 ms of audio at a
 * time, so ten 10 ms windows land in one call stack. Their `atMs` is the
 * audio sample clock, not the arrival time, which is exactly why the burst
 * does not cost any timing accuracy.
 */
export function startShotListening(
  onWindow: (window: LevelWindow) => void,
  options: ShotListenerOptions = {},
): Promise<ShotListenerHandle> {
  if (!isShotListeningAvailable()) {
    return Promise.reject(new Error('shot listening unavailable on this platform'));
  }
  return serialize(() => openStream(onWindow, options.windowMs ?? DEFAULT_WINDOW_MS));
}

async function openStream(
  onWindow: (window: LevelWindow) => void,
  windowMs: number,
): Promise<ShotListenerHandle> {
  await active?.stop();

  const stream = new AudioModule.AudioStream(STREAM_OPTIONS);
  const windower = new PcmWindower({ windowMs, encoding: STREAM_OPTIONS.encoding });

  const subscription = stream.addListener('audioStreamBuffer', (buffer) => {
    for (const window of windower.push(buffer)) onWindow(window);
  });

  try {
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await stream.start();
  } catch (error) {
    subscription.remove();
    try {
      stream.stop();
    } catch {
      // Best-effort cleanup.
    }
    throw error;
  }

  let stopped = false;
  const stopNow = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    if (active?.stop === stopNow) active = null;
    subscription.remove();
    try {
      stream.stop();
    } finally {
      // Hand the session back to the cues' silent-mode-respecting mode,
      // which recording on iOS cannot share (timer-cues.ts).
      await setAudioModeAsync({ ...TIMER_AUDIO_MODE, allowsRecording: false });
    }
  };

  active = { stop: stopNow };

  // The handle's stop goes through the queue; `stopNow` is what a following
  // start calls directly, since that already holds the queue.
  return { stop: () => serialize(stopNow) };
}
