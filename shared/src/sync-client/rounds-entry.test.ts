import { describe, expect, it } from 'vitest';

import { ClientChangeSchema, type ClientChange } from '../sync/protocol';
import { TEXT_LIMITS } from '../sync/text-limits';
import { applyRank } from './order';
import type { Payload } from './rows';
import { buildRoundsEntry, parseRoundsFired, type RoundsEntryDraft } from './rounds-entry';
import type { EntryContext, EntryResult } from './session-entry';

const NOW = '2026-10-10T10:00:00.000Z';

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

const draft = (overrides: Partial<RoundsEntryDraft> = {}): RoundsEntryDraft => ({
  type: 'training',
  disciplineId: 'spsf-precision',
  startedAt: '2026-10-09T16:00:00.000Z',
  name: '',
  defaultName: 'Training — 9 Oct 2026',
  location: '',
  competitionLevel: 'krets',
  isChampionship: true,
  competitionName: 'KM',
  weaponGroup: 'spsf:B',
  shooterClass: '2',
  eventId: 'e1',
  firearmId: null,
  ammoLotId: null,
  roundsFired: '60',
  ...overrides,
});

const firearm: Payload = {
  id: 'f1',
  make: 'Make',
  model: 'Model',
  round_count: 100,
  rounds_since_maintenance: 40,
  is_own: 1,
  updated_at: '2026-01-01T00:00:00.000Z',
};

const context = (overrides: Partial<EntryContext> = {}): EntryContext => ({
  firearms: new Map([['f1', firearm]]),
  firearmGroups: [],
  ammoLots: new Map([['a1', { id: 'a1' }]]),
  ...overrides,
});

const build = (d: RoundsEntryDraft, c: EntryContext = context()) =>
  buildRoundsEntry(d, c, makeDeps());

function changesOf(result: EntryResult): ClientChange[] {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result.changes;
}

const sessionOf = (changes: ClientChange[]) =>
  changes.find((c) => c.tableName === 'sessions')!.payload as Payload;

describe('parseRoundsFired', () => {
  it.each([
    ['', null],
    ['  ', null],
    ['0', 0],
    [' 007 ', 7],
    ['60', 60],
    ['9007199254740991', 9007199254740991],
  ])('RO2 %j reads as %j', (text, expected) => {
    expect(parseRoundsFired(text)).toEqual({ ok: true, rounds: expected });
  });

  it.each(['-3', '2.5', 'abc', '1e2', '0x10', '6 0', '9007199254740992'])(
    'RO2 %j is invalid',
    (text) => {
      expect(parseRoundsFired(text)).toEqual({ ok: false });
    },
  );
});

