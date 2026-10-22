import { describe, expect, it } from 'vitest';
import type { PullRequest, PullResponse, SyncTableName } from '@shotledger/shared/src/sync';

import { WEB_TABLES, pullAll } from './pull';

const change = (tableName: SyncTableName, rowId: string, seq: number, payload: unknown) => ({
  tableName,
  rowId,
  seq,
  arrival: 1,
  payload,
  deletedAt: payload === null ? '2026-10-01T00:00:00.000Z' : null,
  updatedAt: '2026-10-01T00:00:00.000Z',
});

describe('WEB_TABLES', () => {
  it('W1 pulls the synced tag links and settings', () => {
    expect(WEB_TABLES).toContain('session_tags');
    expect(WEB_TABLES).toContain('settings');
  });
});

describe('pullAll', () => {
  it('asks every table from cursor 0, follows hasMore, and drops tombstones', async () => {
    const requests: PullRequest[] = [];
    const pages: PullResponse[] = [
      {
        protocolVersion: 1,
        refusals: [],
        changes: [
          change('sessions', 's1', 1, { id: 's1', name: 'One' }),
          change('sessions', 's2', 2, { id: 's2', name: 'Two' }),
          change('tags', 't1', 1, { id: 't1', name: 'Club' }),
        ],
        nextCursors: WEB_TABLES.map((tableName) => ({
          tableName,
          cursor: tableName === 'sessions' ? 2 : 0,
          hasMore: tableName === 'sessions',
        })),
      },
      {
        protocolVersion: 1,
        changes: [change('sessions', 's1', 3, null)],
        refusals: [],
        nextCursors: [{ tableName: 'sessions', cursor: 3, hasMore: false }],
      },
    ];
    const progress: number[] = [];

    const tables = await pullAll(
      {
        pull: (request) => {
          requests.push(request);
          return Promise.resolve(pages[requests.length - 1] as PullResponse);
        },
      },
      1,
      (rows) => progress.push(rows),
    );

    expect(requests[0]?.tables).toEqual(WEB_TABLES.map((tableName) => ({ tableName, cursor: 0 })));
    expect(requests[1]?.tables).toEqual([{ tableName: 'sessions', cursor: 2 }]);
    expect(requests).toHaveLength(2);
    expect([...tables.sessions.keys()]).toEqual(['s2']);
    expect(tables.tags.get('t1')).toEqual({ id: 't1', name: 'Club' });
    expect(progress).toEqual([3, 4]);
  });

  it('asks only the tables it is given', async () => {
    const requests: PullRequest[] = [];
    const tables = await pullAll(
      {
        pull: (request) => {
          requests.push(request);
          return Promise.resolve({
            protocolVersion: 1,
            changes: [change('firearms', 'f1', 1, { id: 'f1' })],
            refusals: [],
            nextCursors: [{ tableName: 'firearms', cursor: 1, hasMore: false }],
          });
        },
      },
      1,
      undefined,
      ['firearms', 'firearm_groups'],
    );
    expect(requests.map((r) => r.tables)).toEqual([
      [
        { tableName: 'firearms', cursor: 0 },
        { tableName: 'firearm_groups', cursor: 0 },
      ],
    ]);
    expect([...tables.firearms.keys()]).toEqual(['f1']);
    expect(tables.sessions.size).toBe(0);
  });

  it('keeps the refusals of the last response (spec §11.7); an empty list is none', async () => {
    const entry = (rowId: string, reason: 'invalid_payload' | 'family_refused') => ({
      tableName: 'shots' as const,
      rowId,
      reason,
      arrival: 3,
      blocker: reason === 'family_refused' ? { tableName: 'shots' as const, rowId: 't2' } : null,
    });
    const pages: PullResponse[] = [
      {
        protocolVersion: 1,
        changes: [],
        refusals: [entry('t2', 'invalid_payload')],
        nextCursors: [{ tableName: 'shots', cursor: 1, hasMore: true }],
      },
      {
        protocolVersion: 1,
        changes: [],
        refusals: [entry('t2', 'invalid_payload'), entry('t3', 'family_refused')],
        nextCursors: [{ tableName: 'shots', cursor: 2, hasMore: false }],
      },
    ];
    let page = 0;
    const pulled = await pullAll({ pull: () => Promise.resolve(pages[page++]!) }, 1, undefined, [
      'shots',
    ]);
    expect(pulled.refusals).toEqual(pages[1]!.refusals);

    const none = await pullAll(
      {
        pull: () =>
          Promise.resolve({
            protocolVersion: 1,
            changes: [],
            refusals: [],
            nextCursors: [{ tableName: 'shots', cursor: 0, hasMore: false }],
          }),
      },
      1,
      undefined,
      ['shots'],
    );
    expect(none.refusals).toEqual([]);
  });
});
