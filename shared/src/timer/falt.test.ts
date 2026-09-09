import { describe, expect, it } from 'vitest';

import {
  ALLA_KLARA_AT_SECONDS,
  buildFaltProgram,
  DEFAULT_FALT_SETTINGS,
  ELD_UPPHOR_LEAD_SECONDS,
  ELD_UPPHOR_SPEECH_RATE,
  faltCommandText,
  faltPartiIntervals,
  FALT_COMMAND_TEXT,
  FaltTimerEngine,
  normalizeFaltSettings,
  type FaltCue,
  type FaltCueKind,
  type FaltTimerSettings,
} from './falt';

const rangeOfficer: FaltTimerSettings = {
  mode: 'rangeOfficer',
  laddaSeconds: 30,
  shootingSeconds: 8,
  partiSeconds: [],
  whistle: false,
  vibration: true,
};

const solo: FaltTimerSettings = { ...rangeOfficer, mode: 'solo' };

function numbered(cues: readonly FaltCue[]): [number | null, FaltCueKind, number | null][] {
  return cues.map((cue) => [cue.number, cue.kind, cue.atSeconds]);
}

describe('normalizeFaltSettings', () => {
  it('sorts partier and zeroes the LADDA gap in range-officer mode', () => {
    const normalized = normalizeFaltSettings({ ...rangeOfficer, partiSeconds: [5, 2] });
    expect(normalized.partiSeconds).toEqual([2, 5]);
    expect(normalized.laddaSeconds).toBe(0);
  });

  it('keeps the LADDA gap in solo mode', () => {
    expect(normalizeFaltSettings(solo).laddaSeconds).toBe(30);
  });

  it.each([2, 301, 8.5, Number.NaN])('rejects shootingSeconds %s', (shootingSeconds) => {
    expect(() => normalizeFaltSettings({ ...solo, shootingSeconds })).toThrow(/shootingSeconds/);
  });

  it.each([4, 91, 30.5])('rejects laddaSeconds %s in solo mode', (laddaSeconds) => {
    expect(() => normalizeFaltSettings({ ...solo, laddaSeconds })).toThrow(/laddaSeconds/);
  });

  it('ignores an out-of-range LADDA gap in range-officer mode', () => {
    expect(normalizeFaltSettings({ ...rangeOfficer, laddaSeconds: 0 }).laddaSeconds).toBe(0);
  });

  it.each([0, 8, 9, 2.5])('rejects a parti at %s s of an 8 s shooting time', (second) => {
    expect(() => normalizeFaltSettings({ ...solo, partiSeconds: [second] })).toThrow(
      /partiSeconds must be whole seconds/,
    );
  });

  it('rejects duplicate partier', () => {
    expect(() => normalizeFaltSettings({ ...solo, partiSeconds: [3, 3] })).toThrow(/unique/);
  });
});

