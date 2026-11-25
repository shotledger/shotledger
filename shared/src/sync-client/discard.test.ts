// docs/specs/sync-discard-refused-spec.md §2.1, scenarios SEND, OK*, FAIL*.
import { describe, expect, it } from 'vitest';

import type { PushAck, PushRequest } from '../sync/protocol';
import { discardRefused } from './discard';

const ID = '00000000-0000-4000-8000-000000000001';
const NOW = '2026-11-25T20:00:00.000Z';
const T2 = { tableName: 'shots', rowId: 'T2' } as const;

function answering(answer: (request: PushRequest) => PushAck[] | Error) {
  const sent: PushRequest[] = [];
  return {
    sent,
    transport: {
      push: async (request: PushRequest) => {
        sent.push(request);
        const acks = answer(request);
        if (acks instanceof Error) throw acks;
        return { protocolVersion: 1, acks };
      },
    },
  };
}

const ack = (status: PushAck['status'], extra: Partial<PushAck> = {}): PushAck => ({
  clientChangeId: ID,
  status,
  arrival: 7,
  ...extra,
});

const run = (answer: (request: PushRequest) => PushAck[] | Error) => {
  const fake = answering(answer);
  return { fake, outcome: discardRefused(fake.transport, T2, NOW, () => ID) };
};

describe('discardRefused', () => {
  it('SEND pushes exactly one tombstone of the bad row', async () => {
    const { fake, outcome } = run(() => [ack('applied', { seq: 3 })]);
    await outcome;
    expect(fake.sent).toEqual([
      {
        protocolVersion: 1,
        changes: [
          {
            clientChangeId: ID,
            tableName: 'shots',
            rowId: 'T2',
            payload: null,
            deletedAt: NOW,
            updatedAt: NOW,
          },
        ],
      },
    ]);
  });

  it('SEND takes a fresh id for every attempt', async () => {
    const ids = ['00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b'];
    const fake = answering((r) => [
      { ...ack('applied'), clientChangeId: r.changes[0]!.clientChangeId },
    ]);
    let n = 0;
    const next = () => ids[n++]!;
    await discardRefused(fake.transport, T2, NOW, next);
    await discardRefused(fake.transport, T2, NOW, next);
    expect(fake.sent.map((r) => r.changes[0]!.clientChangeId)).toEqual(ids);
  });

  it('OK an applied ack is discarded, at its arrival', async () => {
    await expect(run(() => [ack('applied', { seq: 3 })]).outcome).resolves.toEqual({
      kind: 'discarded',
      arrival: 7,
    });
  });

  it('OK an applied ack is discarded whatever its reason says', async () => {
    await expect(run(() => [ack('applied', { reason: 'note' })]).outcome).resolves.toEqual({
      kind: 'discarded',
      arrival: 7,
    });
  });

  it('OK-DUP a duplicate ack with no reason is discarded', async () => {
    await expect(run(() => [ack('duplicate', { arrival: 4 })]).outcome).resolves.toEqual({
      kind: 'discarded',
      arrival: 4,
    });
  });

  it('OK-TOMB a tombstoned rejection, or its replay, is discarded', async () => {
    await expect(
      run(() => [ack('rejected', { reason: 'tombstoned', arrival: 5 })]).outcome,
    ).resolves.toEqual({ kind: 'discarded', arrival: 5 });
    await expect(
      run(() => [ack('duplicate', { reason: 'tombstoned', arrival: 6 })]).outcome,
    ).resolves.toEqual({ kind: 'discarded', arrival: 6 });
  });

  it('FAIL-NET a transport error fails with its key', async () => {
    const network = new TypeError('Failed to fetch');
    await expect(run(() => network).outcome).resolves.toEqual({
      kind: 'failed',
      error: 'network',
    });
  });

  it('FAIL-UNCONFIRMED acks that do not match fail', async () => {
    await expect(run(() => []).outcome).resolves.toEqual({ kind: 'failed', error: 'unknown' });
    await expect(run(() => [ack('applied'), ack('applied')]).outcome).resolves.toEqual({
      kind: 'failed',
      error: 'unknown',
    });
    await expect(
      run(() => [{ ...ack('applied'), clientChangeId: '00000000-0000-4000-8000-000000000009' }])
        .outcome,
    ).resolves.toEqual({ kind: 'failed', error: 'unknown' });
  });

  it('FAIL-OTHER any other rejection fails', async () => {
    for (const a of [
      ack('rejected', { reason: 'invalid_payload' }),
      ack('rejected', { reason: 'family_refused' }),
      ack('rejected'),
      ack('duplicate', { reason: 'invalid_payload' }),
    ]) {
      await expect(run(() => [a]).outcome).resolves.toEqual({ kind: 'failed', error: 'unknown' });
    }
  });
});
