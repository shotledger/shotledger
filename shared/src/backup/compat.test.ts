import { describe, expect, it } from 'vitest';

import { checkSchemaCompatibility } from './compat';

describe('checkSchemaCompatibility', () => {
  it('is ok when the bundle predates the app (idx below migration count)', () => {
    expect(checkSchemaCompatibility(2, 4)).toBe('ok');
  });

  it('is ok when the bundle matches the app exactly', () => {
    expect(checkSchemaCompatibility(3, 4)).toBe('ok');
  });

  it('is newer when the bundle references a migration the app does not have', () => {
    expect(checkSchemaCompatibility(4, 4)).toBe('newer');
    expect(checkSchemaCompatibility(10, 4)).toBe('newer');
  });

  it('is ok for the first migration against a single-migration app', () => {
    expect(checkSchemaCompatibility(0, 1)).toBe('ok');
  });
});
