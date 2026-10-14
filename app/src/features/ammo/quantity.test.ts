import { REAL_MAX, REAL_MIN } from '@shotledger/shared';

import { parseMeasure, parseQuantity } from './quantity';

describe('parseQuantity', () => {
  it.each([
    ['500', 500],
    [' 50 ', 50],
    ['0', 0],
  ])('reads %j as %j', (text, expected) => {
    expect(parseQuantity(text)).toBe(expected);
  });

  it.each(['', '  ', '12.5', '-5', '1e3', '50 rounds', '99999999999999999999'])(
    'reads %j as no quantity',
    (text) => {
      expect(parseQuantity(text)).toBeNull();
    },
  );
});

describe('parseMeasure', () => {
  it.each([
    ['147', 147],
    [' 4.5 ', 4.5],
    ['0', 0],
    ['1e3', 1000],
    [String(REAL_MAX), REAL_MAX],
    [String(REAL_MIN), REAL_MIN],
  ])('reads %j as %j', (text, expected) => {
    expect(parseMeasure(text)).toBe(expected);
  });

  // The server refuses a real column outside REAL_MIN..REAL_MAX, so the
  // screen stores none rather than a row that never syncs.
  it.each(['', '  ', 'abc', '4,5', 'Infinity', '1e15', String(REAL_MAX + 1), String(REAL_MIN - 1)])(
    'reads %j as no value',
    (text) => {
      expect(parseMeasure(text)).toBeNull();
    },
  );
});
