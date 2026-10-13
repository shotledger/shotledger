import type { EditError } from '@shotledger/shared/src/sync-client/session-edit';
import { describe, expect, it } from 'vitest';

import { errorMessage, statusMessages } from './messages';
import { IDLE, type EditState } from './save';

const name = (id: string) => (id === 'gone' ? null : `Gun ${id}`);
const lines = (status: EditState['status']) => statusMessages({ status, held: null }, name);

describe('errorMessage', () => {
  it('names the row and the field', () => {
    const cases: [EditError, ReturnType<typeof errorMessage>][] = [
      [
        { kind: 'seriesText', row: 2, error: { kind: 'token', token: 'q', position: 3 } },
        { key: 'web.entry.errorToken', row: 2, params: { token: 'q', position: 3 } },
      ],
      [
        { kind: 'seriesText', row: 1, error: { kind: 'comma', token: '9,9', position: 1 } },
        { key: 'web.entry.errorComma', row: 1 },
      ],
      [
        { kind: 'tooManyShots', row: 3, max: 5 },
        { key: 'web.entry.errorTooManyShots', row: 3, params: { max: 5 } },
      ],
      [
        { kind: 'secondSighter', row: 4 },
        { key: 'web.entry.errorSecondSighter', row: 4 },
      ],
      [
        { kind: 'readOnlySeries', row: 5 },
        { key: 'web.edit.errorReadOnly', row: 5 },
      ],
      [
        { kind: 'tooLong', field: 'name', max: 80 },
        { key: 'web.entry.errorTooLong', params: { max: 80 }, fieldKey: 'session.name' },
      ],
      [
        { kind: 'tooLong', field: 'competitionName', max: 80 },
        { key: 'web.entry.errorTooLong', params: { max: 80 }, fieldKey: 'session.competitionName' },
      ],
      [
        { kind: 'tooLong', field: 'location', max: 120 },
        { key: 'web.entry.errorTooLong', params: { max: 120 }, fieldKey: 'session.location' },
      ],
      [
        { kind: 'tooLong', field: 'notes', max: 2000 },
        { key: 'web.entry.errorTooLong', params: { max: 2000 }, fieldKey: 'session.notes' },
      ],
      [{ kind: 'unknownFirearm' }, { key: 'web.entry.errorUnknownFirearm' }],
      [{ kind: 'unknownAmmoLot' }, { key: 'web.entry.errorUnknownAmmoLot' }],
      [{ kind: 'invalidStartedAt' }, { key: 'web.entry.errorDateTime' }],
      [{ kind: 'nothingToChange' }, { key: 'web.edit.nothingToChange' }],
      [
        { kind: 'tooManyChanges', max: 500, needed: 612 },
        { key: 'web.edit.errorTooMany', params: { needed: 612, max: 500 } },
      ],
      [{ kind: 'stale' }, { key: 'web.edit.stale' }],
      [{ kind: 'gone' }, { key: 'web.edit.gone' }],
    ];
    for (const [error, message] of cases) expect(errorMessage(error)).toEqual(message);
  });
});

describe('statusMessages (E9)', () => {
  it('idle says nothing; working says what runs', () => {
    expect(statusMessages(IDLE, name)).toEqual([]);
    expect(lines({ kind: 'working', action: 'save' })).toEqual([{ key: 'web.entry.saving' }]);
    expect(lines({ kind: 'working', action: 'delete' })).toEqual([{ key: 'web.edit.deleting' }]);
  });

  it('saved and deleted, refreshed', () => {
    const done = { refused: 0, firearmsToCheck: [] as string[], refreshed: true };
    expect(lines({ kind: 'done', action: 'save', ...done })).toEqual([{ key: 'web.entry.saved' }]);
    expect(lines({ kind: 'done', action: 'delete', ...done })).toEqual([
      { key: 'web.edit.deleted' },
    ]);
  });

  it('U7 saved in part: refused count, the firearms to check that still have a name, reload', () => {
    expect(
      lines({
        kind: 'done',
        action: 'save',
        refused: 2,
        firearmsToCheck: ['f1', 'gone', 'f2'],
        refreshed: false,
      }),
    ).toEqual([
      { key: 'web.entry.saved' },
      { key: 'web.bulk.refused', params: { count: 2 } },
      { key: 'web.bulk.checkRoundCounts', params: { count: 2 }, firearms: ['Gun f1', 'Gun f2'] },
      { key: 'web.bulk.reload' },
    ]);
    expect(
      lines({
        kind: 'done',
        action: 'save',
        refused: 1,
        firearmsToCheck: ['gone'],
        refreshed: true,
      }),
    ).toEqual([{ key: 'web.entry.saved' }, { key: 'web.bulk.refused', params: { count: 1 } }]);
  });

  it('stale, gone, account changed and invalid', () => {
    expect(lines({ kind: 'stale', fresh: {} as never })).toEqual([{ key: 'web.edit.stale' }]);
    expect(lines({ kind: 'gone', refreshed: true })).toEqual([{ key: 'web.edit.gone' }]);
    expect(lines({ kind: 'gone', refreshed: false })).toEqual([
      { key: 'web.edit.gone' },
      { key: 'web.bulk.reload' },
    ]);
    expect(lines({ kind: 'accountChanged' })).toEqual([{ key: 'web.edit.accountChanged' }]);
    expect(
      lines({ kind: 'invalid', errors: [{ kind: 'nothingToChange' }, { kind: 'unknownAmmoLot' }] }),
    ).toEqual([{ key: 'web.edit.nothingToChange' }, { key: 'web.entry.errorUnknownAmmoLot' }]);
  });

  it('failures: network, signed out, outdated, unconfirmed, anything else', () => {
    expect(lines({ kind: 'failed', error: 'network' })).toEqual([
      { key: 'web.edit.failedNetwork' },
    ]);
    expect(lines({ kind: 'failed', error: 'unauthenticated' })).toEqual([
      { key: 'web.edit.failedSignedOut' },
    ]);
    expect(lines({ kind: 'failed', error: 'versionUnsupported' })).toEqual([
      { key: 'web.edit.failedOutdated' },
    ]);
    expect(lines({ kind: 'failed', error: 'network', unconfirmed: true })).toEqual([
      { key: 'web.edit.failedUnconfirmed' },
    ]);
    expect(lines({ kind: 'failed', error: 'unknown' })).toEqual([{ key: 'web.entry.failed' }]);
  });
});