describe('buildFaltProgram — the timeline is anchored at ELD', () => {
  it('puts ELD at t = 0', () => {
    const eld = buildFaltProgram(solo).commands.find((cue) => cue.kind === 'eld');
    expect(eld?.atSeconds).toBe(0);
  });

  it('gives TIO SEKUNDER KVAR exactly 10 s before ELD', () => {
    const ten = buildFaltProgram(solo).commands.find((cue) => cue.kind === 'tenSeconds');
    expect(ten?.atSeconds).toBe(-10);
  });

  it('leaves ~5 s between ALLA KLARA and TIO SEKUNDER KVAR', () => {
    const commands = buildFaltProgram(solo).commands;
    const allaKlara = commands.find((cue) => cue.kind === 'allaKlara')!;
    const ten = commands.find((cue) => cue.kind === 'tenSeconds')!;
    expect(allaKlara.atSeconds).toBe(ALLA_KLARA_AT_SECONDS);
    expect(allaKlara.atSeconds).toBe(-15);
    expect(ten.atSeconds! - allaKlara.atSeconds!).toBe(5);
  });

  it('starts ELD UPPHÖR at T−3 so the drawn-out call ends exactly at T', () => {
    const program = buildFaltProgram({ ...solo, shootingSeconds: 8 });
    const eldUpphor = program.commands.find((cue) => cue.kind === 'eldUpphor')!;
    expect(eldUpphor.atSeconds).toBe(5);
    expect(eldUpphor.durationSeconds).toBe(ELD_UPPHOR_LEAD_SECONDS);
    expect(eldUpphor.atSeconds! + eldUpphor.durationSeconds).toBe(8);
  });

  it('marks the end of the shooting time with an unnumbered timeUp cue', () => {
    const timeUp = buildFaltProgram(solo).cues.find((cue) => cue.kind === 'timeUp')!;
    expect(timeUp.atSeconds).toBe(8);
    expect(timeUp.number).toBeNull();
    expect(timeUp.speech).toBeUndefined();
  });

  it('clamps ELD UPPHÖR to ELD for the shortest allowed shooting time', () => {
    const program = buildFaltProgram({ ...solo, shootingSeconds: 3 });
    const eldUpphor = program.commands.find((cue) => cue.kind === 'eldUpphor')!;
    expect(eldUpphor.atSeconds).toBe(0);
  });

  it('puts FÄRDIGA 3 s before ELD, PATRON UR 3 s after T and VISITATION 4 s later', () => {
    const program = buildFaltProgram(solo);
    const at = (kind: FaltCueKind) => program.commands.find((cue) => cue.kind === kind)?.atSeconds;
    expect(at('fardiga')).toBe(-3);
    expect(at('patronUr')).toBe(11);
    expect(at('visitation')).toBe(15);
    expect(program.endSeconds).toBe(15);
  });
});

describe('buildFaltProgram — solo mode', () => {
  it('numbers the whole sequence and runs it off the clock', () => {
    const program = buildFaltProgram(solo);
    expect(numbered(program.commands)).toEqual([
      [1, 'ladda', -45],
      [2, 'allaKlara', -15],
      [3, 'tenSeconds', -10],
      [4, 'fardiga', -3],
      [5, 'eld', 0],
      [6, 'eldUpphor', 5],
      [7, 'patronUr', 11],
      [8, 'visitation', 15],
    ]);
    expect(program.manualCues).toEqual([]);
    expect(program.startSeconds).toBe(-45);
  });

  it('honours the LADDA → ALLA KLARA setting, which only this mode has', () => {
    const program = buildFaltProgram({ ...solo, laddaSeconds: 10 });
    expect(program.commands[0]).toMatchObject({ kind: 'ladda', atSeconds: -25 });
    expect(program.startSeconds).toBe(-25);
  });
});

describe('buildFaltProgram — range-officer mode', () => {
  it('leaves LADDA and ALLA KLARA untimed and starts the clock at −10', () => {
    const program = buildFaltProgram(rangeOfficer);
    expect(numbered(program.commands)).toEqual([
      [1, 'ladda', null],
      [2, 'allaKlara', null],
      [3, 'tenSeconds', -10],
      [4, 'fardiga', -3],
      [5, 'eld', 0],
      [6, 'eldUpphor', 5],
      [7, 'patronUr', 11],
      [8, 'visitation', 15],
    ]);
    expect(program.manualCues.map((cue) => cue.kind)).toEqual(['ladda', 'allaKlara']);
    expect(program.startSeconds).toBe(-10);
    expect(program.cues.some((cue) => cue.atSeconds === null)).toBe(false);
  });
});

