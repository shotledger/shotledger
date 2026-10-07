import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  ClientChangeSchema,
  PUSH_BATCH_MAX,
  PushRequestSchema,
  type ClientChange,
} from '../sync/protocol';
import { TEXT_LIMITS } from '../sync/text-limits';
import { buildBulkEdit, type BulkAction, type BulkContext, type BulkResult } from './bulk-edit';
import { applyRank } from './order';
import type { Payload } from './rows';

const NOW = '2026-10-07T10:00:00.000Z';
const OLD = '2026-01-01T00:00:00.000Z';

function makeDeps() {
  let ids = 0;
  let changeIds = 0;
  const hex = (n: number) => n.toString(16).padStart(12, '0');
  return {
    newId: () => `0199b000-0000-7000-8000-${hex((ids += 1))}`,
    newChangeId: () => `00000000-0000-4000-8000-${hex((changeIds += 1))}`,
    now: () => NOW,
  };
}

const session = (id: string, fields: Payload = {}): Payload => ({
  id,
  created_at: OLD,
  updated_at: OLD,
  deleted_at: null,
  name: `Session ${id}`,
  type: 'training',
  kind: 'series',
  discipline_id: 'spsf-precision',
  firearm_id: null,
  location: null,
  extra_rounds: null,
  // A column this build does not know must survive a rewrite.
  future_column: 'kept',
  ...fields,
});

const tag = (id: string, name: string, deletedAt: string | null = null): Payload => ({
  id,
  created_at: OLD,
  updated_at: OLD,
  deleted_at: deletedAt,
  name,
});

const link = (id: string, sessionId: string, tagId: string, deletedAt: string | null = null) => ({
  id,
  created_at: OLD,
  updated_at: OLD,
  deleted_at: deletedAt,
  session_id: sessionId,
  tag_id: tagId,
});

const firearm = (
  id: string,
  roundCount: number,
  sinceMaintenance: number,
  fields: Payload = {},
) => ({
  id,
  created_at: OLD,
  updated_at: OLD,
  deleted_at: null,
  make: 'Make',
  model: id,
  is_own: true,
  round_count: roundCount,
  rounds_since_maintenance: sinceMaintenance,
  ...fields,
});

const seriesRow = (id: string, sessionId: string, fields: Payload = {}): Payload => ({
  id,
  deleted_at: null,
  session_id: sessionId,
  is_sighter: 0,
  is_total_override: 0,
  total_override_shot_count: null,
  ...fields,
});

const shot = (id: string, seriesId: string, deletedAt: string | null = null): Payload => ({
  id,
  deleted_at: deletedAt,
  series_id: seriesId,
});

const station = (id: string, sessionId: string, deletedAt: string | null = null): Payload => ({
  id,
  deleted_at: deletedAt,
  session_id: sessionId,
});

const byId = (...rows: Payload[]) => new Map(rows.map((row) => [row.id as string, row]));

/**
 * s1: f1, 21 rounds (2 shots, a 1-shot sighter, total-only 10, total-only
 *     with no count = Precision's 5, extra 3; a deleted shot and a deleted
 *     series do not count), tagged KM through the second KM copy.
 * s2: f1, 12 rounds (two live fält stations), linked to the deleted tag Gone.
 * s3: f2, 4 rounds, tagged Club.
 * s4: no firearm, 0 rounds, a dead link to KM.
 * s5: the deleted firearm fx, 2 rounds.
 * sDel: deleted on the phone (deleted_at in its payload).
 */
