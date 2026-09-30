import { beforeEach, describe, expect, it } from 'vitest';

import { createTestDb } from '../test-db';
import type { Database } from '../types';
import {
  FLAG_OVERRIDES_KEY,
  getFlagOverrides,
  resolveFlag,
  setFlagOverride,
} from './feature-flags';
import { setSetting } from './settings';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe('resolveFlag', () => {
  const overridable = { build: false, overridable: true };

  it('returns the build value when there is no override', () => {
    expect(resolveFlag(overridable, undefined, true)).toBe(false);
    expect(resolveFlag({ build: true, overridable: true }, undefined, true)).toBe(true);
  });

  it('applies an override when overrides are allowed', () => {
    expect(resolveFlag(overridable, true, true)).toBe(true);
    expect(resolveFlag({ build: true, overridable: true }, false, true)).toBe(false);
  });

  it('ignores an override when overrides are not allowed, as in a release build', () => {
    expect(resolveFlag(overridable, true, false)).toBe(false);
  });

  it('ignores an override on a flag that is not overridable', () => {
    expect(resolveFlag({ build: false, overridable: false }, true, true)).toBe(false);
  });
});

describe('flag overrides', () => {
  it('starts empty', () => {
    expect(getFlagOverrides(db)).toEqual({});
  });

  it('sets, keeps others, and clears an override', () => {
    setFlagOverride(db, 'a', true);
    setFlagOverride(db, 'b', false);
    expect(getFlagOverrides(db)).toEqual({ a: true, b: false });

    setFlagOverride(db, 'a', null);
    expect(getFlagOverrides(db)).toEqual({ b: false });
  });

  it('drops malformed stored values instead of throwing', () => {
    setSetting(db, FLAG_OVERRIDES_KEY, { a: 'yes', b: true });
    expect(getFlagOverrides(db)).toEqual({ b: true });

    setSetting(db, FLAG_OVERRIDES_KEY, [true]);
    expect(getFlagOverrides(db)).toEqual({});
  });
});