describe('buildFaltProgram — partier, speech and vibration', () => {
  it('numbers partier in place, at their second of the shooting time', () => {
    const program = buildFaltProgram({ ...solo, shootingSeconds: 12, partiSeconds: [8, 3] });
    expect(
      program.commands
        .filter((cue) => cue.kind === 'parti')
        .map((cue) => [cue.number, cue.partiNumber, cue.atSeconds]),
    ).toEqual([
      [6, 1, 3],
      [7, 2, 8],
    ]);
    // Numbering stays chronological around them.
    expect(program.commands.map((cue) => cue.kind)).toEqual([
      'ladda',
      'allaKlara',
      'tenSeconds',
      'fardiga',
      'eld',
      'parti',
      'parti',
      'eldUpphor',
      'patronUr',
      'visitation',
    ]);
  });

  it('keeps a parti that lands exactly on T−3 ahead of ELD UPPHÖR', () => {
    const program = buildFaltProgram({ ...solo, shootingSeconds: 8, partiSeconds: [5] });
    expect(program.commands.slice(5).map((cue) => [cue.number, cue.kind])).toEqual([
      [6, 'parti'],
      [7, 'eldUpphor'],
      [8, 'patronUr'],
      [9, 'visitation'],
    ]);
  });

  it('speaks the SPSF command wording, with the drawn-out rate on ELD UPPHÖR', () => {
    const byKind = new Map(buildFaltProgram(solo).commands.map((cue) => [cue.kind, cue]));
    expect(byKind.get('patronUr')?.speech).toBe(FALT_COMMAND_TEXT.patronUr);
    expect(byKind.get('eld')?.speech).toBe('Eld!');
    expect(byKind.get('eldUpphor')?.speechRate).toBe(ELD_UPPHOR_SPEECH_RATE);
  });

  it('drops the words from ELD UPPHÖR in whistle mode, keeping its time', () => {
    const cue = buildFaltProgram({ ...solo, whistle: true }).commands.find(
      (c) => c.kind === 'eldUpphor',
    );
    expect(cue).toMatchObject({ atSeconds: 5, speech: undefined, speechRate: undefined });
  });

  it('vibrates at ELD, at every parti and when the time is up — and nowhere else', () => {
    const program = buildFaltProgram({ ...solo, shootingSeconds: 12, partiSeconds: [4, 8] });
    expect(program.cues.filter((cue) => cue.vibrate).map((cue) => cue.kind)).toEqual([
      'eld',
      'parti',
      'parti',
      'timeUp',
    ]);
  });

  it('vibrates nowhere when the setting is off', () => {
    const program = buildFaltProgram({ ...solo, partiSeconds: [4], vibration: false });
    expect(program.cues.some((cue) => cue.vibrate)).toBe(false);
  });

  it('defaults to range-officer mode, an 8 s shooting time and vibration on', () => {
    expect(DEFAULT_FALT_SETTINGS).toMatchObject({
      mode: 'rangeOfficer',
      shootingSeconds: 8,
      vibration: true,
    });
    expect(buildFaltProgram(DEFAULT_FALT_SETTINGS).startSeconds).toBe(-10);
  });
});

describe('faltCommandText', () => {
  it('is the Swedish command wording, whatever the app language', () => {
    expect(faltCommandText({ kind: 'tenSeconds' })).toBe('Tio sekunder kvar!');
    expect(faltCommandText({ kind: 'patronUr' })).toBe('Patron ur! Proppa vapen!');
  });

  it('numbers the partier', () => {
    expect(faltCommandText({ kind: 'parti', partiNumber: 2 })).toBe('Parti 2');
  });

  it('shows the ELD UPPHÖR wording for the timeUp marker, which is its tail', () => {
    expect(faltCommandText({ kind: 'timeUp' })).toBe('Eld upphör!');
  });
});

describe('faltPartiIntervals', () => {
  it('is the whole shooting time with no partier', () => {
    expect(faltPartiIntervals(solo)).toEqual([8]);
  });

  it('is the gaps between consecutive boundaries', () => {
    expect(faltPartiIntervals({ ...solo, shootingSeconds: 20, partiSeconds: [12, 5] })).toEqual([
      5, 7, 8,
    ]);
  });
});

