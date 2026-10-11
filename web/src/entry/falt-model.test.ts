// docs/specs/web-falt-entry-spec.md UF1–UF10.
import type { ShooterProfile } from '@shotledger/shared/src/disciplines';
import { describe, expect, it } from 'vitest';

import {
  addStation,
  canStartShootOff,
  entryDisciplines,
  faltPreview,
  faltSendsTheSame,
  initialFalt,
  isFaltForm,
  nextStationIsShootOff,
  shootOffRows,
  startShootOff,
  toFaltDraft,
  withFigureCount,
  withHits,
  withStation,
  type FaltForm,
} from './falt-model';
import { initialForm, toDraft, withDiscipline, withType } from './model';

const NOW = new Date(2026, 9, 7, 18, 45);
const NO_PROFILE: ShooterProfile = {
  birthYear: null,
  skillClass: null,
  competesInWomensClasses: false,
};

/** A fält form with the given stations (hits/figuresHit and anything else). */
function falt(...stations: Partial<FaltForm['stations'][number]>[]): FaltForm {
  let form = initialFalt();
  stations.forEach((patch, index) => {
    if (index > 0) form = addStation(form);
    form = withStation(form, index, patch);
  });
  return form;
}

describe('the fält page model', () => {
  it('UF1 the discipline picker offers fält beside the ring disciplines; the form still lands on a ring one', () => {
    const spsf = entryDisciplines('spsf').map((d) => d.id);
    expect(spsf).toContain('spsf-falt');
    expect(spsf).toContain('spsf-precision');
    expect(spsf).toContain('generic-rings');
    expect(entryDisciplines('issf').map((d) => d.id)).not.toContain('spsf-falt');

    const form = initialForm(NOW, NO_PROFILE);
    expect(isFaltForm(form)).toBe(false);
    const fält = withDiscipline(form, 'spsf-falt');
    expect(isFaltForm(fält)).toBe(true);
    // Fält has no program, as on the phone, whatever the type.
    expect(withType(fält, 'competition').programId).toBeNull();
  });

  it('UF2 changing Hits or Figures clamps Figures Hit (clampFiguresHit)', () => {
    let form = falt({ hits: 5, figuresHit: 4 });
    form = withHits(form, 0, 2);
    expect(form.stations[0]).toMatchObject({ hits: 2, figuresHit: 2 });
    form = withHits(form, 0, 0);
    expect(form.stations[0]).toMatchObject({ hits: 0, figuresHit: 0 });
    form = withHits(form, 0, 4);
    expect(form.stations[0]).toMatchObject({ hits: 4, figuresHit: 1 });
    form = withStation(form, 0, { figuresHit: 4 });
    form = withFigureCount(form, 0, 3);
    expect(form.stations[0]).toMatchObject({ hits: 4, figuresHit: 3, figureCount: 3 });
    form = withFigureCount(form, 0, null);
    expect(form.stations[0]).toMatchObject({ figuresHit: 3, figureCount: null });

    // Only the station edited changes.
    const two = withHits(falt({ hits: 6, figuresHit: 6 }, { hits: 6, figuresHit: 6 }), 1, 1);
    expect(two.stations.map((s) => [s.hits, s.figuresHit])).toEqual([
      [6, 6],
      [1, 1],
    ]);
    const counted = withFigureCount(
      falt({ hits: 6, figuresHit: 6 }, { hits: 6, figuresHit: 6 }),
      1,
      2,
    );
    expect(counted.stations.map((s) => [s.figuresHit, s.figureCount])).toEqual([
      [6, null],
      [2, 2],
    ]);
  });

  it('UF3 toFaltDraft carries the session fields as toDraft does, with the stations and the mode', () => {
    const form = {
      ...withDiscipline(withType(initialForm(NOW, NO_PROFILE), 'competition'), 'spsf-falt'),
      name: 'Fält-KM',
      location: 'Range',
      firearmId: 'f1',
      shooterClass: '2',
    };
    const stations = withStation(
      falt({ hits: 6, figuresHit: 3, pointsText: '12', pointsMaxText: '20', isScratched: true }),
      0,
      { isShootOff: true, figureCount: 4 },
    );
    const draft = toFaltDraft(
      form,
      { ...stations, resultMode: 'poangfalt' },
      'Competition — 7 Oct',
    );
    const {
      programId: _programId,
      decimalScoring: _decimalScoring,
      seriesLength: _seriesLength,
      series: _series,
      ...session
    } = toDraft(form, 'Competition — 7 Oct');
    expect(draft).toEqual({
      ...session,
      faltResultMode: 'poangfalt',
      stations: [
        {
          hits: 6,
          figuresHit: 3,
          figureCount: 4,
          pointsText: '12',
          pointsMaxText: '20',
          isScratched: true,
          isShootOff: true,
        },
      ],
    });
    expect(draft).toMatchObject({
      disciplineId: 'spsf-falt',
      type: 'competition',
      name: 'Fält-KM',
    });
    expect('series' in draft).toBe(false);
    expect('programId' in draft).toBe(false);
  });

  it('UF4 Add Station keeps a held request; any other station or mode edit drops it', () => {
    const form = falt({ hits: 6, figuresHit: 3 });
    expect(faltSendsTheSame(form, form)).toBe(true);
    expect(faltSendsTheSame(form, addStation(form))).toBe(true);
    expect(faltSendsTheSame(form, addStation(addStation(form)))).toBe(true);

    expect(faltSendsTheSame(form, withHits(form, 0, 5))).toBe(false);
    expect(faltSendsTheSame(form, withStation(form, 0, { figuresHit: 2 }))).toBe(false);
    expect(faltSendsTheSame(form, withFigureCount(form, 0, 4))).toBe(false);
    expect(faltSendsTheSame(form, withStation(form, 0, { pointsText: '1' }))).toBe(false);
    expect(faltSendsTheSame(form, withStation(form, 0, { pointsMaxText: '1' }))).toBe(false);
    expect(faltSendsTheSame(form, withStation(form, 0, { isScratched: true }))).toBe(false);
    expect(faltSendsTheSame(form, withStation(form, 0, { isShootOff: true }))).toBe(false);
    expect(faltSendsTheSame(form, { ...form, resultMode: 'poangfalt' })).toBe(false);
    // An appended station that is not blank would be saved.
    expect(faltSendsTheSame(form, withHits(addStation(form), 1, 1))).toBe(false);
    expect(faltSendsTheSame(form, withHits(startShootOff(form), 1, 1))).toBe(false);
    expect(faltSendsTheSame(form, withStation(startShootOff(form), 1, { isScratched: true }))).toBe(
      false,
    );
    // A started shoot-off with nothing in it is blank, so it sends the same.
    expect(faltSendsTheSame(form, startShootOff(form))).toBe(true);
    expect(faltSendsTheSame(form, withStation(addStation(form), 1, { pointsText: '1' }))).toBe(
      false,
    );
    expect(faltSendsTheSame(form, withStation(addStation(form), 1, { pointsMaxText: 'x' }))).toBe(
      false,
    );
    // An edit to any station counts, not only the first.
    const two = addStation(form);
    expect(faltSendsTheSame(two, withHits(two, 1, 2))).toBe(false);
    // Removing a station is never the same.
    expect(faltSendsTheSame(addStation(form), form)).toBe(false);
  });

  it('UF5 the running result counts only the stations that will be saved', () => {
    const form = falt(
      { hits: 6, figuresHit: 3, figureCount: 3 },
      {},
      { hits: 4, figuresHit: 2, figureCount: 2, pointsText: '8', pointsMaxText: '10' },
      { hits: 5, figuresHit: 2, pointsText: 'x' },
      { hits: 6, figuresHit: 6, isScratched: true },
      { hits: 6, figuresHit: 9 },
    );
    const preview = faltPreview(form);
    expect(preview.rows).toEqual(['saved', 'blank', 'saved', 'invalid', 'saved', 'invalid']);
    expect(preview.result).toMatchObject({
      stationCount: 2,
      hits: 10,
      figuresHit: 5,
      poangfaltPoints: 15,
      ringedFigurePoints: 8,
      pointsMax: 10,
      figureCount: 5,
      hitsPossible: 12,
    });
    expect(faltPreview(initialFalt())).toMatchObject({
      rows: ['blank'],
      result: { stationCount: 0, hits: 0, hitsPossible: 0 },
    });
  });

  it('UF6 a fresh fält form: one blank station, Field', () => {
    const form = initialFalt();
    expect(form.resultMode).toBe('falt');
    expect(form.stations).toHaveLength(1);
    expect(form.stations[0]).toMatchObject({
      hits: 0,
      figuresHit: 0,
      figureCount: null,
      pointsText: '',
      pointsMaxText: '',
      isScratched: false,
      isShootOff: false,
    });
    // Every row keeps its own React key.
    const keys = addStation(addStation(form)).stations.map((s) => s.key);
    expect(new Set(keys).size).toBe(3);
    expect(initialFalt().stations[0]!.key).not.toBe(form.stations[0]!.key);
  });

  it('UF7 Start Shoot-off: every station after a saved shoot-off is one, as on the phone', () => {
    const form = falt({ hits: 6, figuresHit: 3, figureCount: 3 });
    expect(nextStationIsShootOff(form)).toBe(false);
    expect(canStartShootOff(form)).toBe(true);
    expect(addStation(form).stations[1]!.isShootOff).toBe(false);
    expect(canStartShootOff({ ...form, stations: [] })).toBe(false);
    expect(nextStationIsShootOff({ ...form, stations: [] })).toBe(false);
    expect(addStation({ ...form, stations: [] }).stations[0]!.isShootOff).toBe(false);
    // The last station decides, not the second.
    const lone = withStation(form, 0, { isShootOff: true });
    expect(nextStationIsShootOff(lone)).toBe(true);

    const shootOff = withHits(startShootOff(form), 1, 4);
    expect(shootOff.stations.map((s) => s.isShootOff)).toEqual([false, true]);
    expect(nextStationIsShootOff(shootOff)).toBe(true);
    expect(canStartShootOff(shootOff)).toBe(false);
    expect(addStation(shootOff).stations.map((s) => s.isShootOff)).toEqual([false, true, true]);
  });

  it('UF9 only a station that will be saved counts: blank rows are the phone backed out of', () => {
    // A fresh form has no station yet, as the phone has none before its first Save.
    expect(canStartShootOff(initialFalt())).toBe(false);
    expect(canStartShootOff(addStation(falt({ hits: 6, figuresHit: 3 })))).toBe(true);

    // A started shoot-off left blank is not saved, so the next station is ordinary.
    const left = startShootOff(falt({ hits: 6, figuresHit: 3, figureCount: 3 }));
    expect(canStartShootOff(left)).toBe(false);
    expect(nextStationIsShootOff(left)).toBe(false);
    // The last row decides whether the button shows, not the second.
    expect(canStartShootOff(addStation(left))).toBe(true);
    const after = withHits(addStation(left), 2, 5);
    expect(after.stations.map((s) => s.isShootOff)).toEqual([false, true, false]);
    const session = withDiscipline(initialForm(NOW, NO_PROFILE), 'spsf-falt');
    expect(toFaltDraft(session, after, 'x').stations.map((s) => s.isShootOff)).toEqual([
      false,
      false,
      false,
    ]);
    expect(faltPreview(after).rows).toEqual(['saved', 'blank', 'saved']);

    // A trailing blank row becomes the shoot-off instead of a second blank row.
    const blankTail = addStation(falt({ hits: 6, figuresHit: 3, figureCount: 3 }));
    const started = startShootOff(blankTail);
    expect(started.stations).toHaveLength(2);
    expect(started.stations[1]).toMatchObject({
      key: blankTail.stations[1]!.key,
      isShootOff: true,
    });
    const threeTail = addStation(withHits(blankTail, 1, 2));
    expect(startShootOff(threeTail).stations.map((s) => s.isShootOff)).toEqual([
      false,
      false,
      true,
    ]);
    expect(startShootOff({ ...blankTail, stations: [] }).stations).toMatchObject([
      { isShootOff: true },
    ]);
  });

  it('UF8 a shoot-off station is saved with its numbers, and dropped when left empty', () => {
    const form = withHits(startShootOff(falt({ hits: 6, figuresHit: 3, figureCount: 3 })), 1, 4);
    const left = startShootOff(falt({ hits: 6, figuresHit: 3, figureCount: 3 }));
    expect(faltPreview(form).rows).toEqual(['saved', 'saved']);
    expect(faltPreview(left).rows).toEqual(['saved', 'blank']);
    // The shoot-off counts toward no result, as on the phone.
    expect(faltPreview(form).result).toMatchObject({ stationCount: 1, hits: 6 });

    const session = withDiscipline(initialForm(NOW, NO_PROFILE), 'spsf-falt');
    expect(toFaltDraft(session, form, 'x').stations.map((s) => s.isShootOff)).toEqual([
      false,
      true,
    ]);
    expect(toFaltDraft(session, left, 'x').stations[1]).toMatchObject({
      hits: 0,
      isShootOff: false,
    });
  });

  it('UF10 no ordinary station after a saved shoot-off, whatever order the rows are filled in', () => {
    const session = withDiscipline(initialForm(NOW, NO_PROFILE), 'spsf-falt');
    // Shoot-off left blank, an ordinary station after it, then the shoot-off filled.
    const left = startShootOff(falt({ hits: 6, figuresHit: 3, figureCount: 3 }));
    const outOfOrder = withHits(withHits(addStation(left), 2, 5), 1, 4);
    expect(shootOffRows(outOfOrder).map((s) => s.isShootOff)).toEqual([false, true, true]);
    expect(toFaltDraft(session, outOfOrder, 'x').stations.map((s) => s.isShootOff)).toEqual([
      false,
      true,
      true,
    ]);
    expect(faltPreview(outOfOrder).result).toMatchObject({ stationCount: 1, hits: 6 });
    expect(nextStationIsShootOff(outOfOrder)).toBe(true);
    // The rule changing a row's flag is an edit that drops a held request.
    expect(faltSendsTheSame(withHits(addStation(left), 2, 5), outOfOrder)).toBe(false);

    // Blank is what Save drops: a max without points, or a space, is nothing entered.
    const maxOnly = falt({ pointsMaxText: '10' });
    expect(faltPreview(maxOnly).rows).toEqual(['blank']);
    expect(canStartShootOff(maxOnly)).toBe(false);
    const spaced = withStation(left, 1, { pointsText: ' ' });
    expect(faltPreview(spaced).rows).toEqual(['saved', 'blank']);
    expect(toFaltDraft(session, spaced, 'x').stations[1]).toMatchObject({ isShootOff: false });
    // Points that do not parse are not blank: the row is refused, not dropped.
    expect(faltPreview(falt({ pointsText: 'x' })).rows).toEqual(['invalid']);
  });
});
