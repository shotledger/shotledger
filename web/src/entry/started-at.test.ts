// The date and time inputs are local wall time. CI runs in UTC, where local
// and UTC agree, so these pin a zone with an offset (R15).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startedAtIso } from './model';

const original = process.env.TZ;

beforeAll(() => {
  // UTC-3 all year, no daylight saving since 2019.
  process.env.TZ = 'America/Sao_Paulo';
});

afterAll(() => {
  if (original === undefined) delete process.env.TZ;
  else process.env.TZ = original;
});

describe('startedAtIso in a zone that is not UTC', () => {
  it('reads the inputs as local time and stores UTC', () => {
    expect(new Date(2026, 9, 7, 18, 45).getTimezoneOffset()).toBe(180);
    expect(startedAtIso('2026-10-07', '18:45')).toBe('2026-10-07T21:45:00.000Z');
    // Past local midnight in UTC: the stored day moves on.
    expect(startedAtIso('2026-10-07', '22:30')).toBe('2026-10-08T01:30:00.000Z');
  });
});
