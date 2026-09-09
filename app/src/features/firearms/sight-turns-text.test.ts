import type { TFunction } from 'i18next';

import { sightClicksDirectionText, sightClicksText } from './sight-turns-text';

const WORDS: Record<string, string> = {
  'firearms.sightDirectionUp': 'up',
  'firearms.sightDirectionDown': 'down',
  'firearms.sightDirectionLeft': 'left',
  'firearms.sightDirectionRight': 'right',
};

const t = ((key: string) => WORDS[key] ?? key) as unknown as TFunction;

describe('sightClicksText', () => {
  it('signs the count and shows an em dash for "not recorded"', () => {
    expect(sightClicksText(5)).toBe('+5');
    expect(sightClicksText(-5)).toBe('-5');
    expect(sightClicksText(0)).toBe('0');
    expect(sightClicksText(null)).toBe('—');
  });
});

describe('sightClicksDirectionText', () => {
  it('names the direction elevation clicks move the shot', () => {
    expect(sightClicksDirectionText(t, 5, 'elevation')).toBe('+5 up');
    expect(sightClicksDirectionText(t, -3, 'elevation')).toBe('-3 down');
  });

  it('names the direction windage clicks move the shot', () => {
    expect(sightClicksDirectionText(t, 5, 'windage')).toBe('+5 right');
    expect(sightClicksDirectionText(t, -3, 'windage')).toBe('-3 left');
  });

  it('leaves zero and "not recorded" undirected', () => {
    expect(sightClicksDirectionText(t, 0, 'elevation')).toBe('0');
    expect(sightClicksDirectionText(t, 0, 'windage')).toBe('0');
    expect(sightClicksDirectionText(t, null, 'elevation')).toBe('—');
  });
});
