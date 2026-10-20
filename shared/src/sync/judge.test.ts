// docs/specs/sync-family-refusal-spec.md §11.4–§11.5: the pure judge of one
// push. The same scenarios run against the real Worker in
// backend/test/sync-family-refusal.spec.ts; these pin the function's edges.
import { describe, expect, it } from 'vitest';

import type { RowRef } from './family';
import { judgePush, type PushSnapshot, type RefusalRecord, type StoredLink } from './judge';
import type { ClientChange, SyncTableName } from './protocol';

let n = 0;
function live(tableName: SyncTableName, rowId: string, payload: unknown = {}): ClientChange {
  n += 1;
  return { clientChangeId: `c${n}`, tableName, rowId, payload, deletedAt: null, updatedAt: 'u' };
}
const dead = (tableName: SyncTableName, rowId: string): ClientChange => ({
  ...live(tableName, rowId, null),
  deletedAt: 'd',
});
const ref = (tableName: SyncTableName, rowId: string): RowRef => ({ tableName, rowId });
const S = (id = 's1') => live('sessions', id);
const R = (id: string, sessionId = 's1') => live('series', id, { session_id: sessionId });
const T = (id: string, seriesId: string) => live('shots', id, { series_id: seriesId });
const F = (id = 'f1') => live('firearms', id);
const L = (id: string, firearmId = 'f1') => live('licenses', id, { firearm_id: firearmId });

function bad(
  tableName: SyncTableName,
  rowId: string,
  arrival: number,
  parent: RowRef | null = null,
) {
  return {
    tableName,
    rowId,
    reason: 'invalid_payload',
    parent,
    arrival,
    blocker: null,
  } satisfies RefusalRecord;
}
/** A waiting record; `blocker` is the one stored with it (null: none stored yet). */
function waiting(
  tableName: SyncTableName,
  rowId: string,
  arrival: number,
  parent: RowRef | null = null,
  blocker: RowRef | null = null,
) {
  return {
    tableName,
    rowId,
    reason: 'family_refused',
    parent,
    arrival,
    blocker,
  } satisfies RefusalRecord;
}
function stored(
  tableName: SyncTableName,
  rowId: string,
  parent: RowRef | null = null,
  deleted = false,
) {
  return { tableName, rowId, parent, deleted } satisfies StoredLink;
}

function snapshot(partial: Partial<PushSnapshot> = {}): PushSnapshot {
  return { stateRev: 0, recorded: new Set(), records: [], stored: [], ...partial };
}

/** The verdict kinds, in push order. */
const kinds = (changes: ClientChange[], invalid: number[], snap = snapshot()) =>
  judgePush(changes, new Set(invalid), snap).verdicts.map((v) => v.kind);

// Stored: s1 with series r1, r2; r1 has shot t1.
const FAMILY: StoredLink[] = [
  stored('sessions', 's1'),
  stored('series', 'r1', ref('sessions', 's1')),
  stored('series', 'r2', ref('sessions', 's1')),
  stored('shots', 't1', ref('series', 'r1')),
];

describe('judgePush: arrival and precedence', () => {
  it('arrives at state_rev + 1', () => {
    expect(judgePush([S()], new Set(), snapshot({ stateRev: 41 })).arrival).toBe(42);
  });

  it('a recorded clientChangeId is a duplicate and changes nothing', () => {
    const replay = live('sessions', 's1', { name: null });
    const plan = judgePush(
      [replay, R('r9')],
      new Set([0]),
      snapshot({ recorded: new Set([replay.clientChangeId]) }),
    );
    expect(plan.verdicts).toEqual([{ kind: 'duplicate' }, { kind: 'applied' }]);
  });

  it('the second change with one clientChangeId in a push is a duplicate', () => {
    const first = R('r1');
    expect(kinds([first, { ...first }], [])).toEqual(['applied', 'duplicate']);
  });

  it('a tombstone is applied, even of a bad row’s family (C3)', () => {
    const snap = snapshot({ records: [bad('sessions', 's1', 1)], stored: FAMILY });
    expect(kinds([dead('shots', 't1')], [], snap)).toEqual(['applied']);
  });

  it('a live change over a stored tombstone is tombstoned, before invalid (F10)', () => {
    const snap = snapshot({ stored: [stored('series', 'r1', ref('sessions', 's1'), true)] });
    expect(kinds([R('r1'), R('r1')], [1], snap)).toEqual(['tombstoned', 'tombstoned']);
  });

  it('a live change after a tombstone of its row in the same push is tombstoned', () => {
    expect(kinds([R('r1'), dead('series', 'r1'), R('r1')], [])).toEqual([
      'applied',
      'applied',
      'tombstoned',
    ]);
  });

  it('an invalid change keeps invalid_payload, with the parent its payload names', () => {
    const plan = judgePush([T('t9', 'r1')], new Set([0]), snapshot());
    expect(plan.verdicts).toEqual([{ kind: 'invalid_payload', parent: ref('series', 'r1') }]);
  });

  it('a table with no family is never family-refused', () => {
    const snap = snapshot({ records: [bad('tags', 'g1', 1)] });
    expect(kinds([live('tags', 'g2'), live('settings', 'birthYear')], [], snap)).toEqual([
      'applied',
      'applied',
    ]);
  });
});

