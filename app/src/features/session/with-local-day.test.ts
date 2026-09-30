import { withLocalDay } from './with-local-day';

describe('withLocalDay', () => {
  it('keeps the local time of day when the day changes', () => {
    const started = new Date(2026, 8, 14, 18, 30, 15);
    const moved = new Date(withLocalDay(started.toISOString(), new Date(2026, 8, 20)));

    expect([moved.getFullYear(), moved.getMonth(), moved.getDate()]).toEqual([2026, 8, 20]);
    expect([moved.getHours(), moved.getMinutes(), moved.getSeconds()]).toEqual([18, 30, 15]);
  });

  it('leaves the timestamp untouched when the same day is confirmed', () => {
    const started = new Date(2026, 8, 14, 0, 30).toISOString();

    expect(withLocalDay(started, new Date(2026, 8, 14, 12))).toBe(started);
  });

  it('crosses a month and year boundary', () => {
    const started = new Date(2026, 11, 31, 9, 5);
    const moved = new Date(withLocalDay(started.toISOString(), new Date(2027, 0, 2)));

    expect([moved.getFullYear(), moved.getMonth(), moved.getDate()]).toEqual([2027, 0, 2]);
    expect([moved.getHours(), moved.getMinutes()]).toEqual([9, 5]);
  });
});
