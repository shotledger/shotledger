import type { TextLine } from '@react-native-ml-kit/text-recognition';

import { linesInReadingOrder } from './text-recognition';

function line(text: string, top: number, left: number, height = 30): TextLine {
  return {
    text,
    frame: { top, left, height, width: text.length * 10 },
    elements: [],
    recognizedLanguages: [],
  };
}

describe('linesInReadingOrder', () => {
  it('pairs a label column with a value column', () => {
    // What ML Kit returns for the synthetic card: one block per column, so
    // the engine's own flat text has all labels before any value.
    const lines = [
      line('Tillståndsnummer', 100, 40),
      line('Ändamål', 160, 40),
      line('A000.000/2026-01', 98, 330),
      line('Målskjutning', 162, 330),
    ];
    expect(linesInReadingOrder(lines, 'ignored')).toBe(
      'Tillståndsnummer  A000.000/2026-01\nÄndamål  Målskjutning',
    );
  });

  it('keeps rows in top-to-bottom order regardless of input order', () => {
    const lines = [line('third', 300, 10), line('first', 100, 10), line('second', 200, 10)];
    expect(linesInReadingOrder(lines, 'ignored')).toBe('first\nsecond\nthird');
  });

  it('separates rows that do not overlap vertically', () => {
    const lines = [line('a', 100, 10), line('b', 140, 300)];
    expect(linesInReadingOrder(lines, 'ignored')).toBe('a\nb');
  });

  it('falls back to the engine text when any line has no frame', () => {
    const lines = [line('a', 100, 10), { text: 'b', elements: [], recognizedLanguages: [] }];
    expect(linesInReadingOrder(lines, 'flat text')).toBe('flat text');
  });

  it('falls back when nothing was recognized', () => {
    expect(linesInReadingOrder([], 'flat text')).toBe('flat text');
  });
});
