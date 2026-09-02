import { describe, expect, it } from 'vitest';

import { buildShotlogRef } from './ref';

const BASE = { datetime: '2026-05-04T09:00:00Z', name: 'Club Cup A', totalScore: 312 };

describe('buildShotlogRef', () => {
  it('produces a prefixed 16-hex-digit reference', () => {
    expect(buildShotlogRef(BASE)).toMatch(/^shotlog:[0-9a-f]{16}$/u);
  });

  // Golden values: the ref is persisted as `sessions.external_ref`, so the
  // exact digest is part of the contract — changing the hash would orphan
  // every previously imported session's idempotency key.
  it.each([
    ['ASCII', BASE, 'shotlog:293f06c481d76de2'],
    [
      'non-ASCII',
      { datetime: '2026-05-04T09:00:00Z', name: 'Tävling A', totalScore: 300 },
      'shotlog:5f9a9ddb69601df9',
    ],
    [
      // Half-word starting 0x03: proves each half is zero-padded to 8 hex
      // digits rather than concatenated at its natural length.
      'leading-zero',
      { datetime: '2026-05-04T09:00:00Z', name: 'Club Cup 16', totalScore: 300 },
      'shotlog:03f9ace948c52f3b',
    ],
  ])('matches its golden %s digest', (_label, input, expected) => {
    expect(buildShotlogRef(input)).toBe(expected);
  });

  it('is deterministic', () => {
    expect(buildShotlogRef(BASE)).toBe(buildShotlogRef({ ...BASE }));
  });

  it.each([
    ['datetime', { datetime: '2026-05-04T09:00:01Z' }],
    ['name', { name: 'Club Cup B' }],
    ['total score', { totalScore: 313 }],
  ])('changes when the %s changes', (_label, patch) => {
    expect(buildShotlogRef({ ...BASE, ...patch })).not.toBe(buildShotlogRef(BASE));
  });

  it('separates the fields so a shifted boundary does not collide', () => {
    expect(buildShotlogRef({ ...BASE, name: 'Club Cup A 312', totalScore: 0 })).not.toBe(
      buildShotlogRef(BASE),
    );
  });

  it('distinguishes names differing only in a non-ASCII character', () => {
    expect(buildShotlogRef({ ...BASE, name: 'Tävling A' })).not.toBe(
      buildShotlogRef({ ...BASE, name: 'Tavling A' }),
    );
  });

  it('distinguishes two names whose non-ASCII characters share a low byte', () => {
    // 'ä' (U+00E4) vs 'ä' with a different high byte (U+01E4) — the low byte
    // alone would collide, so the high byte must contribute.
    expect(buildShotlogRef({ ...BASE, name: 'ä' })).not.toBe(
      buildShotlogRef({ ...BASE, name: 'Ǥ' }),
    );
  });

  it('is stable across 500 synthetic rows (no collisions)', () => {
    const refs = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      refs.add(
        buildShotlogRef({
          datetime: '2026-05-04T09:00:00Z',
          name: `Club Cup ${i}`,
          totalScore: 300 + i,
        }),
      );
    }
    expect(refs.size).toBe(500);
  });
});