describe('buildRoundsEntry', () => {
  it("RO1 a rounds session: kind 'rounds', no program, no decimal, extra_rounds n, firearm first", () => {
    const result = build(draft({ firearmId: 'f1' }));
    const changes = changesOf(result);
    expect(changes.map((c) => c.tableName)).toEqual(['firearms', 'sessions']);
    const ranks = changes.map((c) => applyRank(c.tableName));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(changes[0]!.payload).toEqual({
      ...firearm,
      round_count: 160,
      rounds_since_maintenance: 100,
      updated_at: NOW,
    });
    const session = sessionOf(changes);
    expect(result.ok && result.sessionId).toBe(session.id);
    expect(session).toMatchObject({
      kind: 'rounds',
      type: 'training',
      discipline_id: 'spsf-precision',
      program_id: null,
      decimal_scoring: 0,
      series_length: null,
      falt_result_mode: null,
      extra_rounds: 60,
      firearm_id: 'f1',
      started_at: '2026-10-09T16:00:00.000Z',
      created_at: NOW,
      updated_at: NOW,
      deleted_at: null,
    });
  });

  it('RO3 blank rounds store null and push no firearm; "0" stores 0 and pushes no firearm', () => {
    const blank = changesOf(build(draft({ firearmId: 'f1', roundsFired: ' ' })));
    expect(blank.map((c) => c.tableName)).toEqual(['sessions']);
    expect(sessionOf(blank)).toMatchObject({ extra_rounds: null, firearm_id: 'f1' });
    const zero = changesOf(build(draft({ firearmId: 'f1', roundsFired: '0' })));
    expect(zero.map((c) => c.tableName)).toEqual(['sessions']);
    expect(sessionOf(zero)).toMatchObject({ extra_rounds: 0 });
    // Without a firearm the rounds are still stored; no counter moves.
    const noGun = changesOf(build(draft({ roundsFired: '25' })));
    expect(noGun.map((c) => c.tableName)).toEqual(['sessions']);
    expect(sessionOf(noGun)).toMatchObject({ extra_rounds: 25, firearm_id: null });
  });

  it('RO4 invalid rounds are refused with nothing built, collected with the other errors', () => {
    expect(build(draft({ roundsFired: '2.5' }))).toEqual({
      ok: false,
      errors: [{ kind: 'invalidRounds' }],
    });
    const result = build(
      draft({ roundsFired: 'x', firearmId: 'gone', ammoLotId: 'gone', startedAt: '' }),
    );
    expect(result.ok || result.errors.map((e) => e.kind)).toEqual([
      'invalidRounds',
      'unknownFirearm',
      'unknownAmmoLot',
      'invalidStartedAt',
    ]);
  });

  it('RO5 a blank name falls back; training nulls the competition fields and takes the vapengrupp from the gun', () => {
    const changes = changesOf(
      build(
        draft({ name: '  ', location: ' Range ', firearmId: 'f1' }),
        context({
          firearmGroups: [
            { id: 'g', firearm_id: 'f1', group_id: 'spsf:C', is_default_for_group: 0 },
          ],
        }),
      ),
    );
    expect(sessionOf(changes)).toMatchObject({
      name: 'Training — 9 Oct 2026',
      location: 'Range',
      competition_level: null,
      is_championship: 0,
      competition_name: null,
      weapon_group: 'spsf:C',
      shooter_class: null,
      event_id: null,
    });
  });

  it('RO5 a competition keeps its fields; a typed name is trimmed', () => {
    const changes = changesOf(build(draft({ type: 'competition', name: ' Club night ' })));
    expect(sessionOf(changes)).toMatchObject({
      type: 'competition',
      name: 'Club night',
      competition_level: 'krets',
      is_championship: 1,
      competition_name: 'KM',
      weapon_group: 'spsf:B',
      shooter_class: '2',
      event_id: 'e1',
      location: null,
    });
  });

  it.each([
    ['name', { name: 'n'.repeat(TEXT_LIMITS.sessions.name + 1) }, TEXT_LIMITS.sessions.name],
    [
      'competitionName',
      {
        type: 'competition' as const,
        competitionName: 'c'.repeat(TEXT_LIMITS.sessions.competition_name + 1),
      },
      TEXT_LIMITS.sessions.competition_name,
    ],
    [
      'location',
      { location: 'l'.repeat(TEXT_LIMITS.sessions.location + 1) },
      TEXT_LIMITS.sessions.location,
    ],
  ])('RO5 a %s over TEXT_LIMITS is refused', (field, overrides, max) => {
    expect(build(draft(overrides))).toEqual({
      ok: false,
      errors: [{ kind: 'tooLong', field, max }],
    });
  });

  it('RO6 an unknown firearm or ammo lot and a bad startedAt are refused; known ones are stored', () => {
    expect(build(draft({ firearmId: 'gone' }))).toEqual({
      ok: false,
      errors: [{ kind: 'unknownFirearm' }],
    });
    expect(build(draft({ ammoLotId: 'gone' }))).toEqual({
      ok: false,
      errors: [{ kind: 'unknownAmmoLot' }],
    });
    expect(build(draft({ startedAt: '2026-10-09T08:15:00Z' }))).toEqual({
      ok: false,
      errors: [{ kind: 'invalidStartedAt' }],
    });
    expect(sessionOf(changesOf(build(draft({ ammoLotId: 'a1' }))))).toMatchObject({
      ammo_lot_id: 'a1',
    });
  });

  it('RO7 an unknown discipline throws, as buildSessionEntry does', () => {
    expect(() => build(draft({ disciplineId: 'gone' }))).toThrow('Unknown discipline: gone');
  });

  it('RO7 a fält discipline is accepted, with no fält result mode', () => {
    expect(sessionOf(changesOf(build(draft({ disciplineId: 'spsf-falt' }))))).toMatchObject({
      kind: 'rounds',
      discipline_id: 'spsf-falt',
      falt_result_mode: null,
    });
  });

  it('RO8 every change parses with ClientChangeSchema; rowId is the payload id; ids are fresh', () => {
    const changes = changesOf(build(draft({ firearmId: 'f1' })));
    for (const change of changes) {
      expect(ClientChangeSchema.parse(change)).toEqual(change);
      expect(change.rowId).toBe((change.payload as Payload).id);
      expect(change).toMatchObject({ deletedAt: null, updatedAt: NOW });
    }
    expect(new Set(changes.map((c) => c.clientChangeId)).size).toBe(2);
    expect(sessionOf(changes).id).toBe('0199b000-0000-7000-8000-000000000001');
  });
});
