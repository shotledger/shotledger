import { describe, expect, it } from 'vitest';

import {
  buildFaltPlan,
  DEFAULT_FALT_SETTINGS,
  ELD_UPPHOR_SPEECH_RATE,
  faltEventIntervals,
  FALT_COMMAND_TEXT,
  FaltTimerEngine,
  normalizeFaltSettings,
  type FaltCue,
  type FaltCueKind,
  type FaltTimerSettings,
} from './falt';

const competition: FaltTimerSettings = {
  mode: 'competition',
  prepSeconds: 30,
  shootingSeconds: 8,
  eventSeconds: [],
  whistle: false,
};

const training: FaltTimerSettings = { ...competition, mode: 'training' };

function kindsWithTimes(cues: readonly FaltCue[]): [FaltCueKind, number][] {
  return cues.map((cue) => [cue.kind, cue.atMs]);
}

describe('normalizeFaltSettings', () => {
  it('sorts events and zeroes the prep time in training mode', () => {
    const normalized = normalizeFaltSettings({ ...training, eventSeconds: [5, 2] });
    expect(normalized.eventSeconds).toEqual([2, 5]);
    expect(normalized.prepSeconds).toBe(0);
  });

  it('keeps the prep time in competition mode', () => {
    expect(normalizeFaltSettings(competition).prepSeconds).toBe(30);
  });

  it.each([2, 301, 8.5, Number.NaN])('rejects shootingSeconds %s', (shootingSeconds) => {
    expect(() => normalizeFaltSettings({ ...competition, shootingSeconds })).toThrow(
      /shootingSeconds/,
    );
  });

  it.each([9, 91, 30.5])('rejects prepSeconds %s in competition mode', (prepSeconds) => {
    expect(() => normalizeFaltSettings({ ...competition, prepSeconds })).toThrow(/prepSeconds/);
  });

  it('ignores an out-of-range prep time in training mode', () => {
    expect(normalizeFaltSettings({ ...training, prepSeconds: 0 }).prepSeconds).toBe(0);
  });

  it.each([0, 8, 9, 2.5])('rejects an event at %s s of an 8 s shooting time', (second) => {
    expect(() => normalizeFaltSettings({ ...competition, eventSeconds: [second] })).toThrow(
      /eventSeconds must be whole seconds/,
    );
  });

  it('rejects duplicate events', () => {
    expect(() => normalizeFaltSettings({ ...competition, eventSeconds: [3, 3] })).toThrow(/unique/);
  });
});