describe('judgePush: the blocked rule (§11.4)', () => {
  it('a remembered bad row blocks a later row of its session through stored links (X9)', () => {
    const snap = snapshot({
      stateRev: 7,
      records: [bad('shots', 't2', 3, ref('series', 'r1'))],
      stored: FAMILY,
    });
    const plan = judgePush([T('t3', 'r2')], new Set(), snap);
    expect(plan.verdicts).toEqual([
      { kind: 'family_refused', parent: ref('series', 'r2'), blocker: ref('shots', 't2') },
    ]);
  });

  it('a bad row in this push blocks its whole session, up, across and down', () => {
    const changes = [S(), R('r1'), T('t1', 'r1'), T('t2', 'r1'), R('r2')];
    expect(kinds(changes, [2])).toEqual([
      'family_refused',
      'family_refused',
      'invalid_payload',
      'family_refused',
      'family_refused',
    ]);
  });

  it('names the bad row with the lowest arrival, then by table, then by id', () => {
    const records = [
      bad('shots', 't5', 4, ref('series', 'r1')),
      bad('shots', 't4', 4, ref('series', 'r1')),
      bad('series', 'r9', 4, ref('sessions', 's1')),
      bad('shots', 't1', 6, ref('series', 'r1')),
    ];
    const plan = judgePush([R('r3')], new Set(), snapshot({ records, stored: FAMILY }));
    expect(plan.verdicts[0]).toMatchObject({ blocker: ref('series', 'r9') });
    const noSeries = records.filter((r) => r.tableName !== 'series');
    const next = judgePush([R('r3')], new Set(), snapshot({ records: noSeries, stored: FAMILY }));
    expect(next.verdicts[0]).toMatchObject({ blocker: ref('shots', 't4') });
  });

  it('a bad row of this push arrives at this push, after remembered ones', () => {
    const records = [bad('shots', 't5', 4, ref('series', 'r1'))];
    const plan = judgePush(
      [T('t0', 'r1'), R('r3')],
      new Set([0]),
      snapshot({ stateRev: 9, records, stored: FAMILY }),
    );
    expect(plan.verdicts[1]).toMatchObject({ blocker: ref('shots', 't5') });
    const alone = judgePush(
      [T('t0', 'r1'), R('r3')],
      new Set([0]),
      snapshot({ stateRev: 9, stored: FAMILY }),
    );
    expect(alone.verdicts[1]).toMatchObject({ blocker: ref('shots', 't0') });
  });

  it('keeps two sessions apart', () => {
    const snap = snapshot({ records: [bad('sessions', 's1', 1)] });
    expect(kinds([R('r8', 's2'), live('sessions', 's2')], [], snap)).toEqual([
      'applied',
      'applied',
    ]);
  });

  it('a bad firearm blocks its rows; a bad license blocks only itself (C2)', () => {
    const snap = snapshot({ records: [bad('licenses', 'l1', 1, ref('firearms', 'f1'))] });
    expect(
      kinds([F(), L('l2'), live('firearm_groups', 'g1', { firearm_id: 'f1' })], [], snap),
    ).toEqual(['applied', 'applied', 'applied']);
    const firearmBad = snapshot({ records: [bad('firearms', 'f1', 1)] });
    const plan = judgePush([L('l2'), F('f2')], new Set(), firearmBad);
    expect(plan.verdicts).toEqual([
      { kind: 'family_refused', parent: ref('firearms', 'f1'), blocker: ref('firearms', 'f1') },
      { kind: 'applied' },
    ]);
  });

  it('a firearm row’s link comes from its record or stored row when the push lacks it', () => {
    const snap = snapshot({
      records: [bad('firearms', 'f1', 1)],
      stored: [stored('licenses', 'l7', ref('firearms', 'f1'))],
    });
    expect(kinds([live('licenses', 'l7', { firearm_id: null })], [], snap)).toEqual([
      'family_refused',
    ]);
  });

  it('a reference column is not a family (F7)', () => {
    const snap = snapshot({ records: [bad('firearms', 'f9', 1)] });
    expect(kinds([live('sessions', 's1', { firearm_id: 'f9' })], [], snap)).toEqual(['applied']);
  });

  it('a valid row of a bad row leaves the bad set, but waits while another bad row is left', () => {
    const records = [
      bad('shots', 't2', 3, ref('series', 'r1')),
      bad('shots', 't1', 2, ref('series', 'r1')),
    ];
    const plan = judgePush([T('t2', 'r1')], new Set(), snapshot({ records, stored: FAMILY }));
    expect(plan.verdicts).toEqual([
      { kind: 'family_refused', parent: ref('series', 'r1'), blocker: ref('shots', 't1') },
    ]);
  });

  it('a re-sent row that is still invalid stays bad and keeps blocking (X9, X10)', () => {
    const records = [bad('sessions', 's1', 3)];
    const plan = judgePush(
      [live('sessions', 's1', { name: null }), R('r1')],
      new Set([0]),
      snapshot({ records }),
    );
    expect(plan.verdicts.map((v) => v.kind)).toEqual(['invalid_payload', 'family_refused']);
    expect(plan.release).toEqual([]);
  });

  it('the latest change of a row in one push decides whether it is bad', () => {
    expect(kinds([S(), S(), R('r1')], [0])).toEqual(['invalid_payload', 'applied', 'applied']);
    expect(kinds([S(), S(), R('r1')], [1])).toEqual([
      'family_refused',
      'invalid_payload',
      'family_refused',
    ]);
  });

  it('two shots of series the server has never seen are not linked (GAP, F4)', () => {
    expect(kinds([T('t1', 'r1'), T('t3', 'r2')], [0])).toEqual(['invalid_payload', 'applied']);
  });
});

