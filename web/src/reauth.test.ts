import { describe, expect, it } from 'vitest';

import { afterReauth } from './reauth';

describe('after the inline sign-in', () => {
  it('R22 the same account only clears the signed-out notice', () => {
    expect(afterReauth({ userId: 'a', generation: 3 }, 'a')).toEqual({
      outcome: 'same',
      next: { userId: 'a', generation: 3 },
    });
  });

  it('R22 another account reloads the logbook under a new generation', () => {
    expect(afterReauth({ userId: 'a', generation: 3 }, 'b')).toEqual({
      outcome: 'switched',
      next: { userId: 'b', generation: 4 },
    });
  });

  it('R22 an account whose user was never confirmed is reloaded too', () => {
    expect(afterReauth({ userId: null, generation: 0 }, 'a')).toEqual({
      outcome: 'switched',
      next: { userId: 'a', generation: 1 },
    });
  });
});
