import { describe, expect, it } from 'vitest';
import type { PullRequest, PullResponse, SyncTableName } from '@shotledger/shared/src/sync';

import { WEB_TABLES, pullAll } from './pull';

const change = (tableName: SyncTableName, rowId: string, seq: number, payload: unknown) => ({
  tableName,
  rowId,
  seq,
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
});
