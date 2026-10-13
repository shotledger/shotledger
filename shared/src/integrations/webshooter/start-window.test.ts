import { describe, expect, it } from 'vitest';

import { formatStartWindow } from './start-window';

describe('formatStartWindow', () => {
  it('says the date once and drops the always-zero seconds', () => {
    expect(formatStartWindow('2026-09-12 09:50:00', '2026-09-12 11:20:00')).toBe(
      '2026-09-12 09:50–11:20',
    );
  });

  it('marks a window that runs past midnight the way arrival times do', () => {
    expect(formatStartWindow('2026-09-12 23:40:00', '2026-09-13 00:30:00')).toBe(
      '2026-09-12 23:40–00:30+1',
    );
  });

  it('counts more than one day when it has to', () => {
    expect(formatStartWindow('2026-09-12 23:40:00', '2026-09-14 00:30:00')).toBe(
      '2026-09-12 23:40–00:30+2',
    );
  });

  it('handles a month boundary, where day arithmetic usually breaks', () => {
    expect(formatStartWindow('2026-09-30 23:00:00', '2026-10-01 01:00:00')).toBe(
      '2026-09-30 23:00–01:00+1',
    );
  });

  it('handles a year boundary too', () => {
    expect(formatStartWindow('2026-12-31 22:00:00', '2027-01-01 02:00:00')).toBe(
      '2026-12-31 22:00–02:00+1',
    );
  });

  it('accepts the ISO T separator as well as a space', () => {
    expect(formatStartWindow('2026-09-12T09:50:00', '2026-09-12T11:20:00')).toBe(
      '2026-09-12 09:50–11:20',
    );
  });

  it('adds no suffix when the end is somehow earlier', () => {
    // Bad data should read oddly, not gain a misleading "-1".
    expect(formatStartWindow('2026-09-12 09:50:00', '2026-09-11 11:20:00')).toBe(
      '2026-09-12 09:50–11:20',
    );
  });

  it('falls back to the raw values rather than showing a blank', () => {
    expect(formatStartWindow('not a time', '2026-09-12 11:20:00')).toBe(
      'not a time–2026-09-12 11:20:00',
    );
  });

  it('shows the day and both times through the given format', () => {
    const format = { day: (date: string) => `<${date}>`, time: (time: string) => `[${time}]` };
    expect(formatStartWindow('2026-09-12 23:40:00', '2026-09-13 00:30:00', format)).toBe(
      '<2026-09-12> [23:40]–[00:30]+1',
    );
  });
});
