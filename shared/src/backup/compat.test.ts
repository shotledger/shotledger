import { describe, expect, it } from 'vitest';

import { checkSchemaCompatibility, latestMigration } from './compat';

// The shape of app/src/db/migrations/meta/_journal.json, synthetic values.
const BASELINE = { tag: '0000_baseline', when: 1790148364655 };
const ADDED = { tag: '0001_added_column', when: 1790148364655 + 1000 };
const JOURNAL = { entries: [BASELINE, ADDED] };

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
  it('is ok when the bundle was exported on the same schema', () => {
    expect(checkSchemaCompatibility(bundleOn(ADDED), JOURNAL)).toBe('ok');
  });

  it('is ok for a bundle from an earlier migration, which the restore migrates forward', () => {
    expect(checkSchemaCompatibility(bundleOn(BASELINE), JOURNAL)).toBe('ok');
  });

  it('is a mismatch for a bundle from a newer build', () => {
    const newer = { tag: '0002_newer', when: ADDED.when + 1000 };
    expect(checkSchemaCompatibility(bundleOn(newer), JOURNAL)).toBe('mismatch');
  });

  it('is a mismatch for a baseline that was regenerated (same tag, different when)', () => {
    // Every baseline before the chain was frozen is `0000_baseline` at index 0.
    const older = { ...BASELINE, when: BASELINE.when - 1 };
    expect(checkSchemaCompatibility(bundleOn(older), JOURNAL)).toBe('mismatch');
  });

  it('is a mismatch when only the tag differs', () => {
    const otherTag = { ...ADDED, tag: '0001_other' };
    expect(checkSchemaCompatibility(bundleOn(otherTag), JOURNAL)).toBe('mismatch');
  });
});
