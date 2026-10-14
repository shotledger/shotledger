import { routePosition } from './route-position';

describe('routePosition', () => {
  it('takes a whole position from 1', () => {
    expect(routePosition('1')).toBe(1);
    expect(routePosition('12')).toBe(12);
  });

  it('treats anything else as not found', () => {
    for (const param of [undefined, '', '0', '1.5', '1e3', '-1', ' 1', 'abc', '1'.repeat(400)])
      expect(routePosition(param)).toBeNull();
  });
});
