import { buildProgramSkeleton, getProgram } from '@shotledger/shared/src/disciplines';
import { describe, expect, it } from 'vitest';

import {
  addRow,
  canMarkSighter,
  decimalShown,
  eventsFor,
  initialForm,
  isFixed,
  modeOf,
  onRowEnter,
  ringDisciplines,
  rowSummary,
  startedAtIso,
  toDraft,
  withDiscipline,
  withProgram,
  withRegulation,
  withType,
} from './model';

const NOW = new Date(2026, 9, 7, 18, 45);

describe('the Enter Series form', () => {
  it('U5 the discipline options exclude hits disciplines', () => {
    const spsf = ringDisciplines('spsf').map((d) => d.id);
    expect(spsf).toContain('spsf-precision');
    expect(spsf).not.toContain('spsf-falt');
    expect(ringDisciplines('spsf').every((d) => d.scoring === 'rings')).toBe(true);
  });

  it('starts on now, in the first regulation, a training session with one free row', () => {
    const form = initialForm(NOW);
    expect(form).toMatchObject({
      type: 'training',
      regulationId: 'spsf',
      disciplineId: 'spsf-precision',
      date: '2026-10-07',
      time: '18:45',
      programId: null,
      name: '',
      location: '',
      competitionLevel: 'forening',
      isChampionship: false,
      competitionName: '',
      weaponGroup: null,
      shooterClass: null,
      eventId: null,
      firearmId: null,
      ammoLotId: null,
      decimalScoring: false,
      seriesLengthText: '5',
    });
    expect(form.rows.map((r) => [r.text, r.isSighter])).toEqual([['', false]]);
    expect(ringDisciplines(form.regulationId).map((d) => d.id)).toContain(form.disciplineId);
  });

  it('U6 Enter in the last free-format row adds a row; in a fixed-format skeleton it does not', () => {
    const free = initialForm(NOW);
    const entered = onRowEnter(free, 0);
    expect(entered.form.rows).toHaveLength(2);
    expect(entered.focus).toBe(1);
    // Not the last row: move on, add nothing.
    const again = onRowEnter(entered.form, 0);
    expect(again.form.rows).toHaveLength(2);
    expect(again.focus).toBe(1);

    const standard = getProgram('issf-standard-pistol')!;
    const fixed = withDiscipline(
      withType(initialForm(NOW), 'competition'),
      'issf-standard-pistol',
      'issf',
    );
    expect(fixed.programId).toBe(standard.id);
    const skeleton = buildProgramSkeleton(standard);
    expect(fixed.rows.map((r) => r.isSighter)).toEqual(skeleton.map((e) => e.isSighter));
    const last = onRowEnter(fixed, skeleton.length - 1);
    expect(last.form.rows).toHaveLength(skeleton.length);
    expect(last.focus).toBeNull();
    // Add Series still appends an ordinary row past the skeleton.
    expect(addRow(fixed).rows).toHaveLength(skeleton.length + 1);
  });

  it('keeps typed text across a re-layout and drops skeleton sighters in free format', () => {
    let form = withType(initialForm(NOW), 'competition');
    form = withDiscipline(form, 'issf-standard-pistol', 'issf');
    form = { ...form, rows: form.rows.map((r, i) => (i === 1 ? { ...r, text: '10 9' } : r)) };
    const free = withProgram(form, null);
    expect(free.rows[1]!.text).toBe('10 9');
    expect(free.rows.every((r) => !r.isSighter)).toBe(true);
    // Blank rows past the first are not kept in free format.
    expect(free.rows).toHaveLength(2);
    // Typed rows keep their keys, so focus and React state stay with them.
    expect(free.rows.map((r) => r.key)).toEqual(form.rows.slice(0, 2).map((r) => r.key));
  });

  it('free format drops trailing rows holding only spaces, and keeps one blank row', () => {
    const form = {
      ...initialForm(NOW),
      rows: [
        { key: 5, text: ' ', isSighter: false },
        { key: 6, text: '  ', isSighter: false },
      ],
    };
    expect(withProgram(form, null).rows).toEqual([{ key: 5, text: ' ', isSighter: false }]);
  });

  it('allows one sighter row in free format, none to tick in a fixed one', () => {
    const form = addRow(initialForm(NOW));
    expect(canMarkSighter(form, 0)).toBe(true);
    const marked = { ...form, rows: form.rows.map((r, i) => ({ ...r, isSighter: i === 0 })) };
    expect(canMarkSighter(marked, 0)).toBe(true);
    expect(canMarkSighter(marked, 1)).toBe(false);
    const fixed = withDiscipline(withType(form, 'competition'), 'issf-standard-pistol', 'issf');
    expect(canMarkSighter(fixed, 0)).toBe(false);
  });

  it('turns the local date and time into UTC ISO, or null when incomplete', () => {
    expect(startedAtIso('2026-10-07', '18:45')).toBe(new Date(2026, 9, 7, 18, 45).toISOString());
    expect(startedAtIso('', '18:45')).toBeNull();
    expect(startedAtIso('2026-13-45', '18:45')).toBeNull();
    // What Date would otherwise parse: a bare year, seconds, a UTC marker.
    expect(startedAtIso('2026', '18:45')).toBeNull();
    expect(startedAtIso('2026-10-07', '18:45:30')).toBeNull();
    expect(startedAtIso('2026-10-07', '18:45Z')).toBeNull();
    expect(startedAtIso('2026-10-07', '')).toBeNull();
  });

  it('builds the draft the shared builder takes', () => {
    const form = {
      ...initialForm(NOW),
      seriesLengthText: ' 7 ',
      name: ' Evening ',
      rows: [{ key: 1, text: '10 9', isSighter: false }],
    };
    expect(toDraft(form, 'Training — 7 Oct 2026')).toMatchObject({
      type: 'training',
      startedAt: new Date(2026, 9, 7, 18, 45).toISOString(),
      name: ' Evening ',
      defaultName: 'Training — 7 Oct 2026',
      seriesLength: 7,
      series: [{ text: '10 9', isSighter: false }],
    });
    expect(toDraft({ ...form, seriesLengthText: 'x' }, '').seriesLength).toBeNull();
    expect(toDraft({ ...form, seriesLengthText: '0' }, '').seriesLength).toBeNull();
  });

  it('summarizes a row as it is typed', () => {
    expect(rowSummary('10 9 X', 'integer')).toEqual({
      ok: true,
      totalTenths: 290,
      innerTens: 1,
      shots: 3,
    });
    expect(rowSummary('10 a', 'integer')).toMatchObject({ ok: false });
  });

  it('a new regulation or discipline drops the weapon group and lands on its events', () => {
    const spsf = { ...initialForm(NOW), weaponGroup: 'spsf:C' };
    const issf = withRegulation(spsf, 'issf');
    expect(issf.regulationId).toBe('issf');
    expect(issf.weaponGroup).toBeNull();
    expect(ringDisciplines('issf').map((d) => d.id)).toContain(issf.disciplineId);
    expect(issf.eventId).toBe(eventsFor(issf)[0]?.id ?? null);
    expect(eventsFor(issf).length).toBeGreaterThan(0);
    expect(withDiscipline(spsf, 'spsf-milsnabb').weaponGroup).toBeNull();
  });

  it('decimal scoring is offered only where the discipline allows it, and reset by a program', () => {
    const generic = withDiscipline(initialForm(NOW), 'generic-rings');
    expect(decimalShown(generic)).toBe(true);
    const decimal = { ...generic, decimalScoring: true };
    expect(modeOf(decimal)).toBe('decimal');
    expect(toDraft(decimal, '').decimalScoring).toBe(true);
    expect(withProgram(decimal, null).decimalScoring).toBe(false);

    // A choice left over where it is not offered never reaches the draft.
    const precision = { ...initialForm(NOW), decimalScoring: true };
    expect(decimalShown(precision)).toBe(false);
    expect(toDraft(precision, '').decimalScoring).toBe(false);
    expect(modeOf(precision)).toBe('integer');
  });

  it('switching to a fixed format keeps typed rows past its skeleton, as ordinary series', () => {
    const competition = withDiscipline(
      withType(initialForm(NOW), 'competition'),
      'issf-standard-pistol',
      'issf',
    );
    const free = withProgram(competition, null);
    const typed = {
      ...free,
      rows: Array.from({ length: 15 }, (_, i) => ({
        key: 1000 + i,
        text: i === 13 ? '10 9' : i === 1 ? '10' : i === 14 ? '   ' : '',
        isSighter: i === 13,
      })),
    };
    const fixed = withProgram(typed, competition.programId);
    expect(fixed.rows).toHaveLength(14);
    expect(fixed.rows[1]).toMatchObject({ key: 1001, text: '10' });
    expect(fixed.rows[13]).toEqual({ key: 1013, text: '10 9', isSighter: false });
  });

  it('a form with no rows gets one blank row back', () => {
    const empty = { ...initialForm(NOW), rows: [] };
    expect(withProgram(empty, null).rows.map((r) => r.text)).toEqual(['']);
  });

  it('a regulation with no federation discipline lands on the first ring discipline', () => {
    const none = withRegulation(initialForm(NOW), 'none');
    expect(none.disciplineId).toBe(ringDisciplines('none')[0]!.id);
    expect(withRegulation(initialForm(NOW), 'spsf').disciplineId).toBe('spsf-precision');
  });

  it('the draft: no start time when the inputs are incomplete, no series length under a program', () => {
    const form = initialForm(NOW);
    expect(toDraft({ ...form, date: '' }, '').startedAt).toBe('');
    const program = withType(form, 'competition');
    expect(program.programId).not.toBeNull();
    expect(toDraft({ ...program, seriesLengthText: '7' }, '').seriesLength).toBeNull();
    // An id this build does not know lays out nothing.
    expect(isFixed({ programId: 'no-such-program' })).toBe(false);
  });
});
