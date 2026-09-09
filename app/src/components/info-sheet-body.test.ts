import { toParagraphs } from './info-sheet-body';

describe('toParagraphs', () => {
  it('returns a single paragraph unchanged', () => {
    expect(toParagraphs('Only places you have used before are suggested.')).toEqual([
      'Only places you have used before are suggested.',
    ]);
  });

  it('splits on a blank line', () => {
    expect(toParagraphs('Off: nothing leaves your phone.\n\nOn: text is sent away.')).toEqual([
      'Off: nothing leaves your phone.',
      'On: text is sent away.',
    ]);
  });

  it('treats a blank line of whitespace as a break', () => {
    expect(toParagraphs('First.\n   \nSecond.')).toEqual(['First.', 'Second.']);
  });

  it('collapses source wrapping inside a paragraph to single spaces', () => {
    expect(toParagraphs('A sentence that was\nwrapped   in the  source.')).toEqual([
      'A sentence that was wrapped in the source.',
    ]);
  });

  it('drops empty paragraphs and surrounding whitespace', () => {
    expect(toParagraphs('\n\nFirst.\n\n\n\nSecond.\n\n')).toEqual(['First.', 'Second.']);
  });

  it('returns nothing for a body that is only whitespace', () => {
    expect(toParagraphs('   \n \n ')).toEqual([]);
  });
});
