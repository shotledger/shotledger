import { describe, expect, it } from 'vitest';
import { normalizeCardNumber } from './index.js';

describe('webshooter barrel export', () => {
  it('re-exports identity.ts', () => {
    expect(normalizeCardNumber('12 456')).toBe('12456');
  });
});
