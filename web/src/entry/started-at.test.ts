// The date and time inputs are local wall time. vitest.config.ts pins a zone
// with an offset, since in UTC (CI) local and UTC agree (R15).
import { describe, expect, it } from 'vitest';

import { startedAtIso } from './model';

describe('startedAtIso in a zone that is not UTC', () => {
  it('reads the inputs as local time and stores UTC', () => {
    // Fails loudly if the pinned zone is lost, rather than passing vacuously.
    expect(new Date(2026, 9, 7, 18, 45).getTimezoneOffset()).toBe(180);
    expect(startedAtIso('2026-10-07', '18:45')).toBe('2026-10-07T21:45:00.000Z');
    // Past midnight in UTC: the stored day moves on.
    expect(startedAtIso('2026-10-07', '22:30')).toBe('2026-10-08T01:30:00.000Z');
  });
});
