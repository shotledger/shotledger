// Haptics behind a platform wrapper (§0 rule 6). `expo-haptics`
// (maintainer-approved 2026-09-02) on device; `haptics.web.ts` is the no-op
// variant. The API is still expressed as a pulse length because that is what
// the timer cues mean — expo-haptics has impact *styles*, so the length is
// mapped to the nearest one.
import * as Haptics from 'expo-haptics';

/** One short buzz. The default is the timer cues' pulse length. */
export function vibrate(durationMs = 120): void {
  const style =
    durationMs >= 200
      ? Haptics.ImpactFeedbackStyle.Heavy
      : durationMs >= 100
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light;
  try {
    void Haptics.impactAsync(style).catch(() => {
      // A device without a haptic engine rejects the promise — never a crash.
    });
  } catch {
    // Best-effort — a device without haptics must not break the timer.
  }
}

/**
 * No-op: expo-haptics fires one-shot impacts, so there is nothing running to
 * cancel. Kept so callers have the same shape as the previous `Vibration`
 * wrapper and the web variant.
 */
export function cancelVibration(): void {}
