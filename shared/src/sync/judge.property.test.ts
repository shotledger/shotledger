// docs/specs/sync-family-refusal-spec.md §11.10, properties I1 and I2 over the
// pure judge. A model server applies each plan the way the D1 batch does
// (§11.5's table), and an oracle written separately from judge.ts checks the
// invariants after every push. backend/test/sync-family-refusal.property.spec.ts
// replays seeded sequences of the same cast through the real Worker and D1,
// with its own oracle over the stored state.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { familyKind, ownerOf, type RowRef } from './family';
import { judgePush, type PushSnapshot, type RefusalRecord, type StoredLink } from './judge';
import type { ClientChange, SyncTableName } from './protocol';

/** The fixed cast: every row's table and parent. Rows never move, so I2 needs no exception. */
const CAST: Record<string, { tableName: SyncTableName; parent: string | null }> = {
  s1: { tableName: 'sessions', parent: null },
  s2: { tableName: 'sessions', parent: null },
  r1: { tableName: 'series', parent: 's1' },
  r2: { tableName: 'series', parent: 's1' },
  r3: { tableName: 'series', parent: 's2' },
  t1: { tableName: 'shots', parent: 'r1' },
  t2: { tableName: 'shots', parent: 'r1' },
  t3: { tableName: 'shots', parent: 'r2' },
  t4: { tableName: 'shots', parent: 'r3' },
  f1: { tableName: 'firearms', parent: null },
  l1: { tableName: 'licenses', parent: 'f1' },
  l2: { tableName: 'licenses', parent: 'f1' },
};
const IDS = Object.keys(CAST);
const COLUMN: Partial<Record<SyncTableName, string>> = {
  series: 'session_id',
  shots: 'series_id',
  licenses: 'firearm_id',
};

const keyOf = (id: string) => `${CAST[id]!.tableName}:${id}`;
const idOf = (ref: RowRef) => ref.rowId;

interface ModelRow {
  deleted: boolean;
  arrival: number;
}
interface Model {
  stateRev: number;
  stored: Map<string, ModelRow>;
  records: Map<
    string,
    { reason: RefusalRecord['reason']; arrival: number; blocker: RowRef | null }
  >;
}

type Action = 'live' | 'invalid' | 'dead';
const op = fc.record({
  id: fc.constantFrom(...IDS),
  action: fc.constantFrom<Action>('live', 'live', 'invalid', 'dead'),
});
const pushes = fc.array(fc.array(op, { minLength: 1, maxLength: 5 }), {
  minLength: 1,
  maxLength: 7,
});

let counter = 0;
function change(id: string, action: Action): ClientChange {
  counter += 1;
  const { tableName, parent } = CAST[id]!;
  const column = COLUMN[tableName];
  const payload = action === 'dead' ? null : column === undefined ? {} : { [column]: parent };
  return {
    clientChangeId: `c${counter}`,
    tableName,
    rowId: id,
    payload,
    deletedAt: action === 'dead' ? 'd' : null,
    updatedAt: 'u',
  };
}

/** Known to the server: stored, remembered, or in this push. */
function known(model: Model, id: string, inPush: ReadonlySet<string>): boolean {
  return model.stored.has(keyOf(id)) || model.records.has(keyOf(id)) || inPush.has(id);
}

/** Adds each unknown ancestor as a valid live write ahead of its child, so C4's gap never opens. */
function withAncestors(model: Model, ops: { id: string; action: Action }[]) {
  const out: { id: string; action: Action }[] = [];
  const inPush = new Set<string>();
  const add = (id: string, action: Action) => {
    const parent = CAST[id]!.parent;
    if (action !== 'dead' && parent !== null && !known(model, parent, inPush)) add(parent, 'live');
    out.push({ id, action });
    inPush.add(id);
  };
  for (const o of ops) add(o.id, o.action);
  return out;
}

function snapshotOf(model: Model): PushSnapshot {
  const ref = (id: string): RowRef => ({ tableName: CAST[id]!.tableName, rowId: id });
  const parentOf = (id: string) => (CAST[id]!.parent === null ? null : ref(CAST[id]!.parent));
  return {
    stateRev: model.stateRev,
    recorded: new Set(),
    records: [...model.records].map(([key, r]): RefusalRecord => {
      const id = key.split(':')[1]!;
      return {
        ...ref(id),
        reason: r.reason,
        parent: parentOf(id),
        arrival: r.arrival,
        blocker: r.blocker,
      };
    }),
    stored: [...model.stored].map(([key, s]): StoredLink => {
      const id = key.split(':')[1]!;
      return { ...ref(id), deleted: s.deleted, parent: parentOf(id) };
    }),
  };
}

/** One push, written to the model as §11.5 says the batch writes it. */
function push(model: Model, ops: { id: string; action: Action }[]) {
  const full = withAncestors(model, ops);
  const changes = full.map((o) => change(o.id, o.action));
  const invalid = new Set(full.flatMap((o, i) => (o.action === 'invalid' ? [i] : [])));
  const plan = judgePush(changes, invalid, snapshotOf(model));
  plan.verdicts.forEach((verdict, i) => {
    const key = keyOf(full[i]!.id);
    if (verdict.kind === 'applied') {
      model.stored.set(key, { deleted: changes[i]!.deletedAt !== null, arrival: plan.arrival });
      model.records.delete(key);
    } else if (verdict.kind === 'invalid_payload' || verdict.kind === 'family_refused') {
      model.records.set(key, {
        reason: verdict.kind,
        arrival: plan.arrival,
        blocker: verdict.kind === 'family_refused' ? verdict.blocker : null,
      });
    }
  });
  for (const { row, blocker } of plan.blockers) {
    model.records.get(keyOf(idOf(row)))!.blocker = blocker;
  }
  for (const ref of plan.release) {
    const key = keyOf(idOf(ref));
    const record = model.records.get(key)!;
    if (model.stored.get(key)?.deleted !== true)
      model.stored.set(key, { deleted: false, arrival: record.arrival });
  }
  for (const ref of [...plan.release, ...plan.inert]) model.records.delete(keyOf(idOf(ref)));
  model.stateRev = plan.arrival;
}

