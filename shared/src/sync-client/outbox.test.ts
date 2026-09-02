import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ClientChangeSchema, SYNC_TABLE_NAMES } from '../sync/protocol';
import { buildClientChange } from './outbox';
import type { OutboxEntry } from './ports';

const entry: OutboxEntry = {
  tableName: 'sessions',
  rowId: 'row-1',
  rev: 7,
  clientChangeId: null,
};

const id = '11111111-1111-4111-8111-111111111111';

describe('buildClientChange', () => {
  it('returns null when the row no longer exists locally', () => {
    expect(buildClientChange(entry, undefined, id)).toBeNull();
  });

  it('sends the row payload for a live row', () => {
    const change = buildClientChange(
      entry,
      { payload: { id: 'row-1', name: 'Träning' }, updatedAt: 'u1', deletedAt: null },
      id,
    );
    expect(change).toEqual({
      clientChangeId: id,
      tableName: 'sessions',
      rowId: 'row-1',
      payload: { id: 'row-1', name: 'Träning' },
      deletedAt: null,
      updatedAt: 'u1',
    });
  });

  it('sends a null payload for a tombstoned row', () => {
    const change = buildClientChange(
      entry,
      { payload: { id: 'row-1' }, updatedAt: 'u2', deletedAt: 'd1' },
      id,
    );
    expect(change?.payload).toBeNull();
    expect(change?.deletedAt).toBe('d1');
  });

  it('property: the result always parses as a ClientChange', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SYNC_TABLE_NAMES),
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.option(fc.string({ minLength: 1, maxLength: 8 }), { nil: null }),
        fc.string({ minLength: 1, maxLength: 8 }),
        (tableName, rowId, deletedAt, updatedAt) => {
          const change = buildClientChange(
            { tableName, rowId, rev: 1, clientChangeId: null },
            { payload: { some: 'thing' }, updatedAt, deletedAt },
            id,
          );
          expect(ClientChangeSchema.safeParse(change).success).toBe(true);
        },
      ),
    );
  });
});