describe('buildFaltPlan', () => {
  it('orders the competition sequence with the SHB timings', () => {
    const plan = buildFaltPlan(competition);
    expect(plan.readyStartMs).toBe(30_000);
    expect(plan.eldAtMs).toBe(40_000);
    expect(plan.shootingEndMs).toBe(48_000);
    expect(plan.totalMs).toBe(55_000);
    expect(kindsWithTimes(plan.cues)).toEqual([
      ['ladda', 0],
      ['allaKlara', 30_000],
      ['tenSeconds', 30_000],
      ['fardiga', 37_000],
      ['eld', 40_000],
      ['eldUpphor', 45_000],
      ['ceaseFire', 48_000],
      ['patronUr', 51_000],
      ['visitation', 55_000],
    ]);
  });

  it('skips LADDA and the preparation countdown in training mode', () => {
    const plan = buildFaltPlan(training);
    expect(plan.cues.map((cue) => cue.kind)).not.toContain('ladda');
    expect(plan.readyStartMs).toBe(0);
    expect(plan.eldAtMs).toBe(10_000);
    expect(plan.cues[0]).toMatchObject({ kind: 'allaKlara', atMs: 0 });
  });

  it('honours a user-set preparation time', () => {
    const plan = buildFaltPlan({ ...competition, prepSeconds: 60 });
    expect(plan.readyStartMs).toBe(60_000);
    expect(plan.eldAtMs).toBe(70_000);
  });

  it('speaks the SPSF command wording, with the drawn-out rate on ELD UPPHÖR', () => {
    const plan = buildFaltPlan(competition);
    const byKind = new Map(plan.cues.map((cue) => [cue.kind, cue]));
    expect(byKind.get('patronUr')?.speech).toBe(FALT_COMMAND_TEXT.patronUr);
    expect(byKind.get('eld')?.speech).toBe('Eld!');
    expect(byKind.get('eldUpphor')?.speechRate).toBe(ELD_UPPHOR_SPEECH_RATE);
    expect(byKind.get('ceaseFire')?.speech).toBeUndefined();
    expect(byKind.get('eld')?.vibrate).toBe(true);
    expect(byKind.get('allaKlara')?.vibrate).toBe(false);
  });

  it('drops the words from ELD UPPHÖR in whistle mode, keeping its time', () => {
    const cue = buildFaltPlan({ ...competition, whistle: true }).cues.find(
      (c) => c.kind === 'eldUpphor',
    );
    expect(cue).toMatchObject({ atMs: 45_000, speech: undefined, speechRate: undefined });
  });

  it('places events inside the shooting window, numbered from 1', () => {
    const plan = buildFaltPlan({ ...competition, shootingSeconds: 12, eventSeconds: [8, 3] });
    const events = plan.cues.filter((cue) => cue.kind === 'event');
    expect(events).toEqual([
      { kind: 'event', atMs: 43_000, vibrate: true, eventIndex: 1 },
      { kind: 'event', atMs: 48_000, vibrate: true, eventIndex: 2 },
    ]);
    expect(plan.cues.findIndex((c) => c.kind === 'eld')).toBeLessThan(
      plan.cues.findIndex((c) => c.kind === 'event'),
    );
  });

  it('clamps ELD UPPHÖR to ELD for the shortest allowed shooting time', () => {
    const plan = buildFaltPlan({ ...competition, shootingSeconds: 3 });
    expect(kindsWithTimes(plan.cues).slice(-5)).toEqual([
      ['eld', 40_000],
      ['eldUpphor', 40_000],
      ['ceaseFire', 43_000],
      ['patronUr', 46_000],
      ['visitation', 50_000],
    ]);
  });

  it('defaults to a 30 s preparation and an 8 s shooting time', () => {
    const plan = buildFaltPlan(DEFAULT_FALT_SETTINGS);
    expect(plan.eldAtMs).toBe(40_000);
    expect(plan.shootingEndMs).toBe(48_000);
  });
});

describe('faltEventIntervals', () => {
  it('is the whole shooting time with no events', () => {
    expect(faltEventIntervals(competition)).toEqual([8]);
  });

  it('is the gaps between consecutive boundaries', () => {
    expect(
      faltEventIntervals({ ...competition, shootingSeconds: 20, eventSeconds: [12, 5] }),
    ).toEqual([5, 7, 8]);
  });
});

