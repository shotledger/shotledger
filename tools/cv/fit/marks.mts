// A marks file: one photo per line, `<name> x,y x,y ...`, in mark-holes'
// label px. A line starting with PRELABEL holds the shipped classifier's
// guesses (CV_MARK_PRELABEL), not a human's: every reader skips it until the
// marker is deleted, which is what confirming the line means.
export const PRELABEL = '?';

export type Marks = Map<string, [number, number][]>;

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .filter((parts) => parts[0]);

/** The confirmed marks, by photo. */
export function parseMarks(text: string): Marks {
  const marks: Marks = new Map();
  for (const parts of lines(text)) {
    if (parts[0]!.startsWith(PRELABEL)) continue;
    marks.set(
      parts[0]!,
      parts.slice(1).map((p) => p.split(',').map(Number) as [number, number]),
    );
  }
  return marks;
}

/** Every photo with a line, confirmed or pre-labelled. */
export function namesInMarks(text: string): Set<string> {
  return new Set(
    lines(text).map(([name]) =>
      name!.startsWith(PRELABEL) ? name!.slice(PRELABEL.length) : name!,
    ),
  );
}

/** A pre-labelled line, rounded to whole label px as a human reads them. */
export function prelabelLine(name: string, points: readonly (readonly [number, number])[]): string {
  return [
    `${PRELABEL}${name}`,
    ...points.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`),
  ].join(' ');
}
