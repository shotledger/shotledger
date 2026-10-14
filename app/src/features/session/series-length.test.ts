import { MAX_SERIES_LENGTH, parseSeriesLength, resolveSeriesLength } from './series-length';

describe('resolveSeriesLength', () => {
  it('lets a fixed format decide over the session and the discipline', () => {
    expect(resolveSeriesLength(5, 10, 10)).toBe(5);
  });

  it("uses the length chosen at creation over the discipline's default", () => {
    expect(resolveSeriesLength(null, 5, 10)).toBe(5);
  });

  it("falls back to the discipline's default when nothing was chosen", () => {
    expect(resolveSeriesLength(undefined, null, 10)).toBe(10);
  });

  it('falls back to 5 for an unknown discipline', () => {
    expect(resolveSeriesLength(undefined, null, undefined)).toBe(5);
  });
});

describe('parseSeriesLength', () => {
  it('takes whole digits from 1 to the cap', () => {
    expect(parseSeriesLength('1')).toBe(1);
    expect(parseSeriesLength(' 10 ')).toBe(10);
    expect(parseSeriesLength(String(MAX_SERIES_LENGTH))).toBe(MAX_SERIES_LENGTH);
  });

  it('refuses what Number() would let through as a whole number', () => {
    for (const text of ['1e20', '1e2', '5.0', '0x10', '+5', '5 5', ''])
      expect(parseSeriesLength(text)).toBeNull();
  });

  it('refuses zero and anything over the cap', () => {
    expect(parseSeriesLength('0')).toBeNull();
    expect(parseSeriesLength('00')).toBeNull();
    expect(parseSeriesLength(String(MAX_SERIES_LENGTH + 1))).toBeNull();
    // The cap is the longest series any discipline uses, so the keypad fits.
    expect(MAX_SERIES_LENGTH).toBe(10);
    expect(parseSeriesLength('11')).toBeNull();
    expect(parseSeriesLength('100')).toBeNull();
    expect(parseSeriesLength('1'.repeat(400))).toBeNull();
  });
});
