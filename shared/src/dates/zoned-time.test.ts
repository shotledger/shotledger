import { describe, expect, it } from 'vitest';

import { localToUtcIso } from './zoned-time';

describe('localToUtcIso', () => {
  it('converts a summer (CEST, UTC+2) timestamp', () => {
    expect(localToUtcIso('2026-06-13 09:00:00')).toBe('2026-06-13T07:00:00.000Z');
  });

  it('converts a winter (CET, UTC+1) timestamp', () => {
    expect(localToUtcIso('2026-01-15 09:00:00')).toBe('2026-01-15T08:00:00.000Z');
  });

  it('converts a timestamp the day before the 2026 spring-forward transition (CET, UTC+1)', () => {
    expect(localToUtcIso('2026-03-28 12:00:00')).toBe('2026-03-28T11:00:00.000Z');
  });

  it('converts a timestamp the day after the 2026 spring-forward transition (CEST, UTC+2)', () => {
    expect(localToUtcIso('2026-03-30 12:00:00')).toBe('2026-03-30T10:00:00.000Z');
  });

  it('converts a timestamp the day before the 2026 fall-back transition (CEST, UTC+2)', () => {
    expect(localToUtcIso('2026-10-24 12:00:00')).toBe('2026-10-24T10:00:00.000Z');
  });

  it('converts a timestamp the day after the 2026 fall-back transition (CET, UTC+1)', () => {
    expect(localToUtcIso('2026-10-26 12:00:00')).toBe('2026-10-26T11:00:00.000Z');
  });

  // Inside the transition hour itself, where the second offset sample in
  // localToUtcIso matters. Clocks jump 02:00 → 03:00 on 2026-03-29 and
  // 03:00 → 02:00 on 2026-10-25.
  it('reads the non-existent spring-forward 02:30 as CET, landing on the same instant as 03:30 CEST', () => {
    expect(localToUtcIso('2026-03-29 02:30:00')).toBe('2026-03-29T01:30:00.000Z');
    expect(localToUtcIso('2026-03-29 03:30:00')).toBe('2026-03-29T01:30:00.000Z');
  });

  it('reads the ambiguous fall-back 02:30 as its second occurrence (CET)', () => {
    expect(localToUtcIso('2026-10-25 02:30:00')).toBe('2026-10-25T01:30:00.000Z');
  });

  it('throws on a malformed local timestamp, with the offending value in the message', () => {
    expect(() => localToUtcIso('not-a-timestamp')).toThrow(
      'Expected "YYYY-MM-DD HH:mm:ss", got "not-a-timestamp"',
    );
  });

  it('throws when the string has a valid timestamp with a garbage prefix (anchored match, not "found anywhere")', () => {
    expect(() => localToUtcIso('xx2026-06-13 09:00:00')).toThrow(RangeError);
  });

  it('throws when the string has a valid timestamp with a garbage suffix (anchored match, not "found anywhere")', () => {
    expect(() => localToUtcIso('2026-06-13 09:00:00xx')).toThrow(RangeError);
  });
});
