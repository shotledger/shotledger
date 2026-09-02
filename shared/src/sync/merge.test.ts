import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { mergeChange, nextSequence, REJECTED_TOMBSTONED, type StoredRow } from './merge';
import type { ClientChange } from './protocol';

function change(overrides: Partial<ClientChange> = {}): ClientChange {
  return {
    clientChangeId: '11111111-1111-4111-8111-111111111111',
    tableName: 'firearms',
    rowId: 'row-1',
    payload: { make: 'Anschutz' },
    deletedAt: null,
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function row(overrides: Partial<StoredRow> = {}): StoredRow {
  return {
    tableName: 'firearms',
    rowId: 'row-1',
    seq: 1,
    payload: { make: 'Anschutz' },
    updatedAt: '2026-08-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('nextSequence', () => {
  it('N1 increments by exactly one', () => {
    expect(nextSequence(0)).toBe(1);
    expect(nextSequence(41)).toBe(42);
  });
});

describe('mergeChange — R1 create', () => {
  it('R1a applies a live create with no existing row', () => {
    const result = mergeChange(undefined, change(), 1);
    expect(result).toEqual({
      status: 'applied',
      row: {
        tableName: 'firearms',
        rowId: 'row-1',
        seq: 1,
        payload: { make: 'Anschutz' },
        updatedAt: '2026-08-01T00:00:00.000Z',
        deletedAt: null,
      },
    });
  });

  it('R1b applies a change that arrives already-deleted with no existing row', () => {
    const result = mergeChange(
      undefined,
      change({ deletedAt: '2026-08-02T00:00:00.000Z', payload: null }),
      1,
    );
    expect(result).toEqual({
      status: 'applied',
      row: {
        tableName: 'firearms',
        rowId: 'row-1',
        seq: 1,
        payload: null,
        updatedAt: '2026-08-01T00:00:00.000Z',
        deletedAt: '2026-08-02T00:00:00.000Z',
      },
    });
  });
});

describe('mergeChange — R2 tombstone-wins', () => {
  it('R2a rejects a live edit over an already-tombstoned row', () => {
    const existing = row({ deletedAt: '2026-08-02T00:00:00.000Z', payload: null, seq: 5 });
    const result = mergeChange(existing, change({ updatedAt: '2026-09-01T00:00:00.000Z' }), 6);
    expect(result).toEqual({ status: 'rejected', reason: REJECTED_TOMBSTONED });
  });

  it('R2b rejection is independent of updatedAt ordering (no clock comparison)', () => {
    // The incoming change claims an updatedAt far LATER than the tombstone's,
    // and still loses — proves the rule does not compare timestamps at all.
    const existing = row({ deletedAt: '2020-01-01T00:00:00.000Z', payload: null, seq: 5 });
    const result = mergeChange(existing, change({ updatedAt: '2099-01-01T00:00:00.000Z' }), 6);
    expect(result).toEqual({ status: 'rejected', reason: REJECTED_TOMBSTONED });
  });
});

describe('mergeChange — R3 LWW via server order', () => {
  it('R3a applies a live update over a live existing row, using the new seq', () => {
    const existing = row({ seq: 5, payload: { make: 'Old' } });
    const result = mergeChange(existing, change({ payload: { make: 'New' } }), 6);
    expect(result).toEqual({
      status: 'applied',
      row: {
        tableName: 'firearms',
        rowId: 'row-1',
        seq: 6,
        payload: { make: 'New' },
        updatedAt: '2026-08-01T00:00:00.000Z',
        deletedAt: null,
      },
    });
  });

  it('R3b applies a delete over a live existing row', () => {
    const existing = row({ seq: 5, payload: { make: 'Old' } });
    const result = mergeChange(
      existing,
      change({ deletedAt: '2026-08-03T00:00:00.000Z', payload: null }),
      6,
    );
    expect(result).toEqual({
      status: 'applied',
      row: {
        tableName: 'firearms',
        rowId: 'row-1',
        seq: 6,
        payload: null,
        updatedAt: '2026-08-01T00:00:00.000Z',
        deletedAt: '2026-08-03T00:00:00.000Z',
      },
    });
  });

  it('R3d always stores a null payload on delete, even if the caller violates the payload-null-on-delete invariant', () => {
    // mergeChange does not itself re-validate its input (the zod refine on
    // ClientChangeSchema is the caller's job); this proves the merge
    // function is still defensive on its own, not merely lucky because
    // every schema-valid fixture already carries payload: null here.
    const existing = row({ seq: 5, payload: { make: 'Old' } });
    const badChange = change({
      deletedAt: '2026-08-03T00:00:00.000Z',
      payload: { make: 'should be dropped' },
    });
    const result = mergeChange(existing, badChange, 6);
    expect(result).toEqual({
      status: 'applied',
      row: {
        tableName: 'firearms',
        rowId: 'row-1',
        seq: 6,
        payload: null,
        updatedAt: '2026-08-01T00:00:00.000Z',
        deletedAt: '2026-08-03T00:00:00.000Z',
      },
    });
  });

  it('R3c applies a re-delete over an already-tombstoned row (idempotent delete)', () => {
    const existing = row({ seq: 5, deletedAt: '2026-08-02T00:00:00.000Z', payload: null });
    const result = mergeChange(
      existing,
      change({ deletedAt: '2026-08-02T00:00:00.000Z', payload: null }),
      6,
    );
    expect(result.status).toBe('applied');
  });
});

describe('mergeChange — R4 idempotent re-application', () => {
  it('R4a calling mergeChange twice with the same inputs yields the same result', () => {
    const existing = row({ seq: 5 });
    const c = change({ payload: { make: 'New' } });
    const first = mergeChange(existing, c, 6);
    const second = mergeChange(existing, c, 6);
    expect(second).toEqual(first);
  });

  it('R4b holds for a rejected (tombstoned) outcome too', () => {
    const existing = row({ seq: 5, deletedAt: '2026-08-02T00:00:00.000Z', payload: null });
    const c = change();
    const first = mergeChange(existing, c, 6);
    const second = mergeChange(existing, c, 6);
    expect(second).toEqual(first);
    expect(first.status).toBe('rejected');
  });
});

describe('mergeChange — properties', () => {
  const arbTombstone: fc.Arbitrary<StoredRow> = fc.record({
    tableName: fc.constant('firearms'),
    rowId: fc.constant('row-1'),
    seq: fc.integer({ min: 1, max: 1000 }),
    payload: fc.constant(null),
    updatedAt: fc.constant('2020-01-01T00:00:00.000Z'),
    deletedAt: fc.string({ minLength: 1, maxLength: 20 }),
  });

  const arbLiveChange: fc.Arbitrary<ClientChange> = fc.record({
    clientChangeId: fc.constant('11111111-1111-4111-8111-111111111111'),
    tableName: fc.constant('firearms'),
    rowId: fc.constant('row-1'),
    payload: fc.jsonValue(),
    deletedAt: fc.constant(null),
    updatedAt: fc.string({ minLength: 1, maxLength: 30 }),
  });

  it('PR1 a live edit is always rejected over any tombstoned existing row, for any seq', () => {
    fc.assert(
      fc.property(
        arbTombstone,
        arbLiveChange,
        fc.integer({ min: 1, max: 100000 }),
        (existing, c, seq) => {
          const result = mergeChange(existing, c, seq);
          expect(result).toEqual({ status: 'rejected', reason: REJECTED_TOMBSTONED });
        },
      ),
    );
  });

  const arbExistingOrUndefined: fc.Arbitrary<StoredRow | undefined> = fc.option(arbTombstone, {
    nil: undefined,
  });

  it('PR2 mergeChange is a pure function: repeat calls with identical inputs never diverge', () => {
    fc.assert(
      fc.property(
        arbExistingOrUndefined,
        arbLiveChange,
        fc.integer({ min: 1, max: 100000 }),
        (existing, c, seq) => {
          const first = mergeChange(existing, c, seq);
          const second = mergeChange(existing, c, seq);
          expect(second).toEqual(first);
        },
      ),
    );
  });
});