function logbook(): BulkContext {
  return {
    sessions: byId(
      session('s1', { firearm_id: 'f1', location: 'Range A', extra_rounds: 3 }),
      session('s2', { firearm_id: 'f1', location: 'Range A' }),
      session('s3', { firearm_id: 'f2', location: 'Range B' }),
      session('s4'),
      session('s5', { firearm_id: 'fx' }),
      session('sDel', { deleted_at: OLD, firearm_id: 'f1' }),
    ),
    tags: byId(tag('t1', 'KM'), tag('t1b', 'KM'), tag('t2', 'Club'), tag('tGone', 'Gone', OLD)),
    sessionTags: byId(
      link('l1', 's1', 't1b'),
      link('l2', 's3', 't2'),
      link('l3', 's2', 'tGone'),
      link('l4', 's4', 't1', OLD),
    ),
    firearms: byId(
      firearm('f1', 100, 15),
      firearm('f2', 5, 2),
      firearm('f3', 50, 0),
      firearm('fx', 9, 9, { deleted_at: OLD }),
    ),
    series: byId(
      seriesRow('r1', 's1'),
      seriesRow('r1s', 's1', { is_sighter: 1 }),
      seriesRow('r1t', 's1', { is_total_override: 1, total_override_shot_count: 10 }),
      seriesRow('r1n', 's1', { is_total_override: 1 }),
      seriesRow('r1x', 's1', { deleted_at: OLD }),
      seriesRow('r3', 's3'),
      seriesRow('r5', 's5'),
    ),
    shots: byId(
      shot('h1', 'r1'),
      shot('h2', 'r1'),
      shot('h3', 'r1', OLD),
      shot('h4', 'r1s'),
      shot('h5', 'r1x'),
      shot('h6', 'r3'),
      shot('h7', 'r3'),
      shot('h8', 'r3'),
      shot('h9', 'r3'),
      shot('h10', 'r5'),
      shot('h11', 'r5'),
    ),
    faltStations: byId(station('st1', 's2'), station('st2', 's2'), station('st3', 's2', OLD)),
  };
}

const build = (action: BulkAction, ids: readonly string[], context = logbook()) =>
  buildBulkEdit(action, ids, context, makeDeps());

function okOf(result: BulkResult) {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result;
}

const payloadOf = (changes: ClientChange[], tableName: string, rowId: string) =>
  changes.find((c) => c.tableName === tableName && c.rowId === rowId)?.payload as
    Payload | undefined;

const tables = (changes: ClientChange[]) => changes.map((c) => `${c.tableName}:${c.rowId}`);

