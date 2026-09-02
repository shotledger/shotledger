// Spoken prompts (§0 rule 6 — the native module stays behind this wrapper).
// `expo-speech` on device; `speech.web.ts` is the Web Speech API variant.
// Every call is best-effort: `speak` returns false when nothing was spoken,
// so the caller can fall back to its tone instead of going silent.
import * as Speech from 'expo-speech';

export interface SpeakOptions {
  /** BCP-47 tag. The SPSF command wording is always spoken in 'sv-SE'; UI prompts follow the app language. */
  language?: string;
  /** 1 = normal. Lowered for the drawn-out "Eld upphör!" (SHB D.6.2: "utdrages under 3 sek"). */
  rate?: number;
  /** Called when the platform reports the utterance failed — used to fall back to a tone. */
  onError?: () => void;
}

/** False where no TTS engine can be reached at all (the web preview without speechSynthesis). */
export function isSpeechAvailable(): boolean {
  return true;
}

/**
 * Speaks one utterance, queued after any still in progress (expo-speech's
 * default) so back-to-back commands are not cut off. Returns false when the
 * call could not be made at all.
 */
export function speak(text: string, options: SpeakOptions = {}): boolean {
  try {
    if (__DEV__) console.log(`[speech] ${options.language ?? 'sv-SE'}: ${text}`);
    Speech.speak(text, {
      language: options.language ?? 'sv-SE',
      rate: options.rate,
      onError: options.onError,
    });
    return true;
  } catch {
    return false;
  }
}

/** Cancels anything queued or in progress (reset/stop, or leaving the screen). */
export function stopSpeaking(): void {
  try {
    void Speech.stop();
  } catch {
    // Best-effort — a failed cancel must never break the timer.
  }
}