describe('judgePush: parent links (§11.4)', () => {
  it('an invalid ownership column falls back to the stored row’s link (OWN)', () => {
    const plan = judgePush(
      [live('shots', 't1', { series_id: null }), T('t3', 'r2')],
      new Set([0]),
      snapshot({ stored: FAMILY }),
    );
    expect(plan.verdicts).toEqual([
      { kind: 'invalid_payload', parent: ref('series', 'r1') },
      { kind: 'family_refused', parent: ref('series', 'r2'), blocker: ref('shots', 't1') },
    ]);
  });

  it('falls back to the record’s link first, then the stored one', () => {
    const snap = snapshot({
      records: [waiting('shots', 't1', 2, ref('series', 'r2'))],
      stored: FAMILY,
    });
    const plan = judgePush([live('shots', 't1', { series_id: 7 })], new Set([0]), snap);
    expect(plan.verdicts[0]).toEqual({ kind: 'invalid_payload', parent: ref('series', 'r2') });
  });

  it('an empty id is not a readable parent', () => {
    const plan = judgePush(
      [live('shots', 't1', { series_id: '' })],
      new Set([0]),
      snapshot({ stored: FAMILY }),
    );
    expect(plan.verdicts[0]).toEqual({ kind: 'invalid_payload', parent: ref('series', 'r1') });
  });

  it('with no link anywhere the parent is null', () => {
    const plan = judgePush([live('shots', 't1', { series_id: null })], new Set([0]), snapshot());
    expect(plan.verdicts[0]).toEqual({ kind: 'invalid_payload', parent: null });
  });

  it('a record’s link is newer than the stored row’s (REV6)', () => {
    // r1 was moved to s2 while it waited: its record links s2.
    const snap = snapshot({
      records: [bad('sessions', 's2', 1), waiting('series', 'r1', 2, ref('sessions', 's2'))],
      stored: FAMILY,
    });
    expect(kinds([T('t7', 'r1')], [], snap)).toEqual(['family_refused']);
  });

  it('the push’s own link wins over the record’s and the stored one (MOVEIN)', () => {
    const snap = snapshot({
      records: [bad('sessions', 's1', 1)],
      stored: [...FAMILY, stored('series', 'r5', ref('sessions', 's2'))],
    });
    expect(kinds([R('r5', 's1')], [], snap)).toEqual(['family_refused']);
    expect(kinds([R('r1', 's2')], [], snap)).toEqual(['applied']);
  });
});

