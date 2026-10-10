// The date and time inputs are local wall time. vitest.config.ts pins
// Europe/Stockholm, since in UTC (CI) local and UTC agree (R15).
import { describe, expect, it } from 'vitest';

import { startedAtIso } from './model';

describe('startedAtIso in Europe/Stockholm', () => {
  it('reads winter inputs as CET (UTC+1) and stores UTC', () => {
    // Fails loudly if the pinned zone is lost, rather than passing vacuously.
    expect(new Date(2026, 0, 15, 18, 45).getTimezoneOffset()).toBe(-60);
    expect(startedAtIso('2026-01-15', '18:45')).toBe('2026-01-15T17:45:00.000Z');
    // Just after midnight locally: the stored UTC day is the day before.
    expect(startedAtIso('2026-01-16', '00:30')).toBe('2026-01-15T23:30:00.000Z');
  });

  it('reads summer inputs as CEST (UTC+2) and stores UTC', () => {
    expect(new Date(2026, 6, 15, 18, 45).getTimezoneOffset()).toBe(-120);
    expect(startedAtIso('2026-07-15', '18:45')).toBe('2026-07-15T16:45:00.000Z');
    expect(startedAtIso('2026-07-16', '01:30')).toBe('2026-07-15T23:30:00.000Z');
  });
});
