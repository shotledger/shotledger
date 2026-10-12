import { sessionInnerTens } from './session-inner-tens';

const flagged = [
  {
    isSighter: false,
    isFinal: false,
    shots: [
      { valueTenths: 100, isInnerTen: true },
      { valueTenths: 100, isInnerTen: false },
    ],
    totalOverride: null,
  },
];

describe('sessionInnerTens', () => {
  it('uses a stored count, which wins over the shot flags', () => {
    expect(sessionInnerTens(7, [])).toBe(7);
    expect(sessionInnerTens(0, flagged)).toBe(0);
  });

  it('counts the shot flags when no count is stored', () => {
    expect(sessionInnerTens(null, flagged)).toBe(1);
    expect(sessionInnerTens(undefined, flagged)).toBe(1);
  });
});
