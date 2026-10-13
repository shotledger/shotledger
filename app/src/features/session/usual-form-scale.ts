// Where the "Usual" and "Today" marks sit on the session Stats view's bars
// (#798). The bar is centred on the usual figure and spans two of the
// shooter's usual spreads either side, widened when today falls outside that,
// so the distance between the marks reads as "how far from usual".

export interface UsualFormMarks {
  /** Position in [0,1] along the bar; always 0.5. */
  usual: number;
  /** Position in [0,1] along the bar; within [0.1, 0.9]. */
  today: number;
}

export function usualFormMarks(usual: number, today: number, sd: number | null): UsualFormMarks {
  const difference = today - usual;
  const halfSpan = Math.max(2 * (sd ?? 0), 1.25 * Math.abs(difference), 1);
  return { usual: 0.5, today: 0.5 + difference / (2 * halfSpan) };
}

/** "+1.60", "-0.40", "0.00" — never a signed zero after rounding. */
export function signed(value: number, digits: number): string {
  const text = value.toFixed(digits);
  if (Number(text) === 0) return (0).toFixed(digits);
  return value > 0 ? `+${text}` : text;
}
