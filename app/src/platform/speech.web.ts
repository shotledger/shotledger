// Web variant of platform/speech.ts — the browser's Web Speech API, which
// the web preview may not expose at all (then `speak` reports false and the
// caller falls back to its tone).
import type { SpeakOptions } from './speech';

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null;
}

export function isSpeechAvailable(): boolean {
  return synth() !== null;
}

export function speak(text: string, options: SpeakOptions = {}): boolean {
  const speechSynthesis = synth();
  if (!speechSynthesis) return false;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.language ?? 'sv-SE';
    if (options.rate !== undefined) utterance.rate = options.rate;
    if (options.onError) utterance.onerror = options.onError;
    speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking(): void {
  try {
    synth()?.cancel();
  } catch {
    // Best-effort.
  }
}

export type { SpeakOptions };
