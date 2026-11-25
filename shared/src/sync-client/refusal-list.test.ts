// docs/specs/sync-discard-refused-spec.md §2.2, scenarios LIST, CTX*, GONE.
import { describe, expect, it } from 'vitest';

import type { RowRef } from '../sync/family';
import type { RefusalEntry } from '../sync/protocol';
import { badRows, badRowTitle, confirmParts, type RowLookup } from './refusal-list';

const invalid = (tableName: RefusalEntry['tableName'], rowId: string): RefusalEntry => ({
  tableName,
  rowId,
  reason: 'invalid_payload',
  arrival: 1,
  blocker: null,
});
const waiting = (
  tableName: RefusalEntry['tableName'],
  rowId: string,
  blocker: RowRef,
): RefusalEntry => ({ tableName, rowId, reason: 'family_refused', arrival: 2, blocker });

const T2 = { tableName: 'shots', rowId: 'T2' } as const;

function rows(entries: Record<string, Record<string, unknown>>): RowLookup {
  return ({ tableName, rowId }) => entries[`${tableName}:${rowId}`];
}

const sessionFamily = rows({
  'shots:T2': { id: 'T2', series_id: 'R1' },
  'series:R1': { id: 'R1', session_id: 'S1' },
  'sessions:S1': { id: 'S1', name: 'Kväll', started_at: '2026-11-20T18:00:00.000Z' },
  'firearms:F1': { id: 'F1', make: 'Pardini', model: 'SP' },
  'licenses:L1': { id: 'L1', firearm_id: 'F1' },
});

describe('badRows', () => {
  it('LIST one row per bad row, in order, with its waiting count', () => {
    const list = badRows(
      [
        invalid('shots', 'T2'),
        waiting('series', 'R1', T2),
        waiting('shots', 'T3', T2),
        invalid('licenses', 'L1'),
        waiting('sessions', 'S9', { tableName: 'shots', rowId: 'T8' }),
      ],
      sessionFamily,
    );
    expect(list.map((b) => [b.tableName, b.rowId, b.waiting])).toEqual([
      ['shots', 'T2', 2],
      ['licenses', 'L1', 0],
    ]);
  });

  it('LIST a blocker in another table with the same id is not counted', () => {
    const list = badRows(
      [invalid('shots', 'X'), waiting('series', 'R1', { tableName: 'series', rowId: 'X' })],
      () => undefined,
    );
    expect(list[0]!.waiting).toBe(0);
  });

  it('LIST nothing refused lists nothing', () => {
    expect(badRows([], sessionFamily)).toEqual([]);
  });

  it('CTX a member found locally names its session', () => {
    expect(badRows([invalid('shots', 'T2')], sessionFamily)).toEqual([
      {
        tableName: 'shots',
        rowId: 'T2',
        waiting: 0,
        held: true,
        root: { tableName: 'sessions', rowId: 'S1' },
        context: { kind: 'session', name: 'Kväll', startedAt: '2026-11-20T18:00:00.000Z' },
        role: 'member',
      },
    ]);
  });

  it('CTX a refused session is its own root', () => {
    const [row] = badRows([invalid('sessions', 'S1')], sessionFamily);
    expect(row).toMatchObject({
      held: true,
      root: { tableName: 'sessions', rowId: 'S1' },
      context: { kind: 'session', name: 'Kväll' },
      role: 'root',
    });
  });

  it('CTX-NONAME a session with an empty or missing name shows its date alone', () => {
    for (const name of ['', '   ', null, undefined]) {
      const [row] = badRows(
        [invalid('sessions', 'S1')],
        rows({ 'sessions:S1': { id: 'S1', name, started_at: '2026-11-20T18:00:00.000Z' } }),
      );
      expect(row!.context).toEqual({
        kind: 'session',
        name: null,
        startedAt: '2026-11-20T18:00:00.000Z',
      });
    }
    const [noDate] = badRows([invalid('sessions', 'S1')], rows({ 'sessions:S1': { id: 'S1' } }));
    expect(noDate!.context).toEqual({ kind: 'session', name: null, startedAt: null });
  });

  it('CTX-NODATE a start date that is not a date is left out, so the title still renders', () => {
    for (const started_at of ['not a date', '', 42]) {
      const [row] = badRows(
        [invalid('sessions', 'S1')],
        rows({ 'sessions:S1': { id: 'S1', name: 'Kväll', started_at } }),
      );
      expect(row!.context).toEqual({ kind: 'session', name: 'Kväll', startedAt: null });
    }
  });

  it('CTX-FIREARM a license names its firearm, and a firearm itself', () => {
    const [license] = badRows([invalid('licenses', 'L1')], sessionFamily);
    expect(license).toMatchObject({
      root: { tableName: 'firearms', rowId: 'F1' },
      context: { kind: 'firearm', label: 'Pardini SP' },
      role: 'other',
    });
    const [firearm] = badRows([invalid('firearms', 'F1')], sessionFamily);
    expect(firearm).toMatchObject({
      root: { tableName: 'firearms', rowId: 'F1' },
      context: { kind: 'firearm', label: 'Pardini SP' },
      role: 'root',
    });
  });

  it('GONE a bad row not held has no root and no context, and stays listed', () => {
    const [row] = badRows([invalid('shots', 'T2')], () => undefined);
    expect(row).toEqual({
      tableName: 'shots',
      rowId: 'T2',
      waiting: 0,
      held: false,
      root: null,
      context: null,
      role: 'member',
    });
  });

  it('GONE a parent missing on the way up leaves root and context null', () => {
    const [row] = badRows(
      [invalid('shots', 'T2')],
      rows({ 'shots:T2': { id: 'T2', series_id: 'R1' } }),
    );
    expect(row).toMatchObject({ held: true, root: null, context: null, role: 'member' });
  });

  it('GONE a session missing above a held series leaves root and context null', () => {
    const [row] = badRows(
      [invalid('shots', 'T2')],
      rows({
        'shots:T2': { id: 'T2', series_id: 'R1' },
        'series:R1': { id: 'R1', session_id: 'S1' },
      }),
    );
    expect(row).toMatchObject({ held: true, root: null, context: null });
  });

  it('GONE a member whose owner column is empty has no root', () => {
    const [row] = badRows([invalid('shots', 'T2')], rows({ 'shots:T2': { id: 'T2' } }));
    expect(row).toMatchObject({ held: true, root: null, context: null });
  });

  it('a refused firearm whose row is not held still roots at itself, with no label', () => {
    const [row] = badRows([invalid('firearms', 'F9')], () => undefined);
    expect(row).toMatchObject({
      held: false,
      root: { tableName: 'firearms', rowId: 'F9' },
      context: null,
      role: 'root',
    });
  });

  it('a table with no family has no root, and role other', () => {
    for (const tableName of ['tags', 'ammo_lots', 'settings'] as const) {
      const [row] = badRows([invalid(tableName, 'X')], () => ({ id: 'X' }));
      expect(row).toMatchObject({ held: true, root: null, context: null, role: 'other' });
    }
  });
});

