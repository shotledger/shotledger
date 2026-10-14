/**
 * Pure helpers behind `FitText` (#823). Kept apart from the component so the
 * rule — a wrapped caption may break between words, never inside one — is
 * tested without rendering.
 */

/** How much each fitting pass shrinks the font, as a fraction of the base size. */
export const FIT_STEP = 0.05;

/**
 * Whether laying `text` out as `lines` broke a line inside a word
 * ("Competiti" / "ons"). Compares words rather than offsets, so it does not
 * care whether a platform keeps the space at the end of a line or drops it.
 */
export function breaksInsideWord(text: string, lines: readonly string[]): boolean {
  const words = (s: string) => s.split(/\s+/).filter(Boolean);
  const laidOut = lines.flatMap(words);
  const original = words(text);
  return laidOut.length !== original.length || laidOut.some((word, i) => word !== original[i]);
}

/** The next smaller scale, never below `minimumScale`. */
export function nextFitScale(scale: number, minimumScale: number): number {
  // Rounded so repeated steps land on 0.85, not 0.8500000000000001.
  return Math.max(minimumScale, Math.round((scale - FIT_STEP) * 100) / 100);
}