describe('judgePush: tombstones and inert bad rows', () => {
  it('the walk stops at a tombstoned row, which makes a bad row under it inert (TOMBROOT)', () => {
    const snap = snapshot({
      stored: [
        stored('sessions', 's1'),
        stored('series', 'r1', ref('sessions', 's1'), true),
        FAMILY[2]!,
      ],
    });
    const plan = judgePush([T('t8', 'r1'), T('t3', 'r2')], new Set([0]), snap);
    expect(plan.verdicts.map((v) => v.kind)).toEqual(['invalid_payload', 'applied']);
    expect(plan.inert).toEqual([ref('shots', 't8')]);
  });

  it('a tombstone of the root in this push makes a remembered bad row inert (H7, ROOT)', () => {
    const snap = snapshot({
      records: [
        bad('shots', 't2', 1, ref('series', 'r1')),
        waiting('shots', 't3', 2, ref('series', 'r2')),
      ],
      stored: FAMILY,
    });
    const plan = judgePush([dead('sessions', 's1')], new Set(), snap);
    expect(plan.inert).toEqual([ref('shots', 't2')]);
    expect(plan.release).toEqual([ref('shots', 't3')]);
  });

  it('a tombstone of the bad row itself releases its family; the row needs no inert delete', () => {
    const snap = snapshot({
      records: [
        bad('shots', 't2', 1, ref('series', 'r1')),
        waiting('series', 'r2', 2, ref('sessions', 's1')),
      ],
      stored: FAMILY,
    });
    const plan = judgePush([dead('shots', 't2')], new Set(), snap);
    expect(plan.inert).toEqual([]);
    expect(plan.release).toEqual([ref('series', 'r2')]);
  });

  it('a bad record whose row is tombstoned on the server is deleted as inert', () => {
    const snap = snapshot({
      records: [bad('shots', 't1', 1, ref('series', 'r1'))],
      stored: [...FAMILY.slice(0, 3), stored('shots', 't1', ref('series', 'r1'), true)],
    });
    const plan = judgePush([R('r3')], new Set(), snap);
    expect(plan.inert).toEqual([ref('shots', 't1')]);
    expect(plan.verdicts).toEqual([{ kind: 'applied' }]);
  });

  it('a row tombstoned earlier in the push stays deleted after a later live change of it', () => {
    const plan = judgePush(
      [dead('series', 'r1'), R('r1'), T('t1', 'r1')],
      new Set([2]),
      snapshot(),
    );
    expect(plan.verdicts.map((v) => v.kind)).toEqual(['applied', 'tombstoned', 'invalid_payload']);
    expect(plan.inert).toEqual([ref('shots', 't1')]);
  });

  it('an invalid change acked tombstoned is not a bad row (H13)', () => {
    const snap = snapshot({ stored: [stored('sessions', 's1', null, true)] });
    expect(
      kinds([live('sessions', 's1', { name: null }), R('r1'), T('t1', 'r1')], [0], snap),
    ).toEqual(['tombstoned', 'applied', 'applied']);
  });
});

