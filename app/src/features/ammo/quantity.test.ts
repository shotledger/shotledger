import { parseQuantity } from './quantity';

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