describe('buildBulkEdit — tags', () => {
  it('K1 add an existing tag: one session_tags row per untagged session, on the canonical tag id', () => {
    const { changes, summary } = okOf(build({ kind: 'addTag', name: 'KM' }, ['s1', 's2', 's3']));
    expect(summary).toEqual({ changed: 2, unchanged: 1, missing: 0 });
    expect(changes.map((c) => c.tableName)).toEqual(['session_tags', 'session_tags']);
    expect(changes.map((c) => c.payload)).toEqual([
      {
        id: '0199b000-0000-7000-8000-000000000001',
        created_at: NOW,
        updated_at: NOW,
        deleted_at: null,
        session_id: 's2',
        tag_id: 't1',
      },
      {
        id: '0199b000-0000-7000-8000-000000000002',
        created_at: NOW,
        updated_at: NOW,
        deleted_at: null,
        session_id: 's3',
        tag_id: 't1',
      },
    ]);
    // The canonical copy is the smallest id, whatever order the pull gave.
    const reversed = okOf(
      build({ kind: 'addTag', name: 'KM' }, ['s2'], {
        ...logbook(),
        tags: byId(tag('t1b', 'KM'), tag('t1', 'KM')),
      }),
    );
    expect((reversed.changes[0]!.payload as Payload).tag_id).toBe('t1');
  });

  it('K2 add a new tag name: one tags row first, then the links to it', () => {
    const { changes, summary } = okOf(build({ kind: 'addTag', name: 'Season 2026' }, ['s3', 's1']));
    expect(summary).toEqual({ changed: 2, unchanged: 0, missing: 0 });
    const tagId = '0199b000-0000-7000-8000-000000000001';
    expect(changes.map((c) => c.tableName)).toEqual(['tags', 'session_tags', 'session_tags']);
    expect(changes[0]!.payload).toEqual({
      id: tagId,
      created_at: NOW,
      updated_at: NOW,
      deleted_at: null,
      name: 'Season 2026',
    });
    expect(changes.slice(1).map((c) => (c.payload as Payload).tag_id)).toEqual([tagId, tagId]);
    expect(changes.slice(1).map((c) => (c.payload as Payload).session_id)).toEqual(['s3', 's1']);
  });

  it('K3 a live link to a live tag of the name is unchanged; a link to a deleted tag does not count', () => {
    // s1 carries KM through the copy t1b; s4's link to t1 is dead.
    const km = okOf(build({ kind: 'addTag', name: 'KM' }, ['s1', 's4']));
    expect(km.summary).toEqual({ changed: 1, unchanged: 1, missing: 0 });
    expect(km.changes.map((c) => (c.payload as Payload).session_id)).toEqual(['s4']);
    // s2's link to Gone points at a deleted tag: Gone is created anew and linked.
    const gone = okOf(build({ kind: 'addTag', name: 'Gone' }, ['s2']));
    expect(gone.changes.map((c) => c.tableName)).toEqual(['tags', 'session_tags']);
    expect((gone.changes[0]!.payload as Payload).id).not.toBe('tGone');
  });

  it('K4 the tag name is trimmed; blank → blankTag; over 120 → tooLong(tag)', () => {
    const trimmed = okOf(build({ kind: 'addTag', name: '  KM \t' }, ['s2']));
    expect((trimmed.changes[0]!.payload as Payload).tag_id).toBe('t1');
    expect(build({ kind: 'addTag', name: '  ' }, ['s2'])).toEqual({
      ok: false,
      errors: [{ kind: 'blankTag' }],
    });
    expect(build({ kind: 'removeTag', name: '' }, ['s2'])).toEqual({
      ok: false,
      errors: [{ kind: 'blankTag' }],
    });
    const max = TEXT_LIMITS.tags.name;
    expect(build({ kind: 'addTag', name: 'é'.repeat(max + 1) }, ['s2'])).toEqual({
      ok: false,
      errors: [{ kind: 'tooLong', field: 'tag', max }],
    });
    const atMax = okOf(build({ kind: 'addTag', name: 'é'.repeat(max) }, ['s2']));
    expect((atMax.changes[0]!.payload as Payload).name).toBe('é'.repeat(max));
  });

  it('K5 remove a tag: a tombstone per live link to any tag of the name, live or deleted', () => {
    const context = logbook();
    const links = new Map(context.sessionTags);
    links.set('l5', link('l5', 's1', 't1'));
    links.set('l6', link('l6', 's2', 't1'));
    links.set('l7', link('l7', 's1', 'tKmGone'));
    const tags = new Map(context.tags);
    tags.set('tKmGone', tag('tKmGone', 'KM', OLD));
    const { changes, summary } = okOf(
      build({ kind: 'removeTag', name: ' KM ' }, ['s1', 's3', 's4'], {
        ...context,
        sessionTags: links,
        tags,
      }),
    );
    // s2 is not selected; s3 has no KM; s4's only KM link is already dead.
    expect(summary).toEqual({ changed: 1, unchanged: 2, missing: 0 });
    expect(changes).toEqual(
      ['l1', 'l5', 'l7'].map((rowId, index) => ({
        clientChangeId: `00000000-0000-4000-8000-00000000000${index + 1}`,
        tableName: 'session_tags',
        rowId,
        payload: null,
        deletedAt: NOW,
        updatedAt: NOW,
      })),
    );
  });

  it('K6 remove a tag no selected session has → nothingToChange', () => {
    expect(build({ kind: 'removeTag', name: 'Club' }, ['s1', 's2'])).toEqual({
      ok: false,
      errors: [{ kind: 'nothingToChange' }],
    });
    expect(build({ kind: 'removeTag', name: 'Nowhere' }, ['s1'])).toEqual({
      ok: false,
      errors: [{ kind: 'nothingToChange' }],
    });
  });
});

