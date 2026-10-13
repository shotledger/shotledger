import type { ShooterProfile } from '@shotledger/shared/src/disciplines';
import { describe, expect, it } from 'vitest';

import {
  buildEntry,
  canStartFinal,
  disciplineOptions,
  finalOffered,
  startFinal,
  toRoundsDraft,
  withKind,
} from './kinds';
import { initialFalt, withHits } from './falt-model';
import {
  addRow,
  canMarkSighter,
  initialForm,
  onRowEnter,
  sendsTheSame,
  toDraft,
  withDiscipline,
  withProgram,
  withType,
  type EntryForm,
} from './model';

const NOW = new Date(2026, 9, 10, 18, 45);
const NO_PROFILE: ShooterProfile = {
  birthYear: null,
  skillClass: null,
  competesInWomensClasses: false,
};

const fresh = () => initialForm(NOW, NO_PROFILE);
const precision = (): EntryForm => withProgram(fresh(), 'spsf-precision');
const typed = (form: EntryForm, ...texts: string[]): EntryForm => ({
  ...form,
  rows: form.rows.map((row, i) => (texts[i] === undefined ? row : { ...row, text: texts[i] })),
});
const finals = (form: EntryForm) => form.rows.map((row) => row.isFinal === true);

describe('rounds-only and final series on the Enter Series form', () => {
  it('starts as a scored-series session with no rounds typed', () => {
    expect(fresh()).toMatchObject({ kind: 'series', roundsFired: '' });
  });

  it('WK1 Rounds Only drops the program and decimal scoring; back to series clears the rounds', () => {
    const before = { ...withProgram(fresh(), 'spsf-precision'), decimalScoring: true };
    const rounds = withKind(before, 'rounds');
    expect(rounds).toMatchObject({ kind: 'rounds', programId: null, decimalScoring: false });
    const series = withKind({ ...rounds, roundsFired: '60' }, 'series');
    expect(series).toMatchObject({
      kind: 'series',
      roundsFired: '',
      programId: null,
      disciplineId: 'spsf-precision',
    });
  });

  it('WK2 the discipline options: every discipline of the regulation for either kind (R5, #688)', () => {
    const series = disciplineOptions(fresh()).map((d) => d.id);
    expect(series).toContain('spsf-precision');
    expect(series).toContain('spsf-falt');
    const rounds = disciplineOptions(withKind(fresh(), 'rounds')).map((d) => d.id);
    expect(rounds).toEqual(series);
  });

  it('WK3 back to series keeps the discipline, fält included (R5, #688)', () => {
    const falt = withDiscipline(withKind(fresh(), 'rounds'), 'spsf-falt');
    expect(withKind(falt, 'series')).toMatchObject({
      kind: 'series',
      disciplineId: 'spsf-falt',
      regulationId: 'spsf',
      roundsFired: '',
    });
    const milsnabb = withDiscipline(withKind(fresh(), 'rounds'), 'spsf-milsnabb');
    expect(withKind(milsnabb, 'series').disciplineId).toBe('spsf-milsnabb');
  });

  it('WK4 a final is offered only by a program with one, and only for scored series', () => {
    expect(finalOffered(precision())).toBe(true);
    expect(finalOffered(fresh())).toBe(false);
    expect(finalOffered(withProgram(fresh(), 'spsf-magnumprecision'))).toBe(false);
    expect(finalOffered(withType(withDiscipline(fresh(), 'spsf-milsnabb'), 'competition'))).toBe(
      false,
    );
    // A program id this build does not know offers nothing.
    expect(finalOffered({ ...precision(), programId: 'gone' })).toBe(false);
    // Rounds Only drops the program; a program set behind it does not count.
    expect(finalOffered({ ...precision(), kind: 'rounds' })).toBe(false);
  });

  it('WK5 Start Final needs an ordinary row with a shot and no final yet', () => {
    expect(canStartFinal(precision())).toBe(false);
    expect(canStartFinal(typed(precision(), '10 9'))).toBe(true);
    expect(canStartFinal(typed(precision(), 'q'))).toBe(false);
    expect(canStartFinal(typed(precision(), '   '))).toBe(false);
    const sighterOnly = typed(precision(), '10 9');
    sighterOnly.rows[0] = { ...sighterOnly.rows[0]!, isSighter: true };
    expect(canStartFinal(sighterOnly)).toBe(false);
    expect(canStartFinal(startFinal(typed(precision(), '10 9')))).toBe(false);
    expect(canStartFinal(typed(fresh(), '10 9'))).toBe(false);
    // A sighter first, then a scored row: the scored one counts.
    const both = typed(addRow(sighterOnly), '10 9', '8');
    expect(canStartFinal(both)).toBe(true);
  });

  it('WK6 Start Final appends a final row; Add Series and Enter after it add final rows', () => {
    const started = startFinal(typed(precision(), '10 9'));
    expect(finals(started)).toEqual([false, true]);
    expect(started.rows[1]!.text).toBe('');
    expect(finals(addRow(started))).toEqual([false, true, true]);
    const entered = onRowEnter(started, 1);
    expect(entered.focus).toBe(2);
    expect(finals(entered.form)).toEqual([false, true, true]);
    expect(finals(addRow(precision()))).toEqual([false, false]);
    // The section follows the last row, not any other.
    const later = startFinal(addRow(typed(precision(), '10 9')));
    expect(finals(addRow(later))).toEqual([false, false, true, true]);
    expect(finals(addRow({ ...precision(), rows: [] }))).toEqual([false]);
  });

  it('WK7 one sighter per section: the final has its own', () => {
    const started = startFinal(typed(precision(), '10 9'));
    const mainSighter = {
      ...started,
      rows: started.rows.map((row, i) => (i === 0 ? { ...row, isSighter: true } : row)),
    };
    expect(canMarkSighter(mainSighter, 1)).toBe(true);
    const withSecondMain = addRow({ ...mainSighter, rows: [mainSighter.rows[0]!] });
    expect(canMarkSighter(withSecondMain, 1)).toBe(false);
    const finalSighter = {
      ...addRow(started),
      rows: addRow(started).rows.map((row, i) => (i === 1 ? { ...row, isSighter: true } : row)),
    };
    expect(canMarkSighter(finalSighter, 2)).toBe(false);
    expect(canMarkSighter(finalSighter, 0)).toBe(true);
  });

  it('WK8 a program without a final turns final rows into ordinary rows', () => {
    const started = typed(addRow(startFinal(typed(precision(), '10 9'))), '10 9', '9', '8');
    expect(finals(withProgram(started, null))).toEqual([false, false, false]);
    const fixed = withProgram(
      typed(addRow(startFinal(typed(precision(), '10 9'))), '10 9', '9', '8'),
      'spsf-magnumprecision',
    );
    expect(finals(fixed)).toEqual([false, false, false]);
    const milsnabb = withProgram(withDiscipline(started, 'spsf-milsnabb'), 'spsf-milsnabb');
    expect(milsnabb.rows.some((row) => row.isFinal)).toBe(false);
    // Staying on a program with a final keeps them.
    expect(finals(withProgram(started, 'spsf-precision'))).toEqual([false, true, true]);
  });

  it('WK9 the rounds draft carries the session fields and the typed rounds; toDraft carries isFinal', () => {
    const form = {
      ...withType(withKind(fresh(), 'rounds'), 'competition'),
      name: 'Club night',
      location: 'Range',
      competitionName: 'KM',
      firearmId: 'f1',
      ammoLotId: 'a1',
      roundsFired: ' 60 ',
    };
    expect(toRoundsDraft(form, 'Competition — 10 Oct 2026')).toEqual({
      type: 'competition',
      disciplineId: 'spsf-precision',
      startedAt: new Date(2026, 9, 10, 18, 45).toISOString(),
      name: 'Club night',
      defaultName: 'Competition — 10 Oct 2026',
      location: 'Range',
      competitionLevel: 'forening',
      isChampionship: false,
      competitionName: 'KM',
      weaponGroup: null,
      shooterClass: null,
      eventId: null,
      firearmId: 'f1',
      ammoLotId: 'a1',
      roundsFired: ' 60 ',
    });
    const started = startFinal(typed(precision(), '10 9'));
    expect(toDraft(started, '').series).toEqual([
      { text: '10 9', isSighter: false, isFinal: false },
      { text: '', isSighter: false, isFinal: true },
    ]);
  });

  it('WK9 buildEntry builds a rounds session for Rounds Only and series otherwise', () => {
    let n = 0;
    const deps = {
      newId: () => `0199b000-0000-7000-8000-${(n += 1).toString(16).padStart(12, '0')}`,
      newChangeId: () => `00000000-0000-4000-8000-${(n += 1).toString(16).padStart(12, '0')}`,
      now: () => '2026-10-10T17:00:00.000Z',
    };
    const context = {
      firearms: new Map(),
      firearmGroups: [],
      ammoLots: new Map(),
      tags: new Map(),
    };
    const rounds = buildEntry(
      { ...withKind(fresh(), 'rounds'), roundsFired: '60' },
      initialFalt(),
      'd',
      context,
      deps,
    );
    expect(rounds.ok && rounds.changes.map((c) => c.payload)).toEqual([
      expect.objectContaining({ kind: 'rounds', extra_rounds: 60 }),
    ]);
    const series = buildEntry(typed(fresh(), '10'), initialFalt(), 'd', context, deps);
    expect(series.ok && series.changes.map((c) => c.tableName)).toEqual([
      'sessions',
      'series',
      'shots',
    ]);
  });

  it('TU8 buildEntry carries the form tags in the one push, for series and rounds alike', () => {
    let n = 0;
    const deps = {
      newId: () => `0199b000-0000-7000-8000-${(n += 1).toString(16).padStart(12, '0')}`,
      newChangeId: () => `00000000-0000-4000-8000-${(n += 1).toString(16).padStart(12, '0')}`,
      now: () => '2026-10-10T17:00:00.000Z',
    };
    const km = { id: 't1', name: 'KM', deleted_at: null };
    const context = {
      firearms: new Map(),
      firearmGroups: [],
      ammoLots: new Map(),
      tags: new Map([['t1', km]]),
    };
    const series = buildEntry(
      { ...typed(fresh(), '10'), tags: ['km', 'Club'] },
      initialFalt(),
      'd',
      context,
      deps,
    );
    expect(series.ok && series.changes.map((c) => c.tableName)).toEqual([
      'tags',
      'sessions',
      'session_tags',
      'session_tags',
      'series',
      'shots',
    ]);
    const links = series.ok ? series.changes.filter((c) => c.tableName === 'session_tags') : [];
    expect(links[0]!.payload).toEqual(expect.objectContaining({ tag_id: 't1' }));
    const rounds = buildEntry(
      { ...withKind(fresh(), 'rounds'), roundsFired: '60', tags: ['KM'] },
      initialFalt(),
      'd',
      context,
      deps,
    );
    expect(rounds.ok && rounds.changes.map((c) => c.tableName)).toEqual([
      'sessions',
      'session_tags',
    ]);
  });

  it('WK11 buildEntry builds fält stations for a fält series, rounds for a rounds-only fält, tags with both (R9)', () => {
    let n = 0;
    const deps = {
      newId: () => `0199b000-0000-7000-8000-${(n += 1).toString(16).padStart(12, '0')}`,
      newChangeId: () => `00000000-0000-4000-8000-${(n += 1).toString(16).padStart(12, '0')}`,
      now: () => '2026-10-10T17:00:00.000Z',
    };
    const context = {
      firearms: new Map(),
      firearmGroups: [],
      ammoLots: new Map(),
      tags: new Map(),
    };
    const faltForm = { ...withDiscipline(fresh(), 'spsf-falt'), tags: ['KM'] };
    const stations = withHits(initialFalt(), 0, 0);
    const series = buildEntry(faltForm, stations, 'd', context, deps);
    expect(series.ok && series.changes.map((c) => c.tableName)).toEqual([
      'tags',
      'sessions',
      'session_tags',
      'falt_stations',
    ]);
    const rounds = buildEntry(
      { ...withKind(faltForm, 'rounds'), roundsFired: '30' },
      stations,
      'd',
      context,
      deps,
    );
    expect(rounds.ok && rounds.changes.map((c) => c.tableName)).toEqual([
      'tags',
      'sessions',
      'session_tags',
    ]);
  });

  it('WK10 Start Final keeps a held request; a change of kind drops it', () => {
    const form = typed(precision(), '10 9');
    expect(sendsTheSame(form, startFinal(form))).toBe(true);
    expect(sendsTheSame(form, withKind(form, 'rounds'))).toBe(false);
    const rounds = withKind(form, 'rounds');
    expect(sendsTheSame(rounds, { ...rounds, roundsFired: '5' })).toBe(false);
  });
});
