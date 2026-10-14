// localToUtcIso against the platform's own zone data (#806): for every wall
// clock that exists in Stockholm, the UTC instant it returns reads back as
// that same wall clock there. Times inside the spring-forward gap do not
// exist and are left out.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { localToUtcIso } from './zoned-time';

const stockholm = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** The Stockholm wall clock of an instant as "YYYY-MM-DD HH:mm:ss". */
function wallClock(ms: number): string {
  return stockholm.format(new Date(ms));
}

describe('localToUtcIso properties', () => {
  it('maps every Stockholm wall clock back to an instant showing that wall clock', () => {
    fc.assert(
      fc.property(fc.integer({ min: Date.UTC(1990, 0, 1), max: Date.UTC(2090, 0, 1) }), (ms) => {
        const local = wallClock(Math.floor(ms / 1000) * 1000);
        expect(wallClock(Date.parse(localToUtcIso(local)))).toBe(local);
      }),
    );
  });
});