describe('buildBulkEdit — firearm', () => {
  it('K7 each moved session is its pulled payload with firearm_id changed and updated_at now', () => {
    const context = logbook();
    const { changes, summary } = okOf(build({ kind: 'setFirearm', firearmId: 'f2' }, ['s1', 's3']));
    expect(summary).toEqual({ changed: 1, unchanged: 1, missing: 0 });
    expect(payloadOf(changes, 'sessions', 's1')).toEqual({
      ...context.sessions.get('s1'),
      firearm_id: 'f2',
      updated_at: NOW,
    });
    expect(payloadOf(changes, 'sessions', 's1')!.future_column).toBe('kept');
    expect(payloadOf(changes, 'sessions', 's3')).toBeUndefined();
  });

  it('K8 the counters move: source −volume, target +volume, summed per firearm, floored at 0', () => {
    const { changes } = okOf(
      build({ kind: 'setFirearm', firearmId: 'f3' }, ['s1', 's2', 's3', 's4']),
    );
    expect(changes.map((c) => c.tableName)).toEqual([
      'firearms',
      'firearms',
      'firearms',
      'sessions',
      'sessions',
      'sessions',
      'sessions',
    ]);
    // f1 loses s1 (21) + s2 (12); f2 loses s3 (4); f3 gains 37.
    expect(payloadOf(changes, 'firearms', 'f1')).toEqual({
      ...firearm('f1', 67, 0),
      updated_at: NOW,
    });
    expect(payloadOf(changes, 'firearms', 'f2')).toEqual({
      ...firearm('f2', 1, 0),
      updated_at: NOW,
    });
    expect(payloadOf(changes, 'firearms', 'f3')).toEqual({
      ...firearm('f3', 87, 37),
      updated_at: NOW,
    });
    const f1 = firearm('f1', 10, 40);
    const low = okOf(
      build({ kind: 'setFirearm', firearmId: 'f3' }, ['s1', 's2'], {
        ...logbook(),
        firearms: byId(f1, firearm('f3', 0, 0)),
      }),
    );
    expect(payloadOf(low.changes, 'firearms', 'f1')).toMatchObject({
      round_count: 0,
      rounds_since_maintenance: 7,
    });
  });

  it('K9 volume: live series (sighters), total-only, extra rounds, fält stations; deleted rows do not count', () => {
    const one = (id: string) =>
      payloadOf(
        okOf(build({ kind: 'setFirearm', firearmId: 'f3' }, [id])).changes,
        'firearms',
        'f3',
      )?.round_count;
    expect(one('s1')).toBe(50 + 21);
    expect(one('s2')).toBe(50 + 12);
    expect(one('s3')).toBe(50 + 4);
    // A counter that is not a number counts as 0, as the phone's column default.
    const blank = okOf(
      build({ kind: 'setFirearm', firearmId: 'f3' }, ['s3'], {
        ...logbook(),
        firearms: byId(
          firearm('f2', 5, 2),
          firearm('f3', 0, 0, { round_count: null, rounds_since_maintenance: undefined }),
        ),
      }),
    );
    expect(payloadOf(blank.changes, 'firearms', 'f3')).toMatchObject({
      round_count: 4,
      rounds_since_maintenance: 4,
    });
  });

  it('K10 a source that is not live is not pushed; None moves rounds off; zero volume pushes no firearm', () => {
    const fromDeleted = okOf(build({ kind: 'setFirearm', firearmId: 'f3' }, ['s5']));
    expect(tables(fromDeleted.changes)).toEqual(['firearms:f3', 'sessions:s5']);
    expect(payloadOf(fromDeleted.changes, 'firearms', 'f3')!.round_count).toBe(52);

    const toNone = okOf(build({ kind: 'setFirearm', firearmId: null }, ['s3', 's4']));
    expect(tables(toNone.changes)).toEqual(['firearms:f2', 'sessions:s3']);
    expect(payloadOf(toNone.changes, 'sessions', 's3')!.firearm_id).toBeNull();
    expect(payloadOf(toNone.changes, 'firearms', 'f2')!.round_count).toBe(1);
    expect(toNone.summary).toEqual({ changed: 1, unchanged: 1, missing: 0 });

    const zero = okOf(build({ kind: 'setFirearm', firearmId: 'f3' }, ['s4']));
    expect(tables(zero.changes)).toEqual(['sessions:s4']);
  });

  it('K11 an unknown or deleted target firearm → unknownFirearm', () => {
    for (const firearmId of ['f9', 'fx']) {
      expect(build({ kind: 'setFirearm', firearmId }, ['s1'])).toEqual({
        ok: false,
        errors: [{ kind: 'unknownFirearm' }],
      });
    }
  });
});

describe('buildBulkEdit — location', () => {
  it('K12 trimmed, blank → null, over 200 → tooLong(location), the same location unchanged', () => {
    const moved = okOf(build({ kind: 'setLocation', location: '  Range B ' }, ['s1', 's2', 's3']));
    expect(moved.summary).toEqual({ changed: 2, unchanged: 1, missing: 0 });
    expect(tables(moved.changes)).toEqual(['sessions:s1', 'sessions:s2']);
    expect(payloadOf(moved.changes, 'sessions', 's2')).toEqual({
      ...logbook().sessions.get('s2'),
      location: 'Range B',
      updated_at: NOW,
    });

    const cleared = okOf(build({ kind: 'setLocation', location: ' ' }, ['s1', 's4']));
    expect(tables(cleared.changes)).toEqual(['sessions:s1']);
    expect(payloadOf(cleared.changes, 'sessions', 's1')!.location).toBeNull();
    // A payload without the column reads as no location.
    const bare = new Map([['s9', { id: 's9', deleted_at: null }]]);
    expect(
      build({ kind: 'setLocation', location: '' }, ['s9'], { ...logbook(), sessions: bare }),
    ).toEqual({ ok: false, errors: [{ kind: 'nothingToChange' }] });

    const max = TEXT_LIMITS.sessions.location;
    expect(build({ kind: 'setLocation', location: 'x'.repeat(max + 1) }, ['s1'])).toEqual({
      ok: false,
      errors: [{ kind: 'tooLong', field: 'location', max }],
    });
    expect(
      okOf(build({ kind: 'setLocation', location: ` ${'x'.repeat(max)} ` }, ['s1'])).changes,
    ).toHaveLength(1);
  });
});

