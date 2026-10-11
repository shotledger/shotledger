import { describe, expect, it } from 'vitest';

import { buildProgramSkeleton, getProgram, PROGRAMS } from '../disciplines';
import { TEXT_LIMITS } from '../sync/text-limits';
import {
  ClientChangeSchema,
  MAX_PAYLOAD_BYTES,
  PUSH_BATCH_MAX,
  PushRequestSchema,
  type ClientChange,
} from '../sync/protocol';
import { applyRank } from './order';
import type { Payload } from './rows';
import {
  buildSessionEntry,
  type EntryContext,
  type EntryResult,
  type SessionEntryDraft,
} from './session-entry';

const NOW = '2026-10-07T10:00:00.000Z';

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

const draft = (overrides: Partial<SessionEntryDraft> = {}): SessionEntryDraft => ({
  type: 'training',
  disciplineId: 'generic-rings',
  programId: null,
  startedAt: '2026-10-06T16:00:00.000Z',
  name: '',
  defaultName: 'Training — 6 Oct 2026',
  location: '',
  competitionLevel: null,
  isChampionship: false,
  competitionName: '',
  weaponGroup: null,
  shooterClass: null,
  eventId: null,
  firearmId: null,
  ammoLotId: null,
  decimalScoring: false,
  seriesLength: null,
  series: [
    { text: '10 9 X 10 9', isSighter: false },
    { text: '8 7 6 5 4', isSighter: false },
  ],
  ...overrides,
});

const rows = (...texts: string[]) => texts.map((text) => ({ text, isSighter: false }));

const firearm = (id: string, roundCount = 100): Payload => ({
  id,
  make: 'Make',
  model: 'Model',
  round_count: roundCount,
  rounds_since_maintenance: 4,
  updated_at: '2026-01-01T00:00:00.000Z',
});

const group = (firearmId: string, groupId: string, isDefault = 0): Payload => ({
  id: `${firearmId}-${groupId}`,
  firearm_id: firearmId,
  group_id: groupId,
  is_default_for_group: isDefault,
});

const context = (overrides: Partial<EntryContext> = {}): EntryContext => ({
  firearms: new Map([['f1', firearm('f1')]]),
  firearmGroups: [],
  ammoLots: new Map([['a1', { id: 'a1' }]]),
  ...overrides,
});

function build(d: SessionEntryDraft, c: EntryContext = context()) {
  return buildSessionEntry(d, c, makeDeps());
}

function changesOf(result: EntryResult): ClientChange[] {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result.changes;
}

const payloads = (changes: ClientChange[], table: string) =>
  changes.filter((c) => c.tableName === table).map((c) => c.payload as Payload);

const session = (changes: ClientChange[]) => payloads(changes, 'sessions')[0]!;

