// Platform wrapper for shot timer cues (§0 rule 6). `TimerEngine` (shared/src/timer)
// emits cues as data only; this module is the thin, best-effort layer that
// turns a `TimerCueKind` into an actual sound (expo-audio) and a haptic
// pulse (platform/haptics.ts). Every call is wrapped so a missing asset or
// an unsupported platform (e.g. the web preview) degrades to a silent no-op
// instead of a crash — emulator/web audio can't be meaningfully verified
// per the task's audio caveat; see docs/specs/shot-timer-evidence.md.
import { createAudioPlayer, setAudioModeAsync, type AudioMode, type AudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';
import type { TimerCueKind } from '@shotledger/shared';

import { vibrate } from './haptics';

/**
 * The audio session the cues play in. `playsInSilentMode: false` is what
 * makes the phone's silent switch (iOS) and ringer mode (Android) mute the
 * beeps and the whistle, as `timer.cuesHint` promises: expo-audio puts the
 * iOS session in the ambient category — which also silences expo-speech,
 * since the synthesizer shares the app's session — and on Android refuses
 * to play while the ringer is not normal. Android's text-to-speech has no
 * such gate, so spoken commands there still play; that needs a native
 * module, i.e. a dependency decision.
 *
 * The shot listener records through the same session and, on iOS, recording
 * cannot share a session with silent-mode respect — it sets its own mode
 * while the microphone is open and restores this one afterwards.
 */
export const TIMER_AUDIO_MODE = {
  playsInSilentMode: false,
  interruptionMode: 'mixWithOthers',
  allowsRecording: false,
  shouldPlayInBackground: false,
} as const satisfies Partial<AudioMode>;

/** Puts the session in `TIMER_AUDIO_MODE`. Best-effort — never throws. */
export async function respectSilentMode(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await setAudioModeAsync(TIMER_AUDIO_MODE);
  } catch {
    // A refused mode leaves the cues playing as before; it must not stop a drill.
  }
}

const SOUND_SOURCES: Record<TimerCueKind, number> = {
  ready: require('../../assets/sounds/timer-ready.wav'),
  start: require('../../assets/sounds/timer-start.wav'),
  stop: require('../../assets/sounds/timer-stop.wav'),
  complete: require('../../assets/sounds/timer-complete.wav'),
  whistle: require('../../assets/sounds/timer-whistle.wav'),
};

/** One vibration pulse in ms — a single short buzz, cue kinds don't need distinct patterns (the sound differs). */
const VIBRATION_PULSE_MS = 120;

let players: Partial<Record<TimerCueKind, AudioPlayer>> | null = null;

function ensurePlayers(): Partial<Record<TimerCueKind, AudioPlayer>> {
  if (players) return players;
  players = {};
  if (Platform.OS === 'web') return players; // expo-audio's web support is out of scope here — see M1's expo-sqlite precedent for the same web gap.
  for (const kind of Object.keys(SOUND_SOURCES) as TimerCueKind[]) {
    try {
      players[kind] = createAudioPlayer(SOUND_SOURCES[kind]);
    } catch {
      // Missing/corrupt asset: leave this cue silent rather than crash the drill.
    }
  }
  return players;
}

/** Plays the sound for one cue kind. Best-effort — never throws. */
export function playTimerCueSound(kind: TimerCueKind): void {
  try {
    const player = ensurePlayers()[kind];
    if (!player) return;
    player.seekTo(0);
    player.play();
  } catch {
    // Best-effort — a playback failure should never interrupt the drill.
  }
}

/** Vibrates for one cue, when `TimerCue.vibrate` is true. Best-effort — never throws. */
export function vibrateForTimerCue(): void {
  vibrate(VIBRATION_PULSE_MS);
}

/** Releases all cached players — call on unmount so the timer screen doesn't leak native audio resources. */
export function releaseTimerCuePlayers(): void {
  if (!players) return;
  for (const player of Object.values(players)) {
    try {
      player?.remove();
    } catch {
      // Best-effort cleanup.
    }
  }
  players = null;
}