describe('FaltTimerEngine', () => {
  function run(settings: FaltTimerSettings = competition) {
    const engine = new FaltTimerEngine(settings);
    return { engine, cues: engine.start() };
  }

  it('emits LADDA at t = 0 and nothing else', () => {
    const { cues } = run();
    expect(cues.map((c) => c.kind)).toEqual(['ladda']);
  });

  it('emits ALLA KLARA and TIO SEKUNDER together in training mode at t = 0', () => {
    const { cues } = run(training);
    expect(cues.map((c) => c.kind)).toEqual(['allaKlara', 'tenSeconds']);
  });

  it('refuses a second start()', () => {
    const { engine } = run();
    expect(() => engine.start()).toThrow(/twice/);
  });

  it.each([-1, Number.NaN])('rejects advance(%s)', (delta) => {
    const { engine } = run();
    expect(() => engine.advance(delta)).toThrow(/deltaMs >= 0/);
  });

  it('does not advance before start()', () => {
    const engine = new FaltTimerEngine(competition);
    expect(engine.advance(60_000)).toEqual([]);
    expect(engine.getElapsedMs()).toBe(0);
    expect(engine.getPhase().kind).toBe('idle');
  });

  it('crosses every cue in order across one big step', () => {
    const { engine } = run();
    const cues = engine.advance(60_000);
    expect(cues.map((c) => c.kind)).toEqual([
      'allaKlara',
      'tenSeconds',
      'fardiga',
      'eld',
      'eldUpphor',
      'ceaseFire',
      'patronUr',
      'visitation',
    ]);
    expect(engine.getElapsedMs()).toBe(55_000);
  });

  it('emits each cue exactly once when ticked', () => {
    const { engine, cues } = run(training);
    const seen = [...cues.map((c) => c.kind)];
    for (let i = 0; i < 300; i += 1) seen.push(...engine.advance(100).map((c) => c.kind));
    expect(seen.filter((kind) => kind === 'eld')).toHaveLength(1);
    expect(seen).toEqual([
      'allaKlara',
      'tenSeconds',
      'fardiga',
      'eld',
      'eldUpphor',
      'ceaseFire',
      'patronUr',
      'visitation',
    ]);
  });

  it('fires event beeps at their second inside the shooting time', () => {
    const { engine } = run({ ...training, shootingSeconds: 10, eventSeconds: [4, 7] });
    engine.advance(10_000); // ELD
    expect(engine.advance(3_999).map((c) => c.kind)).toEqual([]);
    expect(engine.advance(1)).toEqual([
      { kind: 'event', atMs: 14_000, vibrate: true, eventIndex: 1 },
    ]);
    expect(engine.getPhase().eventsPassed).toBe(1);
    // The second event and the start of the drawn-out ELD UPPHÖR coincide at 7 s of a 10 s series.
    expect(engine.advance(3_000).map((c) => [c.kind, c.eventIndex])).toEqual([
      ['event', 2],
      ['eldUpphor', undefined],
    ]);
    expect(engine.getPhase().eventsPassed).toBe(2);
  });

  it('reports the phases and their countdowns', () => {
    const { engine } = run();
    expect(engine.getPhase()).toMatchObject({ kind: 'prep', remainingMs: 30_000 });
    engine.advance(20_000);
    expect(engine.getPhase()).toMatchObject({ kind: 'prep', remainingMs: 10_000 });
    engine.advance(10_000);
    expect(engine.getPhase()).toMatchObject({ kind: 'ready', remainingMs: 10_000 });
    engine.advance(12_000);
    expect(engine.getPhase()).toMatchObject({
      kind: 'shooting',
      shootingElapsedMs: 2_000,
      shootingRemainingMs: 6_000,
    });
    engine.advance(6_000);
    expect(engine.getPhase()).toMatchObject({
      kind: 'clearing',
      remainingMs: 0,
      shootingElapsedMs: 8_000,
      shootingRemainingMs: 0,
    });
  });

  it('stops the clock at the end of the plan and waits for MARKERA', () => {
    const { engine } = run();
    engine.advance(120_000);
    expect(engine.getElapsedMs()).toBe(55_000);
    expect(engine.getPhase().kind).toBe('clearing');
    engine.markera();
    expect(engine.getPhase().kind).toBe('done');
    expect(engine.isRunning()).toBe(false);
    expect(engine.advance(1_000)).toEqual([]);
  });

  it('ignores MARKERA before the run starts', () => {
    const engine = new FaltTimerEngine(competition);
    engine.markera();
    expect(engine.getPhase().kind).toBe('idle');
  });

  it('holds the clock while paused and carries on after resume', () => {
    const { engine } = run(training);
    engine.advance(5_000);
    engine.pause();
    expect(engine.isRunning()).toBe(false);
    expect(engine.advance(30_000)).toEqual([]);
    expect(engine.getElapsedMs()).toBe(5_000);
    engine.resume();
    expect(engine.isRunning()).toBe(true);
    expect(engine.advance(5_000).map((c) => c.kind)).toEqual(['fardiga', 'eld']);
  });

  it('cannot be paused or resumed once MARKERA has been given', () => {
    const { engine } = run(training);
    engine.advance(60_000);
    engine.markera();
    engine.resume();
    expect(engine.isRunning()).toBe(false);
    engine.pause();
    expect(engine.getPhase().kind).toBe('done');
  });

  it('pause() before start() leaves the engine idle', () => {
    const engine = new FaltTimerEngine(training);
    engine.pause();
    expect(engine.isRunning()).toBe(false);
    expect(engine.start().map((c) => c.kind)).toEqual(['allaKlara', 'tenSeconds']);
  });

  it('reset() returns to idle and lets the sequence be run again', () => {
    const { engine } = run();
    engine.advance(45_000);
    engine.reset();
    expect(engine.getPhase()).toMatchObject({ kind: 'idle', elapsedMs: 0, eventsPassed: 0 });
    expect(engine.start().map((c) => c.kind)).toEqual(['ladda']);
    expect(engine.advance(30_000).map((c) => c.kind)).toEqual(['allaKlara', 'tenSeconds']);
  });

  it('exposes the plan it was built from', () => {
    const { engine } = run();
    expect(engine.getPlan().settings.shootingSeconds).toBe(8);
  });

  it('defaults to the default settings', () => {
    expect(new FaltTimerEngine().getPlan().eldAtMs).toBe(40_000);
  });
});
