import { describe, expect, it } from 'vitest';

import { routeFromHash } from './route';

describe('routeFromHash', () => {
  it.each([
    ['', { page: 'statistics', sessionId: null }],
    ['#statistics', { page: 'statistics', sessionId: null }],
    ['#account', { page: 'account', sessionId: null }],
    ['#entry', { page: 'entry', sessionId: null }],
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