// --- The oracle: §11.4 restated over the fixed cast, independent of judge.ts.

function deletedIn(model: Model, id: string) {
  return model.stored.get(keyOf(id))?.deleted === true;
}
function rootOf(model: Model, id: string): string {
  let current = id;
  while (!deletedIn(model, current) && CAST[current]!.parent !== null)
    current = CAST[current]!.parent!;
  return current;
}
/** Non-inert bad rows, as [id, arrival]. */
function badRows(model: Model): [string, number][] {
  return [...model.records].flatMap(([key, r]) => {
    const id = key.split(':')[1]!;
    const inert = deletedIn(model, rootOf(model, id));
    return r.reason === 'invalid_payload' && !inert ? [[id, r.arrival] as [string, number]] : [];
  });
}
/** The bad rows that block `id` under §11.4, as [id, arrival]. */
function blockingRows(model: Model, id: string): [string, number][] {
  const kind = familyKind(CAST[id]!.tableName);
  return badRows(model).filter(([bad]) => {
    if (kind === 'session') {
      return (
        familyKind(CAST[bad]!.tableName) === 'session' && rootOf(model, bad) === rootOf(model, id)
      );
    }
    return kind === 'firearm' && CAST[id]!.tableName !== 'firearms' && bad === CAST[id]!.parent;
  });
}
/** The arrival of the first bad row that blocks `id`, or undefined. */
function firstBlocker(model: Model, id: string): number | undefined {
  const arrivals = blockingRows(model, id).map(([, arrival]) => arrival);
  return arrivals.length === 0 ? undefined : Math.min(...arrivals);
}
/** The first bad row that blocks `id`: oldest, then by table, then by id, in code units. */
function firstBlockerId(model: Model, id: string): string | undefined {
  const order = (a: [string, number], b: [string, number]) => {
    const ka = `${CAST[a[0]]!.tableName}\u0000${a[0]}`;
    const kb = `${CAST[b[0]]!.tableName}\u0000${b[0]}`;
    return a[1] - b[1] || (ka < kb ? -1 : ka > kb ? 1 : 0);
  };
  return [...blockingRows(model, id)].sort(order)[0]?.[0];
}

function run(sequence: { id: string; action: Action }[][], check: (model: Model) => void) {
  const model: Model = { stateRev: 0, stored: new Map(), records: new Map() };
  for (const ops of sequence) {
    push(model, ops);
    check(model);
  }
}

describe('judgePush over generated push sequences', () => {
  it('I1: after every push, every waiting record is blocked by §11.4’s rule', () => {
    fc.assert(
      fc.property(pushes, (sequence) => {
        run(sequence, (model) => {
          for (const [key, record] of model.records) {
            if (record.reason !== 'family_refused') continue;
            expect(firstBlocker(model, key.split(':')[1]!), key).toBeDefined();
          }
        });
      }),
      { numRuns: 300 },
    );
  });

  it('I1 (V5-3): every waiting record’s stored blocker is its first blocking bad row', () => {
    // The batch rewrites only the blockers that change, so a stale one would stay.
    fc.assert(
      fc.property(pushes, (sequence) => {
        run(sequence, (model) => {
          for (const [key, record] of model.records) {
            if (record.reason !== 'family_refused') continue;
            expect(record.blocker?.rowId, key).toBe(firstBlockerId(model, key.split(':')[1]!));
          }
        });
      }),
      { numRuns: 300 },
    );
  });

  it('I2: no live stored member arrived at or after its family’s first non-inert bad row', () => {
    fc.assert(
      fc.property(pushes, (sequence) => {
        run(sequence, (model) => {
          for (const [key, row] of model.stored) {
            if (row.deleted) continue;
            const blocker = firstBlocker(model, key.split(':')[1]!);
            if (blocker !== undefined) expect(row.arrival, key).toBeLessThan(blocker);
          }
        });
      }),
      { numRuns: 300 },
    );
  });

  it('a waiting row is stored with its first arrival once its family is free', () => {
    fc.assert(
      fc.property(pushes, (sequence) => {
        const model: Model = { stateRev: 0, stored: new Map(), records: new Map() };
        for (const ops of sequence) push(model, ops);
        const waiting = [...model.records].filter(([, r]) => r.reason === 'family_refused');
        // Fix every bad row: each waiting row lands at its own arrival.
        const fixes = [...model.records]
          .filter(([, r]) => r.reason === 'invalid_payload')
          .map(([key]): { id: string; action: Action } => ({
            id: key.split(':')[1]!,
            action: 'live',
          }));
        if (fixes.length > 0) push(model, fixes);
        for (const [key, record] of waiting) {
          if (model.records.has(key) || model.stored.get(key)?.deleted) continue;
          expect(model.stored.get(key)?.arrival, key).toBe(record.arrival);
        }
        expect([...model.records.values()].filter((r) => r.reason === 'family_refused')).toEqual(
          [],
        );
      }),
      { numRuns: 300 },
    );
  });

  it('the oracle agrees with the cast’s payload links', () => {
    for (const id of IDS) {
      const { tableName, parent } = CAST[id]!;
      const payload = change(id, 'live').payload;
      expect(ownerOf(tableName, payload)?.rowId ?? null).toBe(parent);
    }
  });
});