describe('buildSessionEntry', () => {
  it('E1 free-format training: 1 session, 2 series, 10 shots, in APPLY_ORDER', () => {
    const result = build(draft());
    const changes = changesOf(result);
    expect(changes.map((c) => c.tableName)).toEqual([
      'sessions',
      'series',
      'series',
      ...Array<string>(10).fill('shots'),
    ]);
    const ranks = changes.map((c) => applyRank(c.tableName));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));

    const s = session(changes);
    expect(result.ok && result.sessionId).toBe(s.id);
    expect(s).toMatchObject({
      name: 'Training — 6 Oct 2026',
      type: 'training',
      discipline_id: 'generic-rings',
      program_id: null,
      started_at: '2026-10-06T16:00:00.000Z',
      location: null,
      firearm_id: null,
      ammo_lot_id: null,
      decimal_scoring: 0,
      series_length: null,
    });
    const series = payloads(changes, 'series');
    expect(series.map((r) => [r.session_id, r.position, r.is_sighter])).toEqual([
      [s.id, 1, 0],
      [s.id, 2, 0],
    ]);
    const shots = payloads(changes, 'shots');
    expect(shots.map((r) => [r.series_id, r.position, r.value_tenths, r.is_inner_ten])).toEqual([
      [series[0]!.id, 1, 100, 0],
      [series[0]!.id, 2, 90, 0],
      [series[0]!.id, 3, 100, 1],
      [series[0]!.id, 4, 100, 0],
      [series[0]!.id, 5, 90, 0],
      [series[1]!.id, 1, 80, 0],
      [series[1]!.id, 2, 70, 0],
      [series[1]!.id, 3, 60, 0],
      [series[1]!.id, 4, 50, 0],
      [series[1]!.id, 5, 40, 0],
    ]);
  });

  it('E2 blank free-format rows are dropped, positions stay contiguous, a blank sighter is kept', () => {
    const changes = changesOf(build(draft({ series: rows('10', '', '   ', '9') })));
    expect(payloads(changes, 'series').map((r) => r.position)).toEqual([1, 2]);
    expect(payloads(changes, 'shots').map((r) => r.value_tenths)).toEqual([100, 90]);

    const withSighter = changesOf(
      build(
        draft({
          series: [
            { text: ' ', isSighter: true },
            { text: '10', isSighter: false },
          ],
        }),
      ),
    );
    expect(payloads(withSighter, 'series').map((r) => [r.position, r.is_sighter])).toEqual([
      [1, 1],
      [2, 0],
    ]);
    expect(payloads(withSighter, 'shots')).toHaveLength(1);
  });

  it('E2 an entry with no rows at all is just a session', () => {
    expect(changesOf(build(draft({ series: [] }))).map((c) => c.tableName)).toEqual(['sessions']);
  });

  const standard = getProgram('issf-standard-pistol')!;
  const skeleton = buildProgramSkeleton(standard);
  const fixed = (series: SessionEntryDraft['series']) =>
    draft({
      type: 'competition',
      disciplineId: 'issf-standard-pistol',
      programId: standard.id,
      series,
    });

  it('E3 a fixed-format program creates every skeleton series with its sighter flags, blank ones included', () => {
    expect(skeleton.length).toBe(13);
    // The draft's own sighter flags are ignored inside the skeleton.
    const typed = skeleton.map((_, i) => ({ text: i === 1 ? '10 9' : '', isSighter: i === 2 }));
    const changes = changesOf(build(fixed(typed)));
    const series = payloads(changes, 'series');
    expect(series.map((r) => [r.position, r.is_sighter])).toEqual(
      skeleton.map((entry) => [entry.position, entry.isSighter ? 1 : 0]),
    );
    expect(payloads(changes, 'shots').map((r) => r.series_id)).toEqual([
      series[1]!.id,
      series[1]!.id,
    ]);
    expect(session(changes)).toMatchObject({ program_id: standard.id, series_length: null });
  });

  it('E3 a skeleton longer than the typed rows is still laid out in full', () => {
    const changes = changesOf(build(fixed([{ text: '10', isSighter: false }])));
    expect(payloads(changes, 'series')).toHaveLength(13);
  });

  it('E3 two skeleton sighters are not a second sighter', () => {
    const centre = getProgram('issf-centre-fire-pistol')!;
    const result = build(
      draft({ type: 'competition', disciplineId: centre.disciplineId, programId: centre.id }),
    );
    expect(payloads(changesOf(result), 'series').filter((r) => r.is_sighter === 1)).toHaveLength(2);
  });

  it('E4 rows past the skeleton become ordinary series', () => {
    const typed = [
      ...skeleton.map(() => ({ text: '', isSighter: false })),
      { text: '10', isSighter: true },
      { text: '', isSighter: false },
      { text: '9', isSighter: false },
    ];
    const series = payloads(changesOf(build(fixed(typed))), 'series');
    expect(series).toHaveLength(15);
    expect(series.slice(13).map((r) => [r.position, r.is_sighter])).toEqual([
      [14, 0],
      [15, 0],
    ]);
  });

  it('E5 a row with more shots than the series length is refused (row, max), nothing built', () => {
    expect(build(draft({ seriesLength: 3, series: rows('10 10 10', '9 9 9 9') }))).toEqual({
      ok: false,
      errors: [{ kind: 'tooManyShots', row: 2, max: 3 }],
    });
    expect(build(draft({ series: rows('10 10 10 10 10 10') }))).toEqual({
      ok: false,
      errors: [{ kind: 'tooManyShots', row: 1, max: 5 }],
    });
  });

  it('E6 an unparsable row is refused with its row and token, nothing built', () => {
    expect(build(draft({ series: rows('10', '10 a') }))).toEqual({
      ok: false,
      errors: [{ kind: 'series', row: 2, error: { kind: 'token', token: 'a', position: 2 } }],
    });
  });

  it('E7 a second sighter row in free format is refused', () => {
    const result = build(
      draft({
        series: [
          { text: '10', isSighter: true },
          { text: '9', isSighter: false },
          { text: '8', isSighter: true },
          { text: '', isSighter: true },
        ],
      }),
    );
    expect(result).toEqual({
      ok: false,
      errors: [
        { kind: 'secondSighter', row: 3 },
        { kind: 'secondSighter', row: 4 },
      ],
    });
  });

  it('E8 a hits discipline is refused', () => {
    expect(build(draft({ disciplineId: 'spsf-falt', series: rows('a') }))).toEqual({
      ok: false,
      errors: [{ kind: 'hitsDiscipline' }],
    });
  });

  it('E9 scoring mode and series length follow the program, then the choice, then the discipline', () => {
    // Free format, decimals allowed and chosen: decimal mode, discipline length.
    const decimal = changesOf(
      build(draft({ decimalScoring: true, series: rows('10.4 9.8 X.1 0.0 7.7') })),
    );
    expect(session(decimal)).toMatchObject({ decimal_scoring: 1, series_length: null });
    expect(payloads(decimal, 'shots').map((r) => r.value_tenths)).toEqual([104, 98, 101, 0, 77]);

    // The chosen length is used and stored.
    const chosen = changesOf(build(draft({ seriesLength: 7, series: rows('1 2 3 4 5 6 7') })));
    expect(session(chosen)).toMatchObject({ series_length: 7, decimal_scoring: 0 });

    // A program fixes both, whatever was chosen.
    const air = getProgram('issf-air-pistol')!;
    const program = draft({
      type: 'competition',
      disciplineId: air.disciplineId,
      programId: air.id,
      decimalScoring: true,
      seriesLength: 3,
      series: rows('10 10 10 10 10 10 10 10 10 10'),
    });
    expect(session(changesOf(build(program)))).toMatchObject({
      decimal_scoring: 0,
      series_length: null,
    });
    expect(build({ ...program, series: rows('10.4') })).toMatchObject({
      ok: false,
      errors: [{ kind: 'series', row: 1 }],
    });
    expect(build({ ...program, series: rows('1 1 1 1 1 1 1 1 1 1 1') })).toEqual({
      ok: false,
      errors: [{ kind: 'tooManyShots', row: 1, max: 10 }],
    });

    // A discipline without decimals ignores the choice.
    const precision = changesOf(
      build(draft({ disciplineId: 'spsf-precision', decimalScoring: true, series: rows('10') })),
    );
    expect(session(precision)).toMatchObject({ decimal_scoring: 0 });
    expect(build(draft({ disciplineId: 'spsf-precision', series: rows('10.4') })).ok).toBe(false);
  });

  it('E9 a series length or program that the form could not produce throws', () => {
    expect(() => build(draft({ seriesLength: 0 }))).toThrow(
      /seriesLength must be a positive integer, got 0/,
    );
    expect(() => build(draft({ seriesLength: 2.5 }))).toThrow(RangeError);
    expect(() => build(draft({ programId: 'no-such-program' }))).toThrow(
      /program no-such-program is not one of generic-rings/,
    );
    expect(() => build(draft({ programId: 'issf-air-pistol' }))).toThrow(RangeError);
    // One shot per series is a length the form can produce.
    expect(session(changesOf(build(draft({ seriesLength: 1, series: rows('10') }))))).toMatchObject(
      { series_length: 1 },
    );
  });

  it('E10 training nulls the competition fields and takes the vapengrupp from the gun', () => {
    const competitionFields = {
      competitionLevel: 'krets',
      isChampionship: true,
      competitionName: '  KM  ',
      shooterClass: '2',
      eventId: 'some-event',
      weaponGroup: 'spsf:B',
      firearmId: 'f1',
      disciplineId: 'spsf-precision',
      series: rows('10'),
    };
    const groups = [group('f1', 'spsf:C'), group('f2', 'spsf:A')];

    const training = session(
      changesOf(build(draft(competitionFields), context({ firearmGroups: groups }))),
    );
    expect(training).toMatchObject({
      competition_level: null,
      is_championship: 0,
      competition_name: null,
      shooter_class: null,
      event_id: null,
      weapon_group: 'spsf:C',
    });

    // Two groups and no default: the derivation cannot decide, so the choice stands.
    const tied = [group('f1', 'spsf:C'), group('f1', 'spsf:A')];
    expect(
      session(changesOf(build(draft(competitionFields), context({ firearmGroups: tied })))),
    ).toMatchObject({ weapon_group: 'spsf:B' });
    const marked = [group('f1', 'spsf:C'), group('f1', 'spsf:A', 1)];
    expect(
      session(changesOf(build(draft(competitionFields), context({ firearmGroups: marked })))),
    ).toMatchObject({ weapon_group: 'spsf:A' });
    // No firearm: nothing to derive from.
    expect(
      session(
        changesOf(
          build(
            draft({ ...competitionFields, firearmId: null }),
            context({ firearmGroups: groups }),
          ),
        ),
      ),
    ).toMatchObject({ weapon_group: 'spsf:B' });

    const competition = session(
      changesOf(
        build(
          draft({ ...competitionFields, type: 'competition' }),
          context({ firearmGroups: groups }),
        ),
      ),
    );
    expect(competition).toMatchObject({
      type: 'competition',
      competition_level: 'krets',
      is_championship: 1,
      competition_name: 'KM',
      shooter_class: '2',
      event_id: 'some-event',
      weapon_group: 'spsf:B',
    });
    expect(
      session(
        changesOf(
          build(draft({ ...competitionFields, type: 'competition', competitionName: ' ' })),
        ),
      ),
    ).toMatchObject({ competition_name: null });
  });

  it('E11 a firearm and N shots (sighters included) push the firearm with +N', () => {
    const changes = changesOf(
      build(
        draft({
          firearmId: 'f1',
          series: [
            { text: '10 10', isSighter: true },
            { text: '9 9 9', isSighter: false },
          ],
        }),
      ),
    );
    expect(changes[0]!.tableName).toBe('firearms');
    expect(changes[0]!.payload).toEqual({
      ...firearm('f1'),
      round_count: 105,
      rounds_since_maintenance: 9,
      updated_at: NOW,
    });
    expect(session(changes)).toMatchObject({ firearm_id: 'f1' });
  });

  it('E11 no firearm, or a firearm and 0 shots, push no firearm row', () => {
    expect(payloads(changesOf(build(draft())), 'firearms')).toHaveLength(0);
    const blank = changesOf(
      build(draft({ firearmId: 'f1', series: [{ text: '', isSighter: true }] })),
    );
    expect(payloads(blank, 'firearms')).toHaveLength(0);
    expect(session(blank)).toMatchObject({ firearm_id: 'f1' });
  });

  it('E12 a text field over TEXT_LIMITS is refused, naming the field', () => {
    const over = (field: keyof typeof TEXT_LIMITS.sessions) =>
      'x'.repeat(TEXT_LIMITS.sessions[field] + 1);
    expect(
      build(
        draft({
          type: 'competition',
          name: over('name'),
          competitionName: over('competition_name'),
          location: over('location'),
        }),
      ),
    ).toEqual({
      ok: false,
      errors: [
        { kind: 'tooLong', field: 'name', max: TEXT_LIMITS.sessions.name },
        { kind: 'tooLong', field: 'competitionName', max: TEXT_LIMITS.sessions.competition_name },
        { kind: 'tooLong', field: 'location', max: TEXT_LIMITS.sessions.location },
      ],
    });
    // A blank name takes the default, as on the phone.
    expect(session(changesOf(build(draft({ name: '   ' }))))).toMatchObject({
      name: 'Training — 6 Oct 2026',
    });
    // At the limit is fine; a training session does not store a competition name.
    const atLimit = changesOf(
      build(
        draft({
          name: ` ${'n'.repeat(TEXT_LIMITS.sessions.name)} `,
          competitionName: over('competition_name'),
          location: '  Range  ',
        }),
      ),
    );
    expect(session(atLimit)).toMatchObject({
      name: 'n'.repeat(TEXT_LIMITS.sessions.name),
      location: 'Range',
      competition_name: null,
    });
  });

  it('E12 errors are collected across fields and rows', () => {
    const result = build(
      draft({ name: 'x'.repeat(500), series: rows('a', '1 1 1 1 1 1'), firearmId: 'gone' }),
    );
    expect(result.ok || result.errors.map((e) => e.kind)).toEqual([
      'tooLong',
      'series',
      'tooManyShots',
      'unknownFirearm',
    ]);
  });

  it('E13 every change parses, ids are fresh, rowId = payload.id, within push limits', () => {
    const wide = '€'.repeat(TEXT_LIMITS.sessions.name);
    const changes = changesOf(
      build(
        draft({
          type: 'competition',
          name: wide,
          competitionName: '€'.repeat(TEXT_LIMITS.sessions.competition_name),
          location: '€'.repeat(TEXT_LIMITS.sessions.location),
          firearmId: 'f1',
          ammoLotId: 'a1',
          seriesLength: 10,
          series: Array.from({ length: 40 }, () => ({
            text: 'X 10 9 8 7 6 5 4 3 2',
            isSighter: false,
          })),
        }),
      ),
    );
    expect(changes.length).toBeLessThanOrEqual(PUSH_BATCH_MAX);
    expect(PushRequestSchema.safeParse({ protocolVersion: 1, changes }).success).toBe(true);
    const encoder = new TextEncoder();
    for (const change of changes) {
      expect(ClientChangeSchema.safeParse(change).success).toBe(true);
      const payload = change.payload as Payload;
      expect(change.rowId).toBe(payload.id);
      expect(change.deletedAt).toBeNull();
      expect(change.updatedAt).toBe(NOW);
      expect(encoder.encode(JSON.stringify(payload)).byteLength).toBeLessThanOrEqual(
        MAX_PAYLOAD_BYTES,
      );
    }
    expect(new Set(changes.map((c) => c.clientChangeId)).size).toBe(changes.length);
    const newRows = changes.filter((c) => c.tableName !== 'firearms');
    expect(new Set(newRows.map((c) => c.rowId)).size).toBe(newRows.length);
    for (const change of newRows) {
      expect((change.payload as Payload).created_at).toBe(NOW);
    }
  });

  it('E13 an entry that would not fit one push request is refused', () => {
    const big = draft({
      seriesLength: 10,
      series: Array.from({ length: 50 }, () => ({ text: '1 1 1 1 1 1 1 1 1 1', isSighter: false })),
    });
    // 1 session + 50 series + 500 shots.
    expect(build(big)).toEqual({
      ok: false,
      errors: [{ kind: 'tooManyChanges', max: PUSH_BATCH_MAX }],
    });
    // 1 + 46 + 453 = exactly PUSH_BATCH_MAX fits.
    const exact = build({
      ...big,
      series: [...big.series.slice(0, 45), { text: '1 1 1', isSighter: false }],
    });
    expect(changesOf(exact)).toHaveLength(PUSH_BATCH_MAX);
  });

  it('E13 one change over PUSH_BATCH_MAX is refused', () => {
    // 1 session + 50 series + 450 shots = PUSH_BATCH_MAX + 1.
    const over = draft({
      seriesLength: 10,
      series: Array.from({ length: 50 }, () => ({ text: '1 1 1 1 1 1 1 1 1', isSighter: false })),
    });
    expect(build(over)).toEqual({
      ok: false,
      errors: [{ kind: 'tooManyChanges', max: PUSH_BATCH_MAX }],
    });
  });

  it('E14 a firearm or ammo lot that is not among the pulled rows is refused', () => {
    expect(build(draft({ firearmId: 'f9' }))).toEqual({
      ok: false,
      errors: [{ kind: 'unknownFirearm' }],
    });
    expect(build(draft({ ammoLotId: 'a9' }))).toEqual({
      ok: false,
      errors: [{ kind: 'unknownAmmoLot' }],
    });
    expect(session(changesOf(build(draft({ ammoLotId: 'a1' }))))).toMatchObject({
      ammo_lot_id: 'a1',
    });
  });

  it.each([
    ['empty', ''],
    ['garbage', 'garbage'],
    ['a month that does not exist', '2026-13-09T08:15:00.000Z'],
    ['a day that Date rolls over', '2026-02-30T08:15:00.000Z'],
    ['a date alone', '2026-10-09'],
    ['whole seconds', '2026-10-09T08:15:00Z'],
    ['an offset other than Z', '2026-10-09T10:15:00.000+02:00'],
    // 24 characters, so only a check past the seconds refuses it.
    ['a 24-character offset spelling', '2026-10-09T08:15:00+0000'],
    ['an extended year', '+010000-01-01T00:00:00.000Z'],
  ])('E15 a startedAt that is %s is refused', (_, startedAt) => {
    expect(build(draft({ startedAt }))).toEqual({
      ok: false,
      errors: [{ kind: 'invalidStartedAt' }],
    });
  });

  it('E15 an invalid startedAt is collected with the other errors', () => {
    const result = build(draft({ startedAt: '', firearmId: 'gone' }));
    expect(result.ok || result.errors.map((e) => e.kind)).toEqual([
      'unknownFirearm',
      'invalidStartedAt',
    ]);
  });

  it("E15 a UTC timestamp in toISOString's shape is stored unchanged", () => {
    const startedAt = '2026-10-09T08:15:00.000Z';
    expect(session(changesOf(build(draft({ startedAt }))))).toMatchObject({
      started_at: startedAt,
    });
  });
});

