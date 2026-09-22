import {
  DEFAULT_TIMER_SETUP,
  DEFAULT_WINDOW_MS,
  type TimerCueKind,
  type TimerSetup,
} from '@shotledger/shared';

import { TimerController } from './timer-controller';

/** A 1 s ready delay then a 2 s series — the plain "beep, shoot, beep" drill. */
function setup(overrides: Partial<TimerSetup> = {}): TimerSetup {
  return {
    ...DEFAULT_TIMER_SETUP,
    timeLimitSeconds: 2,
    readyDelaySeconds: 1,
    spokenPrompts: false,
    ...overrides,
  };
}

function makeSpyEffects() {
  const sounds: TimerCueKind[] = [];
  let vibrateCount = 0;
  let spokenCount = 0;
  let speechWorks = true;
  return {
    effects: {
      playSound: (kind: TimerCueKind) => sounds.push(kind),
      vibrate: () => {
        vibrateCount += 1;
      },
      speak: () => {
        spokenCount += 1;
        return speechWorks;
      },
    },
    sounds,
    getVibrateCount: () => vibrateCount,
    getSpokenCount: () => spokenCount,
    refuseSpeech: () => {
      speechWorks = false;
    },
  };
}

/** A quiet indoor range, and a muzzle blast after AGC has squashed it. */
const ROOM_DB = -45;
const BLAST_DB = -5;

/**
 * Feeds the controller `untilMs` of room tone on the audio clock, with a
 * shot-shaped impulse at each of `shotsAtMs`, ticking the wall clock along
 * with it. Both clocks run together here, which is what a test can assume
 * and a phone cannot.
 */
function run(
  controller: TimerController,
  fromMs: number,
  untilMs: number,
  shotsAtMs: number[] = [],
) {
  for (let atMs = fromMs; atMs <= untilMs; atMs += DEFAULT_WINDOW_MS) {
    const loud = shotsAtMs.some((shotAt) => atMs >= shotAt && atMs <= shotAt + 20);
    controller.pushWindow({ atMs, db: loud ? BLAST_DB : ROOM_DB });
    controller.tick(atMs, atMs);
  }
}

describe('TimerController', () => {
  // Get Ready used to be the one cue that never vibrated, because the engine
  // hard-coded `vibrate: false` on it. One global cue mode replaced that
  // (maintainer, 2026-09-11: "One global setting for all 3 events is good
  // enough. KISS."), so Get Ready is now delivered like every other cue.
  it('start() delivers the ready cue in the chosen mode', () => {
    const { effects, sounds, getVibrateCount } = makeSpyEffects();
    const controller = new TimerController(setup(), effects);
    controller.start(0);
    expect(sounds).toEqual(['ready']);
    expect(getVibrateCount()).toBe(1);
    expect(controller.getPhase().kind).toBe('readyDelay');
  });

  it('tick() before start() is a no-op', () => {
    const { effects, sounds } = makeSpyEffects();
    const controller = new TimerController(setup(), effects);
    const phase = controller.tick(500);
    expect(phase.kind).toBe('idle');
    expect(sounds).toEqual([]);
  });

  it('running the whole drill beeps and vibrates for every cue by default', () => {
    const { effects, sounds, getVibrateCount } = makeSpyEffects();
    const controller = new TimerController(setup(), effects);
    controller.start(0);
    controller.tick(3_000); // 1000 readyDelay + 2000 series
    expect(sounds).toEqual(['ready', 'start', 'stop', 'complete']);
    expect(getVibrateCount()).toBe(4);
    expect(controller.getPhase().kind).toBe('done');
    expect(controller.isRunning()).toBe(false);
  });

  it("'beep' silences the vibration, and 'vibrate' silences the sound", () => {
    const beepOnly = makeSpyEffects();
    new TimerController(setup({ cueMode: 'beep' }), beepOnly.effects).start(0);
    expect(beepOnly.sounds).toEqual(['ready']);
    expect(beepOnly.getVibrateCount()).toBe(0);

    const buzzOnly = makeSpyEffects();
    new TimerController(setup({ cueMode: 'vibrate' }), buzzOnly.effects).start(0);
    expect(buzzOnly.sounds).toEqual([]);
    expect(buzzOnly.getVibrateCount()).toBe(1);
  });

  it('speaks the ready prompt when asked, and falls back to its tone when TTS refuses', () => {
    const spoken = makeSpyEffects();
    new TimerController(setup({ spokenPrompts: true }), spoken.effects).start(0);
    expect(spoken.getSpokenCount()).toBe(1);
    expect(spoken.sounds).toEqual([]);

    const refused = makeSpyEffects();
    refused.refuseSpeech();
    new TimerController(setup({ spokenPrompts: true }), refused.effects).start(0);
    expect(refused.sounds).toEqual(['ready']);
  });

  it('isRunning() is true mid-drill', () => {
    const { effects } = makeSpyEffects();
    const controller = new TimerController(setup(), effects);
    controller.start(0);
    controller.tick(1_500);
    expect(controller.isRunning()).toBe(true);
  });

  it('successive tick() calls use the delta since the previous tick, not since start', () => {
    const { effects, sounds } = makeSpyEffects();
    const controller = new TimerController(setup(), effects);
    controller.start(1_000_000); // arbitrary wall-clock epoch
    controller.tick(1_000_500); // +500ms
    expect(sounds).toEqual(['ready']); // still within the 1000ms readyDelay
    controller.tick(1_001_500); // +1000ms more (total 1500 since start) -> crosses into series
    expect(sounds).toEqual(['ready', 'start']);
    expect(controller.getElapsedMs()).toBe(1_500);
  });

  it('reset() stops the drill, silences further ticks, and getPhase() returns idle', () => {
    const { effects, sounds } = makeSpyEffects();
    const controller = new TimerController(setup(), effects);
    controller.start(0);
    controller.tick(500);
    controller.reset();
    expect(controller.getPhase()).toEqual({
      kind: 'idle',
      openEnded: false,
      seriesIndex: -1,
      remainingMs: 0,
      elapsedMs: 0,
    });
    expect(controller.isRunning()).toBe(false);

    const soundsBeforeStaleTick = [...sounds];
    controller.tick(999_999); // stale tick after reset — must be a no-op
    expect(sounds).toEqual(soundsBeforeStaleTick);
  });

  it('getConfig() exposes the config the setup describes', () => {
    const { effects } = makeSpyEffects();
    const controller = new TimerController(setup({ repetitions: 3, restSeconds: 4 }), effects);
    expect(controller.getConfig().series).toHaveLength(3);
    expect(controller.getConfig().restMs).toBe(4_000);
  });
});