describe('buildBulkEdit — selection and limits', () => {
  it('K13 selected sessions that are not live are counted missing and not written', () => {
    const { changes, summary } = okOf(
      build({ kind: 'setLocation', location: 'Elsewhere' }, ['s1', 'nope', 'sDel']),
    );
    expect(summary).toEqual({ changed: 1, unchanged: 0, missing: 2 });
    expect(tables(changes)).toEqual(['sessions:s1']);
    // A session absent from the pull and one deleted in its payload alike.
    const undefinedDeleted = new Map([['s9', { id: 's9', location: 'A' }]]);
    expect(
      okOf(
        build({ kind: 'setLocation', location: 'B' }, ['s9'], {
          ...logbook(),
          sessions: undefinedDeleted,
        }),
      ).summary,
    ).toEqual({ changed: 1, unchanged: 0, missing: 0 });
  });

  it('K14 empty selection → noSessions; duplicates count once; nothing changing → nothingToChange', () => {
    expect(build({ kind: 'addTag', name: 'KM' }, [])).toEqual({
      ok: false,
      errors: [{ kind: 'noSessions' }],
    });
    const twice = okOf(build({ kind: 'addTag', name: 'KM' }, ['s2', 's2']));
    expect(twice.summary).toEqual({ changed: 1, unchanged: 0, missing: 0 });
    expect(twice.changes).toHaveLength(1);
    expect(build({ kind: 'setLocation', location: 'Range A' }, ['s1', 's2'])).toEqual({
      ok: false,
      errors: [{ kind: 'nothingToChange' }],
    });
    expect(build({ kind: 'setLocation', location: 'X' }, ['nope', 'sDel'])).toEqual({
      ok: false,
      errors: [{ kind: 'nothingToChange' }],
    });
    // An empty selection is reported before anything else.
    expect(build({ kind: 'addTag', name: '' }, [])).toEqual({
      ok: false,
      errors: [{ kind: 'noSessions' }],
    });
  });

  it('K15 over PUSH_BATCH_MAX changes → tooManyChanges(max, needed); exactly 500 is allowed', () => {
    const many = (n: number) => {
      const sessions = new Map<string, Payload>();
      for (let i = 0; i < n; i += 1) sessions.set(`m${i}`, session(`m${i}`));
      return { ...logbook(), sessions };
    };
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `m${i}`);
    // Existing tag: one link per session.
    expect(okOf(build({ kind: 'addTag', name: 'KM' }, ids(500), many(500))).changes).toHaveLength(
      PUSH_BATCH_MAX,
    );
    expect(build({ kind: 'addTag', name: 'KM' }, ids(501), many(501))).toEqual({
      ok: false,
      errors: [{ kind: 'tooManyChanges', max: PUSH_BATCH_MAX, needed: 501 }],
    });
    // A new tag takes one change of its own.
    expect(okOf(build({ kind: 'addTag', name: 'New' }, ids(499), many(499))).changes).toHaveLength(
      PUSH_BATCH_MAX,
    );
    expect(build({ kind: 'addTag', name: 'New' }, ids(500), many(500))).toEqual({
      ok: false,
      errors: [{ kind: 'tooManyChanges', max: PUSH_BATCH_MAX, needed: 501 }],
    });
  });

  it('K16 every change parses, ids are fresh, rowId = id, updatedAt = now, in APPLY_ORDER', () => {
    const results = [
      build({ kind: 'addTag', name: 'New' }, ['s1', 's2', 's3', 's4']),
      build({ kind: 'removeTag', name: 'KM' }, ['s1']),
      build({ kind: 'setFirearm', firearmId: 'f3' }, ['s1', 's2', 's3', 's5']),
      build({ kind: 'setLocation', location: 'Z' }, ['s1', 's2', 's3', 's4']),
    ];
    for (const result of results) {
      const { changes } = okOf(result);
      expect(PushRequestSchema.safeParse({ protocolVersion: 1, changes }).success).toBe(true);
      for (const change of changes) {
        expect(ClientChangeSchema.safeParse(change).success).toBe(true);
        expect(change.updatedAt).toBe(NOW);
        if (change.payload !== null) {
          expect(change.rowId).toBe((change.payload as Payload).id);
          expect((change.payload as Payload).updated_at).toBe(NOW);
          expect(change.deletedAt).toBeNull();
        } else {
          expect(change.deletedAt).toBe(NOW);
        }
      }
      expect(new Set(changes.map((c) => c.clientChangeId)).size).toBe(changes.length);
      expect(new Set(changes.map((c) => `${c.tableName}:${c.rowId}`)).size).toBe(changes.length);
      const ranks = changes.map((c) => applyRank(c.tableName));
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
  });
});

