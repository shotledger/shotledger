import { describe, expect, it } from 'vitest';

import { licenseCheckHash, replacementHash, routeFromHash } from './route';

describe('routeFromHash', () => {
  it.each([
    ['', { page: 'statistics', sessionId: null }],
    ['#statistics', { page: 'statistics', sessionId: null }],
    ['#account', { page: 'account', sessionId: null }],
    ['#entry', { page: 'entry', sessionId: null }],
    ['#bulk', { page: 'bulk', sessionId: null }],
    ['#settings', { page: 'settings', sessionId: null }],
    ['#sessions', { page: 'sessions', sessionId: null }],
    ['#sessions/', { page: 'sessions', sessionId: null }],
    ['#sessions/abc-123', { page: 'sessions', sessionId: 'abc-123' }],
    ['#sessions/a%20b', { page: 'sessions', sessionId: 'a b' }],
    ['#sessions/%E0%A4%A', { page: 'sessions', sessionId: null }],
    ['#sessions/abc-123/edit', { page: 'sessions', sessionId: 'abc-123', edit: true }],
    ['#sessions/a%2Fb/edit', { page: 'sessions', sessionId: 'a/b', edit: true }],
    ['#sessions//edit', { page: 'sessions', sessionId: null }],
    ['#sessions/abc-123/other', { page: 'sessions', sessionId: 'abc-123' }],
    ['#compare', { page: 'sessions', sessionId: null, compare: true }],
    ['#unknown', { page: 'statistics', sessionId: null }],
    ['#license-check', { page: 'statistics', sessionId: null, check: { view: 'overview' } }],
    ['#license-check/', { page: 'statistics', sessionId: null, check: { view: 'overview' } }],
    [
      '#license-check/new-firearm',
      { page: 'statistics', sessionId: null, check: { view: 'newFirearm' } },
    ],
    [
      '#license-check/firearm/a%2Fb',
      { page: 'statistics', sessionId: null, check: { view: 'firearm', firearmId: 'a/b' } },
    ],
    [
      '#license-check/firearm/',
      { page: 'statistics', sessionId: null, check: { view: 'overview' } },
    ],
    [
      '#license-check/firearm/%E0%A4%A',
      { page: 'statistics', sessionId: null, check: { view: 'overview' } },
    ],
    ['#license-check/other', { page: 'statistics', sessionId: null, check: { view: 'overview' } }],
  ])('%s', (hash, route) => {
    expect(routeFromHash(hash)).toEqual(route);
  });
});

describe('replacementHash (QA #747)', () => {
  it('names #statistics for an address no page answers, and nothing for a page', () => {
    expect(replacementHash('#unknown')).toBe('#statistics');
    expect(replacementHash('')).toBe('#statistics');
    expect(replacementHash('#statistics')).toBeNull();
    for (const hash of [
      '#account',
      '#entry',
      '#bulk',
      '#settings',
      '#sessions',
      '#sessions/x',
      '#compare',
      '#license-check',
      '#license-check/new-firearm',
      '#license-check/firearm/f1',
    ]) {
      expect(replacementHash(hash)).toBeNull();
    }
  });
});

describe('licenseCheckHash (#796)', () => {
  it('round-trips every License Check view through routeFromHash', () => {
    for (const check of [
      { view: 'overview' },
      { view: 'newFirearm' },
      { view: 'firearm', firearmId: 'a/b c' },
    ] as const) {
      expect(routeFromHash(licenseCheckHash(check)).check).toEqual(check);
    }
  });
});