describe('TimerController with shot detection', () => {
  it('records nothing at all when the microphone is off', () => {
    const { effects } = makeSpyEffects();
    const controller = new TimerController(setup({ recordShots: false }), effects);
    controller.start(0);
    run(controller, 0, 3_000, [1_500]);

    expect(controller.isRecordingShots()).toBe(false);
    expect(controller.getShots()).toEqual([]);
    expect(controller.getResults()).toEqual([]);
  });

  it('times a shot from the start signal, not from when the microphone opened', () => {
    const { effects } = makeSpyEffects();
    const controller = new TimerController(setup({ recordShots: true }), effects);
    controller.start(0);
    // Ready delay runs to 1 000 ms; the shot is fired 500 ms after the beep.
    run(controller, 0, 3_100, [1_500]);

    const [result] = controller.getResults();
    expect(result?.summary.shotCount).toBe(1);
    expect(result?.shots[0]?.atMs).toBe(500);
  });

  it('keeps each repetition’s shots apart, timed from its own start signal', () => {
    const { effects } = makeSpyEffects();
    const controller = new TimerController(
      setup({ recordShots: true, repetitions: 2, restSeconds: 1 }),
      effects,
    );
    controller.start(0);
    // ready 0–1 000, series 1 000–3 000, rest 3 000–4 000, ready 4 000–5 000,
    // series 5 000–7 000. One shot in each series.
    run(controller, 0, 7_100, [1_500, 5_800]);

    const results = controller.getResults();
    expect(results.map((result) => result.seriesIndex)).toEqual([0, 1]);
    expect(results[0]?.shots[0]?.atMs).toBe(500);
    expect(results[1]?.shots[0]?.atMs).toBe(800);
  });

  it('stops recording at the time limit — nothing is heard past the stop signal', () => {
    const { effects } = makeSpyEffects();
    const controller = new TimerController(
      setup({ recordShots: true, timeLimitSeconds: 1 }),
      effects,
    );
    controller.start(0);
    // ready 0–1 000, series 1 000–2 000. The second shot is fired after it.
    run(controller, 0, 3_000, [1_500, 2_500]);

    expect(controller.getResults()[0]?.summary.shotCount).toBe(1);
  });

  it('runs an open-ended string until the silence auto-stop ends it', () => {
    const { effects, sounds } = makeSpyEffects();
    const controller = new TimerController(
      setup({ recordShots: true, timeLimitSeconds: 0, autoStopSeconds: 2 }),
      effects,
    );
    controller.start(0);
    run(controller, 0, 1_500, [1_200]);
    expect(controller.getPhase()).toMatchObject({ kind: 'series', openEnded: true });

    // Two seconds of silence after the last shot, and the string is over.
    run(controller, 1_500, 3_400);
    expect(sounds).toEqual(['ready', 'start', 'stop', 'complete']);
    expect(controller.getPhase().kind).toBe('done');
    expect(controller.getResults()[0]?.summary.shotCount).toBe(1);
  });

  it('leaves an open-ended string to the Stop button when the auto-stop is off', () => {
    const { effects } = makeSpyEffects();
    const controller = new TimerController(
      setup({ recordShots: true, timeLimitSeconds: 0, autoStopSeconds: 0 }),
      effects,
    );
    controller.start(0);
    run(controller, 0, 30_000, [1_200]);
    expect(controller.getPhase()).toMatchObject({ kind: 'series', openEnded: true });

    expect(controller.stopSeries().kind).toBe('done');
    expect(controller.getResults()[0]?.summary.shotCount).toBe(1);
  });

  it('never auto-stops a timed series — its own clock ends it', () => {
    const { effects } = makeSpyEffects();
    const controller = new TimerController(
      setup({ recordShots: true, timeLimitSeconds: 10, autoStopSeconds: 1 }),
      effects,
    );
    controller.start(0);
    run(controller, 0, 5_000);

    expect(controller.getPhase()).toMatchObject({ kind: 'series', openEnded: false });
  });
});