// --- K17: the edit, applied, puts every selected live session in the asked
// state and touches nothing else. The oracle below is written independently
// of the builder: it walks the moved sessions one at a time, as the phone's
// updateSession does, flooring after each step.

const NAMES = ['KM', 'Club', ' KM', 'Gone'];
const PLACES = ['Range A', 'Range B', '', '  Range A  '];

interface World {
  context: BulkContext;
  selection: string[];
  action: BulkAction;
}

const worldArb: fc.Arbitrary<World> = fc
  .record({
    sessions: fc.array(
      fc.record({
        firearm: fc.constantFrom(null, 'f1', 'f2', 'f3', 'fx'),
        place: fc.constantFrom(null, 'Range A', 'Range B'),
        deleted: fc.boolean(),
        shots: fc.nat({ max: 12 }),
        extra: fc.option(fc.nat({ max: 20 }), { nil: null }),
        stations: fc.nat({ max: 3 }),
        links: fc.subarray(['t1', 't1b', 't2', 'tGone']),
      }),
      { minLength: 1, maxLength: 12 },
    ),
    counters: fc.tuple(fc.nat({ max: 60 }), fc.nat({ max: 60 }), fc.nat({ max: 60 })),
    pick: fc.array(fc.nat({ max: 14 }), { maxLength: 14 }),
    action: fc.oneof(
      fc.constantFrom(...NAMES).map((name): BulkAction => ({ kind: 'addTag', name })),
      fc
        .constantFrom('KM', 'Club', 'Gone')
        .map((name): BulkAction => ({ kind: 'removeTag', name })),
      fc
        .constantFrom(null, 'f1', 'f2', 'f3')
        .map((firearmId): BulkAction => ({ kind: 'setFirearm', firearmId })),
      fc.constantFrom(...PLACES).map((location): BulkAction => ({ kind: 'setLocation', location })),
    ),
  })
  .map(({ sessions, counters, pick, action }) => {
    const context: BulkContext = {
      sessions: new Map(),
      tags: byId(tag('t1', 'KM'), tag('t1b', 'KM'), tag('t2', 'Club'), tag('tGone', 'Gone', OLD)),
      sessionTags: new Map(),
      firearms: byId(
        firearm('f1', counters[0], counters[1]),
        firearm('f2', counters[1], counters[2]),
        firearm('f3', counters[2], counters[0]),
        firearm('fx', 5, 5, { deleted_at: OLD }),
      ),
      series: new Map(),
      shots: new Map(),
      faltStations: new Map(),
    };
    const maps = context as { [K in keyof BulkContext]: Map<string, Payload> };
    sessions.forEach((s, i) => {
      const id = `s${i}`;
      maps.sessions.set(
        id,
        session(id, {
          firearm_id: s.firearm,
          location: s.place,
          extra_rounds: s.extra,
          deleted_at: s.deleted ? OLD : null,
        }),
      );
      maps.series.set(`r${i}`, seriesRow(`r${i}`, id));
      for (let k = 0; k < s.shots; k += 1)
        maps.shots.set(`h${i}-${k}`, shot(`h${i}-${k}`, `r${i}`));
      for (let k = 0; k < s.stations; k += 1) {
        maps.faltStations.set(`st${i}-${k}`, station(`st${i}-${k}`, id));
      }
      for (const tagId of s.links) {
        maps.sessionTags.set(`l${i}-${tagId}`, link(`l${i}-${tagId}`, id, tagId));
      }
    });
    // Picks past the last session are ids the pull no longer has.
    const selection = pick.map((n) => `s${n}`);
    return { context, selection, action };
  });

