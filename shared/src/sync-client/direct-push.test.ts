import { describe, expect, it } from 'vitest';

import type { ClientChange, PushAck, PushRequest } from '../sync/protocol';
import { pushChanges } from './direct-push';
import { createHttpSyncTransport } from './http';

const change = (n: number, tableName: ClientChange['tableName'] = 'shots'): ClientChange => ({
  clientChangeId: `00000000-0000-4000-8000-00000000000${n}`,
  tableName,
  rowId: `row-${n}`,
  payload: { id: `row-${n}` },
  deletedAt: null,
  updatedAt: '2026-10-07T10:00:00.000Z',
});

const CHANGES = [change(1, 'firearms'), change(2, 'sessions'), change(3)];

const ack = (c: ClientChange, status: PushAck['status'], reason?: string): PushAck => ({
  clientChangeId: c.clientChangeId,
  status,
  arrival: 1,
  ...(status === 'applied' ? { seq: 1 } : {}),
  ...(reason === undefined ? {} : { reason }),
});

function answering(acks: PushAck[]) {
  const sent: PushRequest[] = [];
  return {
    sent,
    transport: {
      push: async (request: PushRequest) => {
        sent.push(request);
        return { protocolVersion: 1, acks };
      },
    },
  };
}

describe('pushChanges', () => {
  it('D1 all applied → saved', async () => {
    const { transport } = answering(CHANGES.map((c) => ack(c, 'applied')));
    await expect(pushChanges(transport, 1, CHANGES)).resolves.toEqual({ kind: 'saved' });
    // Only a rejection or a replayed one carries meaning in `reason`.
    const stray = answering(CHANGES.map((c) => ack(c, 'applied', 'note')));
    await expect(pushChanges(stray.transport, 1, CHANGES)).resolves.toEqual({ kind: 'saved' });
  });

  it('D2 duplicate acks → saved', async () => {
    const all = answering(CHANGES.map((c) => ack(c, 'duplicate')));
    await expect(pushChanges(all.transport, 1, CHANGES)).resolves.toEqual({ kind: 'saved' });
    const mixed = answering([
      ack(CHANGES[2]!, 'applied'),
      ack(CHANGES[0]!, 'duplicate'),
      ack(CHANGES[1]!, 'applied'),
    ]);
    await expect(pushChanges(mixed.transport, 1, CHANGES)).resolves.toEqual({ kind: 'saved' });
  });

  it('D2 a duplicate of a change that was rejected stays rejected', async () => {
    const { transport } = answering([
      ack(CHANGES[0]!, 'duplicate', 'tombstoned'),
      ack(CHANGES[1]!, 'duplicate'),
      ack(CHANGES[2]!, 'duplicate'),
    ]);
    await expect(pushChanges(transport, 1, CHANGES)).resolves.toEqual({
      kind: 'partlyRejected',
      rejected: [{ tableName: 'firearms', rowId: 'row-1', reason: 'tombstoned' }],
    });
  });

  it('D3 a rejected ack → partlyRejected naming the table and row', async () => {
    const { transport } = answering([
      ack(CHANGES[0]!, 'rejected', 'tombstoned'),
      ack(CHANGES[1]!, 'applied'),
      ack(CHANGES[2]!, 'rejected'),
    ]);
    await expect(pushChanges(transport, 1, CHANGES)).resolves.toEqual({
      kind: 'partlyRejected',
      rejected: [
        { tableName: 'firearms', rowId: 'row-1', reason: 'tombstoned' },
        { tableName: 'shots', rowId: 'row-3', reason: 'rejected' },
      ],
    });
  });

  it.each([
    [401, 'unauthenticated'],
    [403, 'unauthenticated'],
    [409, 'versionUnsupported'],
    [413, 'payloadTooLarge'],
    [500, 'network'],
    [503, 'network'],
    [408, 'network'],
    [429, 'network'],
    [400, 'unknown'],
  ] as const)('D4 HTTP %i → %s', async (status, error) => {
    const transport = createHttpSyncTransport({
      fetchImpl: async () => new Response('nope', { status }),
      baseUrl: 'https://example.invalid',
      getToken: () => 'token',
    });
    await expect(pushChanges(transport, 1, CHANGES)).resolves.toEqual({ kind: 'failed', error });
  });

  it('D4 a rejected fetch → network', async () => {
    const transport = createHttpSyncTransport({
      fetchImpl: () => Promise.reject(new Error('offline')),
      baseUrl: 'https://example.invalid',
      getToken: () => 'token',
    });
    await expect(pushChanges(transport, 1, CHANGES)).resolves.toEqual({
      kind: 'failed',
      error: 'network',
    });
  });

  it.each([
    ['missing', CHANGES.slice(0, 2).map((c) => ack(c, 'applied'))],
    ['extra', [...CHANGES, change(4)].map((c) => ack(c, 'applied'))],
    ['unknown', [...CHANGES.slice(0, 2), change(5)].map((c) => ack(c, 'applied'))],
    ['repeated', [...CHANGES.slice(0, 2), CHANGES[0]!].map((c) => ack(c, 'applied'))],
    ['empty', []],
  ])('D5 a %s ack → failed: unknown, unconfirmed (the server did answer)', async (_name, acks) => {
    const { transport } = answering(acks);
    await expect(pushChanges(transport, 1, CHANGES)).resolves.toEqual({
      kind: 'failed',
      error: 'unknown',
      unconfirmed: true,
    });
  });

  it('D6 the request sent is exactly { protocolVersion, changes } in the given order', async () => {
    const { transport, sent } = answering(CHANGES.map((c) => ack(c, 'applied')));
    await pushChanges(transport, 7, CHANGES);
    expect(sent).toEqual([{ protocolVersion: 7, changes: CHANGES }]);
    expect(Object.keys(sent[0]!)).toEqual(['protocolVersion', 'changes']);
  });
});
