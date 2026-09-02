import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { authorizeOwner } from './authz';

describe('authorizeOwner', () => {
  it('is ok when the requester is the resource owner', () => {
    expect(authorizeOwner('user-a', 'user-a')).toBe('ok');
  });

  it('is not_found when the resource belongs to a different user', () => {
    expect(authorizeOwner('user-a', 'user-b')).toBe('not_found');
  });

  it('is not_found when the resource does not exist (undefined owner)', () => {
    expect(authorizeOwner(undefined, 'user-a')).toBe('not_found');
  });

  it('is not_found when the resource does not exist (null owner)', () => {
    expect(authorizeOwner(null, 'user-a')).toBe('not_found');
  });

  it('property: same non-empty id on both sides is always ok', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (id) => {
        expect(authorizeOwner(id, id)).toBe('ok');
      }),
    );
  });

  it('property: any mismatched pair is always not_found, including empty/undefined/null owners', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string(), { nil: undefined }),
        fc.string({ minLength: 1 }),
        (ownerId, requesterId) => {
          fc.pre(ownerId !== requesterId);
          expect(authorizeOwner(ownerId, requesterId)).toBe('not_found');
        },
      ),
    );
  });
});
