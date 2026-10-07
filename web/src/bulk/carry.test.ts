import { describe, expect, it } from 'vitest';

import { accountChanged } from './apply';
import { carry, clearCarried, peekCarried } from './carry';

describe('a status carried across a remount (R15)', () => {
  it('R15 is read until cleared, and only the last one is kept', () => {
    expect(peekCarried()).toBeNull();
    const first = accountChanged(null, 'u2');
    const second = accountChanged(null, 'u3');
    carry(first);
    carry(second);
    expect(peekCarried()).toBe(second);
    expect(peekCarried()).toBe(second);
    clearCarried();
    expect(peekCarried()).toBeNull();
  });
});
