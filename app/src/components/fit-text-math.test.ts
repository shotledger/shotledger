import { breaksInsideWord, nextFitScale } from './fit-text-math';

describe('breaksInsideWord', () => {
  it('accepts a line break between words, with or without the trailing space', () => {
    expect(breaksInsideWord('Shots Logged', ['Shots ', 'Logged'])).toBe(false);
    expect(breaksInsideWord('Shots Logged', ['Shots', 'Logged'])).toBe(false);
    expect(breaksInsideWord('Loggade skott', ['Loggade skott'])).toBe(false);
  });

  it('flags a single word split across lines', () => {
    expect(breaksInsideWord('Competitions', ['Competiti', 'ons'])).toBe(true);
    expect(breaksInsideWord('Shots Logged', ['Shots Log', 'ged'])).toBe(true);
  });

  it('flags a word dropped from the layout', () => {
    expect(breaksInsideWord('Shots Logged', ['Shots'])).toBe(true);
  });
});

describe('nextFitScale', () => {
  it('steps down by five percent and stops at the minimum', () => {
    expect(nextFitScale(1, 0.75)).toBe(0.95);
    expect(nextFitScale(0.9, 0.75)).toBe(0.85);
    expect(nextFitScale(0.78, 0.75)).toBe(0.75);
    expect(nextFitScale(0.75, 0.75)).toBe(0.75);
  });
});
