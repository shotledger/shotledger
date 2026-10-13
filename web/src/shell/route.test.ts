import { describe, expect, it } from 'vitest';

import { replacementHash, routeFromHash } from './route';

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
    ['#compare', { page: 'sessions', sessionId: null, compare: true }],
    ['#unknown', { page: 'statistics', sessionId: null }],
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
    ]) {
      expect(replacementHash(hash)).toBeNull();
    }
  });
});
