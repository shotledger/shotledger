import { resolveSeriesLength } from './series-length';

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