// Both clients word a bad row the same way (rule 11): its title, and the
// confirm's lines as i18n keys.
describe('badRowTitle and confirmParts', () => {
  const base = badRows([invalid('shots', 'T2')], sessionFamily)[0]!;
  const date = (iso: string) => `d(${iso.slice(0, 10)})`;

  it('names the kind and its session, by name and date', () => {
    expect(badRowTitle(base, 'Shot', date)).toBe('Shot · Kväll, d(2026-11-20)');
  });

  it('a session with no name shows its date; with neither, the kind alone', () => {
    const noName = {
      ...base,
      context: { kind: 'session', name: null, startedAt: '2026-11-20T18:00:00.000Z' },
    } as const;
    expect(badRowTitle(noName, 'Session', date)).toBe('Session · d(2026-11-20)');
    const bare = { ...base, context: { kind: 'session', name: null, startedAt: null } } as const;
    expect(badRowTitle(bare, 'Session', date)).toBe('Session');
  });

  it('a firearm context shows its label; no context shows the kind', () => {
    const firearm = { ...base, context: { kind: 'firearm', label: 'Pardini SP' } } as const;
    expect(badRowTitle(firearm, 'License', date)).toBe('License · Pardini SP');
    expect(badRowTitle({ ...base, context: null }, 'Shot', date)).toBe('Shot');
  });

  it('the confirm adds the member or the root line to the body', () => {
    expect(confirmParts('member')).toEqual(['body', 'member']);
    expect(confirmParts('root')).toEqual(['body', 'root']);
    expect(confirmParts('other')).toEqual(['body']);
  });
});