const isLive = (row: Payload | undefined): row is Payload =>
  row !== undefined && (row.deleted_at === null || row.deleted_at === undefined);

/** The changes applied as a pull would leave them: tombstoned rows gone. */
function applied(context: BulkContext, changes: ClientChange[]): BulkContext {
  const tableKey = {
    sessions: 'sessions',
    tags: 'tags',
    session_tags: 'sessionTags',
    firearms: 'firearms',
  } as const;
  const next = Object.fromEntries(
    Object.entries(context).map(([key, rows]) => [key, new Map(rows as Map<string, Payload>)]),
  ) as { [K in keyof BulkContext]: Map<string, Payload> };
  for (const change of changes) {
    const rows = next[tableKey[change.tableName as keyof typeof tableKey]];
    if (change.deletedAt !== null) rows.delete(change.rowId);
    else rows.set(change.rowId, change.payload as Payload);
  }
  return next;
}

function tagNamesOf(context: BulkContext, sessionId: string): Set<string> {
  const names = new Set<string>();
  for (const l of context.sessionTags.values()) {
    if (!isLive(l) || l.session_id !== sessionId) continue;
    const t = context.tags.get(l.tag_id as string);
    if (isLive(t)) names.add(t.name as string);
  }
  return names;
}

function roundsOf(context: BulkContext, sessionId: string): number {
  let rounds = 0;
  for (const s of context.series.values()) {
    if (s.session_id !== sessionId) continue;
    for (const h of context.shots.values()) if (h.series_id === s.id) rounds += 1;
  }
  for (const st of context.faltStations.values()) if (st.session_id === sessionId) rounds += 6;
  return rounds + ((context.sessions.get(sessionId)!.extra_rounds as number | null) ?? 0);
}

describe('buildBulkEdit — property', () => {
  it('K17 the edit applied puts every selected live session in the asked state and touches nothing else', () => {
    fc.assert(
      fc.property(worldArb, ({ context, selection, action }) => {
        const result = buildBulkEdit(action, selection, context, makeDeps());
        const live = [...new Set(selection)].filter((id) => isLive(context.sessions.get(id)));
        if (selection.length === 0) {
          expect(result).toEqual({ ok: false, errors: [{ kind: 'noSessions' }] });
          return;
        }
        const after = result.ok ? applied(context, result.changes) : context;
        if (!result.ok) expect(result.errors).toEqual([{ kind: 'nothingToChange' }]);

        // Every selected live session is now as asked.
        for (const id of live) {
          const row = after.sessions.get(id)!;
          if (action.kind === 'addTag') {
            expect(tagNamesOf(after, id).has(action.name.trim())).toBe(true);
          } else if (action.kind === 'removeTag') {
            expect(tagNamesOf(after, id).has(action.name)).toBe(false);
          } else if (action.kind === 'setFirearm') {
            expect(row.firearm_id).toBe(action.firearmId);
          } else {
            expect(row.location).toBe(action.location.trim() || null);
          }
        }
        // Nothing else moved: other sessions, and other sessions' tags.
        for (const [id, row] of context.sessions) {
          if (!live.includes(id)) {
            expect(after.sessions.get(id)).toBe(row);
            expect(tagNamesOf(after, id)).toEqual(tagNamesOf(context, id));
          }
        }
        // The counters equal the phone's one-session-at-a-time walk.
        const expected = new Map(
          [...context.firearms].map(([id, f]) => [
            id,
            [f.round_count as number, f.rounds_since_maintenance as number],
          ]),
        );
        if (action.kind === 'setFirearm') {
          for (const id of live) {
            const before = context.sessions.get(id)!.firearm_id as string | null;
            if (before === action.firearmId) continue;
            const rounds = roundsOf(context, id);
            const step = (firearmId: string | null, delta: number) => {
              if (firearmId === null || !isLive(context.firearms.get(firearmId))) return;
              const [total, since] = expected.get(firearmId)!;
              expected.set(firearmId, [Math.max(0, total + delta), Math.max(0, since + delta)]);
            };
            step(before, -rounds);
            step(action.firearmId, rounds);
          }
        }
        for (const [id, [total, since]] of expected) {
          expect(after.firearms.get(id)).toMatchObject({
            round_count: total,
            rounds_since_maintenance: since,
          });
        }
      }),
      { numRuns: 500 },
    );
  });
});