describe('FaltTimerEngine — solo mode', () => {
  it('emits LADDA at the start of the clock and nothing else', () => {
    const engine = new FaltTimerEngine(solo);
    expect(engine.start().map((c) => c.kind)).toEqual(['ladda']);
    expect(engine.getAtMs()).toBe(-45_000);
    expect(engine.isRunning()).toBe(true);
    expect(engine.isAwaitingPress()).toBe(false);
  });

  it('crosses every cue in order across one big step', () => {
    const engine = new FaltTimerEngine(solo);
    engine.start();
    expect(engine.advance(120_000).map((c) => c.kind)).toEqual([
      'allaKlara',
      'tenSeconds',
      'fardiga',
      'eld',
      'eldUpphor',
      'timeUp',
      'patronUr',
      'visitation',
    ]);
    expect(engine.getAtMs()).toBe(15_000);
    expect(engine.getPhase().kind).toBe('done');
  });

  it('emits each cue exactly once when ticked at 100 ms', () => {
    const engine = new FaltTimerEngine(solo);
    const seen = [...engine.start().map((c) => c.kind)];
    for (let i = 0; i < 700; i += 1) seen.push(...engine.advance(100).map((c) => c.kind));
    expect(seen).toEqual([
      'ladda',
      'allaKlara',
      'tenSeconds',
      'fardiga',
      'eld',
      'eldUpphor',
      'timeUp',
      'patronUr',
      'visitation',
    ]);
  });

  it('walks prep → countdown → shooting → clearing → done', () => {
    const engine = new FaltTimerEngine(solo);
    engine.start();
    expect(engine.getPhase()).toMatchObject({ kind: 'prep', toEldMs: 45_000 });
    engine.advance(30_000);
    expect(engine.getPhase()).toMatchObject({ kind: 'countdown', atMs: -15_000, toEldMs: 15_000 });
    engine.advance(5_000);
    // The maintainer's anchor: at "tio sekunder kvar" there are 10 s left.
    expect(engine.getPhase().toEldMs).toBe(10_000);
    engine.advance(12_000);
    expect(engine.getPhase()).toMatchObject({
      kind: 'shooting',
      atMs: 2_000,
      shootingRemainingMs: 6_000,
    });
    engine.advance(6_000);
    expect(engine.getPhase()).toMatchObject({ kind: 'clearing', shootingRemainingMs: 0 });
    engine.advance(7_000);
    expect(engine.getPhase().kind).toBe('done');
  });

  it('fires parti cues at their second inside the shooting time', () => {
    const engine = new FaltTimerEngine({ ...solo, shootingSeconds: 10, partiSeconds: [4, 7] });
    engine.start();
    engine.advance(45_000); // ELD
    expect(engine.advance(3_999).map((c) => c.kind)).toEqual([]);
    expect(engine.advance(1).map((c) => [c.kind, c.partiNumber])).toEqual([['parti', 1]]);
    expect(engine.getPhase().partierPassed).toBe(1);
    // The second parti and the start of the drawn-out ELD UPPHÖR coincide at 7 s of a 10 s series.
    expect(engine.advance(3_000).map((c) => [c.kind, c.partiNumber])).toEqual([
      ['parti', 2],
      ['eldUpphor', undefined],
    ]);
    expect(engine.getPhase().partierPassed).toBe(2);
  });

  it('ignores advanceManual() — there is nothing to press', () => {
    const engine = new FaltTimerEngine(solo);
    engine.start();
    expect(engine.advanceManual()).toEqual([]);
  });
});

describe('FaltTimerEngine — range-officer mode', () => {
  it('gives LADDA, then ALLA KLARA on a press, then runs from −10 on the next', () => {
    const engine = new FaltTimerEngine(rangeOfficer);

    expect(engine.start().map((c) => c.kind)).toEqual(['ladda']);
    expect(engine.getPhase().kind).toBe('ladda');
    expect(engine.isRunning()).toBe(false);
    expect(engine.isAwaitingPress()).toBe(true);
    // Nothing between LADDA and the automatic run is on a clock.
    expect(engine.advance(60_000)).toEqual([]);
    expect(engine.getAtMs()).toBe(-10_000);

    expect(engine.advanceManual().map((c) => c.kind)).toEqual(['allaKlara']);
    expect(engine.getPhase().kind).toBe('allaKlara');
    expect(engine.advance(60_000)).toEqual([]);

    expect(engine.advanceManual().map((c) => c.kind)).toEqual(['tenSeconds']);
    expect(engine.isRunning()).toBe(true);
    expect(engine.isAwaitingPress()).toBe(false);
    expect(engine.getPhase()).toMatchObject({ kind: 'countdown', toEldMs: 10_000 });
  });

  it('runs automatically from the second press to the end', () => {
    const engine = new FaltTimerEngine(rangeOfficer);
    engine.start();
    engine.advanceManual();
    engine.advanceManual();
    expect(engine.advance(60_000).map((c) => c.kind)).toEqual([
      'fardiga',
      'eld',
      'eldUpphor',
      'timeUp',
      'patronUr',
      'visitation',
    ]);
  });

  it('ignores further presses once the clock runs', () => {
    const engine = new FaltTimerEngine(rangeOfficer);
    engine.start();
    engine.advanceManual();
    engine.advanceManual();
    expect(engine.advanceManual()).toEqual([]);
  });

  it('ignores a press before start()', () => {
    const engine = new FaltTimerEngine(rangeOfficer);
    expect(engine.advanceManual()).toEqual([]);
    expect(engine.getPhase().kind).toBe('idle');
  });
});

