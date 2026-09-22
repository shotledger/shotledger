// Whether a cue can actually be heard right now (§0 rule 6 — the native
// module stays behind this wrapper).
//
// iOS never asks: the timer's ambient audio session silences expo-speech
// along with the tones, because the synthesizer shares the app's session
// there. Android's ringer gate reaches expo-audio but not text-to-speech, so
// the spoken commands have to apply it themselves (#346) — which needs
// `AudioManager.getRingerMode()`, hence modules/ringer-mode.
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export type RingerMode = 'normal' | 'vibrate' | 'silent';

interface RingerModeNativeModule {
  getRingerMode: () => RingerMode;
}

const native = requireOptionalNativeModule<RingerModeNativeModule>('ShotLedgerRingerMode');

/**
 * Android's ringer mode, or null where the question does not apply: every
 * other platform, and an Android build made before the module existed.
 */
export function androidRingerMode(): RingerMode | null {
  if (Platform.OS !== 'android' || !native) return null;
  try {
    return native.getRingerMode();
  } catch {
    return null;
  }
}

/** False only when Android's ringer is silenced — never a reason to stay quiet by mistake. */
export function cuesAreAudible(): boolean {
  const mode = androidRingerMode();
  return mode === null || mode === 'normal';
}
