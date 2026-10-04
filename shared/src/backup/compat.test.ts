import { describe, expect, it } from 'vitest';

import { checkSchemaCompatibility, latestMigration } from './compat';

// The shape of app/src/db/migrations/meta/_journal.json, synthetic values.
const BASELINE = { tag: '0000_baseline', when: 1790148364655 };

function bundleOn(identity: { tag: string; when: number }) {
  return { schemaMigrationTag: identity.tag, schemaMigrationWhen: identity.when };
}

describe('latestMigration', () => {
  it('is the last journal entry, reduced to its tag and when', () => {
    const journal = {
      version: '7',
      entries: [
        { idx: 0, version: '6', when: 1, tag: '0000_first', breakpoints: true },
        { idx: 1, version: '6', when: 2, tag: '0001_second', breakpoints: true },
      ],
    };
    expect(latestMigration(journal)).toEqual({ tag: '0001_second', when: 2 });
  });

  it('refuses an empty journal rather than inventing an identity', () => {
    expect(() => latestMigration({ entries: [] })).toThrow(/migration journal has no entries/);
  });
});

describe('checkSchemaCompatibility', () => {
  it('is ok when the bundle was exported on the same baseline', () => {
    expect(checkSchemaCompatibility(bundleOn(BASELINE), BASELINE)).toBe('ok');
  });

  it('is a mismatch when the baseline was reset since (same tag, different when)', () => {
    // The case the old index check could never see: every reset baseline is
    // `0000_baseline` at index 0.
    const older = { ...BASELINE, when: BASELINE.when - 1 };
    expect(checkSchemaCompatibility(bundleOn(older), BASELINE)).toBe('mismatch');
  });

  it('is a mismatch for a bundle from a newer baseline', () => {
    const newer = { ...BASELINE, when: BASELINE.when + 1 };
    expect(checkSchemaCompatibility(bundleOn(newer), BASELINE)).toBe('mismatch');
  });

  it('is a mismatch when only the tag differs', () => {
    const otherTag = { ...BASELINE, tag: '0001_added_column' };
    expect(checkSchemaCompatibility(bundleOn(otherTag), BASELINE)).toBe('mismatch');
  });
});