describe('FaltTimerEngine — lifecycle', () => {
  it('refuses a second start()', () => {
    const engine = new FaltTimerEngine(solo);
    engine.start();
    expect(() => engine.start()).toThrow(/twice/);
  });

  it.each([-1, Number.NaN])('rejects advance(%s)', (delta) => {
    const engine = new FaltTimerEngine(solo);
    engine.start();
    expect(() => engine.advance(delta)).toThrow(/deltaMs >= 0/);
  });

  it('does not advance before start()', () => {
    const engine = new FaltTimerEngine(solo);
    expect(engine.advance(60_000)).toEqual([]);
    expect(engine.getAtMs()).toBe(-45_000);
    expect(engine.getPhase().kind).toBe('idle');
  });

  it('holds the clock while paused and carries on after resume', () => {
    const engine = new FaltTimerEngine(solo);
    engine.start();
    engine.advance(5_000);
    engine.pause();
    expect(engine.isRunning()).toBe(false);
    expect(engine.advance(30_000)).toEqual([]);
    expect(engine.getAtMs()).toBe(-40_000);
    engine.resume();
    expect(engine.isRunning()).toBe(true);
    expect(engine.advance(25_000).map((c) => c.kind)).toEqual(['allaKlara']);
  });

  it('a pause in range-officer mode is not mistaken for waiting on a press', () => {
    const engine = new FaltTimerEngine(rangeOfficer);
    engine.start();
    engine.advanceManual();
    engine.advanceManual();
    engine.advance(5_000);
    engine.pause();
    expect(engine.isAwaitingPress()).toBe(false);
    expect(engine.getPhase().kind).toBe('countdown');
    engine.resume();
    expect(engine.isRunning()).toBe(true);
  });

  it('pause() before start() leaves the engine idle', () => {
    const engine = new FaltTimerEngine(solo);
    engine.pause();
    expect(engine.isRunning()).toBe(false);
    expect(engine.getPhase().kind).toBe('idle');
    expect(engine.start().map((c) => c.kind)).toEqual(['ladda']);
  });

  it('resume() does nothing while the sequence still waits for a press', () => {
    const engine = new FaltTimerEngine(rangeOfficer);
    engine.start();
    engine.resume();
    expect(engine.isRunning()).toBe(false);
    expect(engine.advance(60_000)).toEqual([]);
  });

  it('stops the clock at the end of the program', () => {
    const engine = new FaltTimerEngine(solo);
    engine.start();
    engine.advance(600_000);
    expect(engine.getAtMs()).toBe(15_000);
    expect(engine.getPhase().kind).toBe('done');
    engine.resume();
    expect(engine.advance(1_000)).toEqual([]);
  });

  it('reset() returns to idle and lets the sequence be run again', () => {
    const engine = new FaltTimerEngine(rangeOfficer);
    engine.start();
    engine.advanceManual();
    engine.advanceManual();
    engine.advance(20_000);
    engine.reset();
    expect(engine.getPhase()).toMatchObject({ kind: 'idle', atMs: -10_000, partierPassed: 0 });
    expect(engine.start().map((c) => c.kind)).toEqual(['ladda']);
    expect(engine.advanceManual().map((c) => c.kind)).toEqual(['allaKlara']);
  });

  it('exposes the program it was built from', () => {
    const engine = new FaltTimerEngine(rangeOfficer);
    expect(engine.getProgram().settings.shootingSeconds).toBe(8);
  });

  it('defaults to the default settings', () => {
    expect(new FaltTimerEngine().getProgram().startSeconds).toBe(-10);
  });
});