describe('final series (docs/specs/web-rounds-final-spec.md)', () => {
  const precision = (series: SessionEntryDraft['series']) =>
    draft({ disciplineId: 'spsf-precision', programId: 'spsf-precision', series });

  it('FS1 main rows then final rows: positions run on, is_final marks the final, every shot moves the firearm', () => {
    const changes = changesOf(
      build({
        ...precision([
          { text: '10 9 8 7 6', isSighter: false },
          { text: '10 10', isSighter: false },
          { text: '9 9 9 9 9', isSighter: false, isFinal: true },
          { text: 'X 10 10', isSighter: false, isFinal: true },
        ]),
        firearmId: 'f1',
      }),
    );
    const series = payloads(changes, 'series');
    expect(series.map((s) => [s.position, s.is_final, s.is_sighter])).toEqual([
      [1, 0, 0],
      [2, 0, 0],
      [3, 1, 0],
      [4, 1, 0],
    ]);
    expect(payloads(changes, 'shots')).toHaveLength(15);
    expect(payloads(changes, 'firearms')[0]).toMatchObject({
      round_count: 115,
      rounds_since_maintenance: 19,
    });
  });

  it('FS2 one sighter per section: a main and a final sighter pass, a second final sighter is refused', () => {
    const series = payloads(
      changesOf(
        build(
          precision([
            { text: '9 9', isSighter: true },
            { text: '10 9', isSighter: false },
            { text: '8 8', isSighter: true, isFinal: true },
            { text: '10', isSighter: false, isFinal: true },
          ]),
        ),
      ),
      'series',
    );
    expect(series.map((s) => [s.is_sighter, s.is_final])).toEqual([
      [1, 0],
      [0, 0],
      [1, 1],
      [0, 1],
    ]);
    expect(
      build(
        precision([
          { text: '10 9', isSighter: false },
          { text: '8 8', isSighter: true, isFinal: true },
          { text: '7', isSighter: true, isFinal: true },
        ]),
      ),
    ).toEqual({ ok: false, errors: [{ kind: 'secondSighter', row: 3 }] });
    expect(
      build(
        precision([
          { text: '9', isSighter: true },
          { text: '8', isSighter: true },
        ]),
      ),
    ).toEqual({ ok: false, errors: [{ kind: 'secondSighter', row: 2 }] });
  });

  it('FS3 no program with a final is laid out, so Start Final is never hidden by a fixed format', () => {
    const withFinal = PROGRAMS.filter((program) => program.supportsFinal);
    expect(withFinal.map((program) => program.id)).toEqual(['spsf-precision']);
    expect(withFinal.every((program) => buildProgramSkeleton(program).length === 0)).toBe(true);
  });

  it.each([
    ['free format', 'spsf-precision', null],
    ['a program without a final', 'spsf-magnumprecision', 'spsf-magnumprecision'],
    ['a fixed format', 'spsf-milsnabb', 'spsf-milsnabb'],
  ])('FS3 a final row in %s throws RangeError', (_, disciplineId, programId) => {
    const series = [
      { text: '10', isSighter: false },
      { text: '9', isSighter: false, isFinal: true },
    ];
    expect(() => build(draft({ disciplineId, programId, series }))).toThrow(
      new RangeError(`a final series needs a program with a final, got ${programId}`),
    );
  });

  it('FS4 a blank final row is dropped like any blank row; a blank final sighter is kept', () => {
    const series = payloads(
      changesOf(
        build(
          precision([
            { text: '10 9', isSighter: false },
            { text: '', isSighter: true, isFinal: true },
            { text: '  ', isSighter: false, isFinal: true },
            { text: '9', isSighter: false, isFinal: true },
          ]),
        ),
      ),
      'series',
    );
    expect(series.map((s) => [s.position, s.is_sighter, s.is_final])).toEqual([
      [1, 0, 0],
      [2, 1, 1],
      [3, 0, 1],
    ]);
  });

  it('FS5 a final with nothing shot is not saved, even with a blank final sighter', () => {
    const series = payloads(
      changesOf(
        build(
          precision([
            { text: '10 9', isSighter: false },
            { text: '', isSighter: true, isFinal: true },
            { text: '', isSighter: false, isFinal: true },
          ]),
        ),
      ),
      'series',
    );
    expect(series.map((s) => [s.position, s.is_sighter, s.is_final])).toEqual([[1, 0, 0]]);
  });

  it.each([
    ['no main rows left', [{ text: '', isSighter: false }]],
    ['only a main sighter', [{ text: '9 9', isSighter: true }]],
  ])('FS6 a final with %s is refused', (_, main) => {
    expect(build(precision([...main, { text: '10 9', isSighter: false, isFinal: true }]))).toEqual({
      ok: false,
      errors: [{ kind: 'finalWithoutMain' }],
    });
  });
});