describe('judgePush: release (§11.5)', () => {
  const records = [
    bad('shots', 't2', 3, ref('series', 'r1')),
    waiting('series', 'r9', 5, ref('sessions', 's1')),
    waiting('shots', 't9', 5, ref('series', 'r9')),
    waiting('sessions', 's1', 4),
  ];

  it('releases every waiting row of a family when its bad row arrives fixed, oldest first (H2)', () => {
    const plan = judgePush([T('t2', 'r1')], new Set(), snapshot({ records, stored: FAMILY }));
    expect(plan.verdicts).toEqual([{ kind: 'applied' }]);
    expect(plan.release).toEqual([ref('sessions', 's1'), ref('series', 'r9'), ref('shots', 't9')]);
    expect(plan.blockers).toEqual([]);
  });

  it('orders ties by code unit, as the batch’s ORDER BY does (BINARY collation)', () => {
    const tie = [
      bad('shots', 't2', 3, ref('series', 'r1')),
      waiting('shots', 'a', 5, ref('series', 'r1')),
      waiting('shots', 'B', 5, ref('series', 'r1')),
    ];
    for (const records of [tie, [tie[0]!, tie[2]!, tie[1]!]]) {
      const plan = judgePush([T('t2', 'r1')], new Set(), snapshot({ records, stored: FAMILY }));
      expect(plan.release).toEqual([ref('shots', 'B'), ref('shots', 'a')]);
    }
  });

  it('orders a tie by table before id', () => {
    const tie = [
      bad('shots', 't2', 3, ref('series', 'r1')),
      waiting('shots', 'a', 5, ref('series', 'r1')),
      waiting('series', 'z', 5, ref('sessions', 's1')),
    ];
    for (const records of [tie, [tie[0]!, tie[2]!, tie[1]!]]) {
      const plan = judgePush([T('t2', 'r1')], new Set(), snapshot({ records, stored: FAMILY }));
      expect(plan.release).toEqual([ref('series', 'z'), ref('shots', 'a')]);
    }
  });

  it('a still-blocked waiting row gets its current blocker, and nothing is released', () => {
    const more = [...records, bad('shots', 't1', 1, ref('series', 'r1'))];
    const plan = judgePush([T('t2', 'r1')], new Set(), snapshot({ records: more, stored: FAMILY }));
    expect(plan.verdicts).toEqual([
      { kind: 'family_refused', parent: ref('series', 'r1'), blocker: ref('shots', 't1') },
    ]);
    expect(plan.release).toEqual([]);
    expect(plan.blockers).toEqual([
      { row: ref('series', 'r9'), blocker: ref('shots', 't1') },
      { row: ref('shots', 't9'), blocker: ref('shots', 't1') },
      { row: ref('sessions', 's1'), blocker: ref('shots', 't1') },
    ]);
  });

  it('a row this push applies is not released: the push is the later arrival', () => {
    const plan = judgePush(
      [T('t2', 'r1'), live('sessions', 's1', { name: 'later' })],
      new Set(),
      snapshot({ records, stored: FAMILY }),
    );
    expect(plan.release).toEqual([ref('series', 'r9'), ref('shots', 't9')]);
  });

  it('a row this push tombstones is not released either', () => {
    const plan = judgePush(
      [T('t2', 'r1'), dead('series', 'r9')],
      new Set(),
      snapshot({ records, stored: FAMILY }),
    );
    expect(plan.release).toEqual([ref('sessions', 's1'), ref('shots', 't9')]);
  });

  it('a duplicate replay of a waiting row does not suppress its release (X8)', () => {
    const replay = R('r9');
    const plan = judgePush(
      [replay, T('t2', 'r1')],
      new Set(),
      snapshot({ records, stored: FAMILY, recorded: new Set([replay.clientChangeId]) }),
    );
    expect(plan.verdicts.map((v) => v.kind)).toEqual(['duplicate', 'applied']);
    expect(plan.release).toContainEqual(ref('series', 'r9'));
  });

  it('a firearm family releases by C2 even while a sibling license is bad (FIRE)', () => {
    const fire = [
      bad('firearms', 'f1', 1),
      waiting('licenses', 'l2', 2, ref('firearms', 'f1')),
      bad('licenses', 'l1', 3, ref('firearms', 'f1')),
    ];
    const plan = judgePush([F()], new Set(), snapshot({ records: fire }));
    expect(plan.verdicts).toEqual([{ kind: 'applied' }]);
    expect(plan.release).toEqual([ref('licenses', 'l2')]);
    expect(plan.inert).toEqual([]);
  });

  it('releases a waiting record that a defect left unblocked (I1)', () => {
    const plan = judgePush(
      [live('tags', 'g1')],
      new Set(),
      snapshot({ records: [waiting('series', 'r9', 5, ref('sessions', 's1'))] }),
    );
    expect(plan.release).toEqual([ref('series', 'r9')]);
  });

  it('releases a waiting row whose own row is tombstoned on the server; the batch skips it', () => {
    const snap = snapshot({
      records: [waiting('series', 'r1', 2, ref('sessions', 's1'))],
      stored: [stored('series', 'r1', null, true)],
    });
    const plan = judgePush([live('tags', 'g1')], new Set(), snap);
    expect(plan.release).toEqual([ref('series', 'r1')]);
    // Released, not made inert: only a bad record is inert.
    expect(plan.inert).toEqual([]);
  });

  it('a live change of a waiting row acked tombstoned leaves its record to the release', () => {
    const snap = snapshot({
      records: [waiting('series', 'r1', 2, ref('sessions', 's1'))],
      stored: [stored('series', 'r1', null, true)],
    });
    const plan = judgePush([R('r1')], new Set(), snap);
    expect(plan.verdicts).toEqual([{ kind: 'tombstoned' }]);
    expect(plan.release).toEqual([ref('series', 'r1')]);
  });

  it('a row moved into a blocked family in this push waits there (MOVEIN)', () => {
    const snap = snapshot({
      records: [bad('sessions', 's1', 1)],
      stored: [stored('series', 'r5', ref('sessions', 's2'))],
    });
    const plan = judgePush([R('r5', 's1')], new Set(), snap);
    expect(plan.verdicts).toEqual([
      { kind: 'family_refused', parent: ref('sessions', 's1'), blocker: ref('sessions', 's1') },
    ]);
  });
});

