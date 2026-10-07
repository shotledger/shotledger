import { buildProgramSkeleton, getProgram } from '@shotledger/shared/src/disciplines';
import { describe, expect, it } from 'vitest';

import {
  addRow,
  canMarkSighter,
  initialForm,
  onRowEnter,
  ringDisciplines,
  rowSummary,
  startedAtIso,
  toDraft,
  withDiscipline,
  withProgram,
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
      date: '2026-10-07',
      time: '18:45',
      programId: null,
      shooterClass: null,
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
});
