// docs/specs/sync-family-refusal-spec.md §7, property-based: over random
// session and firearm trees with random invalid sets, the refused set is
// exactly the expected family and never another family's row.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { familyRefusals } from './family';
import type { ClientChange, SyncTableName } from './protocol';

interface Node {
  change: ClientChange;
  /** The session or firearm the row belongs to. */
  root: string;
  kind: 'session' | 'firearm';
}

const SESSION_CHILDREN: SyncTableName[] = ['series', 'falt_stations', 'session_tags'];
const FIREARM_CHILDREN: SyncTableName[] = [
  'licenses',
  'firearm_groups',
  'firearm_calibers',
  'maintenance_events',
  'sight_settings',
];

function change(tableName: SyncTableName, rowId: string, payload: unknown): ClientChange {
  return {
    clientChangeId: `${tableName}:${rowId}`,
    tableName,
    rowId,
    payload,
    deletedAt: null,
    updatedAt: 'u',
  };
}

/** A complete, all-live push: every parent row is in it. */
const forest = fc
  .record({
    sessions: fc.array(
      fc.array(
        fc.record({
          table: fc.constantFrom(...SESSION_CHILDREN),
          shots: fc.nat({ max: 3 }),
        }),
        { maxLength: 3 },
      ),
      { maxLength: 3 },
    ),
    firearms: fc.array(fc.array(fc.constantFrom(...FIREARM_CHILDREN), { maxLength: 3 }), {
      maxLength: 3,
    }),
  })
  .map(({ sessions, firearms }) => {
    const nodes: Node[] = [];
    sessions.forEach((children, s) => {
      const root = `s${s}`;
      nodes.push({ change: change('sessions', root, {}), root, kind: 'session' });
      children.forEach((child, c) => {
        const id = `${root}-c${c}`;
        nodes.push({
          change: change(child.table, id, { session_id: root, firearm_id: 'f0', tag_id: 'g0' }),
          root,
          kind: 'session',
        });
        if (child.table !== 'series') return;
        for (let t = 0; t < child.shots; t += 1) {
          nodes.push({
            change: change('shots', `${id}-t${t}`, { series_id: id }),
            root,
            kind: 'session',
          });
        }
      });
    });
    firearms.forEach((children, f) => {
      const root = `f${f}`;
      nodes.push({ change: change('firearms', root, {}), root, kind: 'firearm' });
      children.forEach((table, c) => {
        nodes.push({
          change: change(table, `${root}-c${c}`, { firearm_id: root }),
          root,
          kind: 'firearm',
        });
      });
    });
    return nodes;
  });

const withInvalid = forest.chain((nodes) =>
  fc.record({
    nodes: fc.shuffledSubarray(nodes, { minLength: nodes.length }),
    invalid: fc.uniqueArray(fc.nat({ max: Math.max(nodes.length - 1, 0) }), {
      maxLength: nodes.length === 0 ? 0 : 3,
    }),
  }),
);

/** The oracle: §2.1 stated directly over the known tree. */
function expected(nodes: readonly Node[], invalid: ReadonlySet<number>): number[] {
  const blocked = new Set<string>();
  const blockedFirearms = new Set<string>();
  for (const index of invalid) {
    const node = nodes[index]!;
    if (node.kind === 'session') blocked.add(node.root);
    else if (node.change.tableName === 'firearms') blockedFirearms.add(node.root);
  }
  return nodes.flatMap((node, index) => {
    if (invalid.has(index)) return [];
    const isBlocked =
      node.kind === 'session'
        ? blocked.has(node.root)
        : node.change.tableName !== 'firearms' && blockedFirearms.has(node.root);
    return isBlocked ? [index] : [];
  });
}

describe('familyRefusals over generated trees', () => {
  it('refuses exactly the expected family', () => {
    fc.assert(
      fc.property(withInvalid, ({ nodes, invalid }) => {
        const invalidSet = new Set(invalid);
        const result = familyRefusals(
          nodes.map((node) => node.change),
          invalidSet,
        );
        expect([...result].sort((a, b) => a - b)).toEqual(expected(nodes, invalidSet));
      }),
    );
  });

  it('a push with no invalid row is unaffected', () => {
    fc.assert(
      fc.property(forest, (nodes) => {
        expect(
          familyRefusals(
            nodes.map((node) => node.change),
            new Set(),
          ).size,
        ).toBe(0);
      }),
    );
  });

  it('tombstones are never refused, whichever rows are invalid', () => {
    fc.assert(
      fc.property(
        withInvalid,
        fc.array(fc.boolean(), { maxLength: 40 }),
        ({ nodes, invalid }, deaths) => {
          const changes = nodes.map((node, i) =>
            deaths[i] ? { ...node.change, payload: null, deletedAt: 'd' } : node.change,
          );
          const result = familyRefusals(changes, new Set(invalid));
          for (const index of result) expect(changes[index]!.deletedAt).toBeNull();
        },
      ),
    );
  });
});