// Round 5 (V5-3): the batch rewrites a waiting record's blocker only when it
// changes, so a push that touches no blocked family rewrites nothing, however
// many rows wait.
describe('judgePush: blockers lists only the waiting records whose blocker changes', () => {
  const t1 = ref('shots', 't1');
  const t2 = ref('shots', 't2');

  it('a record already stored with its current blocker is not listed', () => {
    const records = [
      bad('shots', 't2', 3, ref('series', 'r1')),
      waiting('series', 'r9', 5, ref('sessions', 's1'), t2),
      waiting('sessions', 's1', 4, null, t2),
    ];
    const plan = judgePush([live('tags', 'g1')], new Set(), snapshot({ records, stored: FAMILY }));
    expect(plan.blockers).toEqual([]);
  });

  it('a record whose stored blocker is no longer its blocker is listed with the current one', () => {
    const records = [
      bad('shots', 't2', 3, ref('series', 'r1')),
      waiting('series', 'r9', 5, ref('sessions', 's1'), t2),
      waiting('series', 'r8', 5, ref('sessions', 's1'), t1),
    ];
    const plan = judgePush([live('tags', 'g1')], new Set(), snapshot({ records, stored: FAMILY }));
    expect(plan.blockers).toEqual([{ row: ref('series', 'r8'), blocker: t2 }]);
  });

  it('compares the blocker by table and row, not by row id alone', () => {
    const records = [
      bad('shots', 't2', 3, ref('series', 'r1')),
      waiting('series', 'r9', 5, ref('sessions', 's1'), ref('series', 't2')),
    ];
    const plan = judgePush([live('tags', 'g1')], new Set(), snapshot({ records, stored: FAMILY }));
    expect(plan.blockers).toEqual([{ row: ref('series', 'r9'), blocker: t2 }]);
  });
});

describe('judgePush: re-validation of released payloads (REVAL)', () => {
  const records = [
    bad('shots', 't2', 3, ref('series', 'r1')),
    waiting('series', 'r9', 5, ref('sessions', 's1')),
    waiting('shots', 't9', 6, ref('series', 'r9')),
  ];

  it('a demoted waiting row is a bad row at its own arrival, and its family keeps waiting', () => {
    const plan = judgePush(
      [T('t2', 'r1')],
      new Set(),
      snapshot({ records, stored: FAMILY }),
      new Set(['shots:t9']),
    );
    expect(plan.verdicts).toEqual([
      { kind: 'family_refused', parent: ref('series', 'r1'), blocker: ref('shots', 't9') },
    ]);
    expect(plan.release).toEqual([]);
    expect(plan.demoted).toEqual([ref('shots', 't9')]);
    expect(plan.blockers).toEqual([{ row: ref('series', 'r9'), blocker: ref('shots', 't9') }]);
  });

  it('a demoted row under a tombstoned root is inert', () => {
    const plan = judgePush(
      [dead('sessions', 's1')],
      new Set(),
      snapshot({ records, stored: FAMILY }),
      new Set(['shots:t9']),
    );
    expect(plan.demoted).toEqual([ref('shots', 't9')]);
    expect(plan.inert).toEqual([ref('shots', 't2'), ref('shots', 't9')]);
    expect(plan.release).toEqual([ref('series', 'r9')]);
  });
});
