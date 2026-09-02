import type { TimerConfig, TimerCueKind } from '@shotledger/shared';

import { TimerController } from './timer-controller';

function singleSeries(): TimerConfig {
  return {
    readyDelayMs: 1_000,
    series: [{ index: 0, durationMs: 2_000 }],
    restMs: 0,
  };
}

function makeSpyEffects() {
  const sounds: TimerCueKind[] = [];
  let vibrateCount = 0;
  return {
    effects: {
      playSound: (kind: TimerCueKind) => sounds.push(kind),
      vibrate: () => {
        vibrateCount += 1;
      },
    },
    sounds,
    getVibrateCount: () => vibrateCount,
  };
}

describe('TimerController', () => {
  it('start() plays the ready sound but does not vibrate (ready cue is silent)', () => {
    const { effects, sounds, getVibrateCount } = makeSpyEffects();
    const controller = new TimerController(singleSeries(), effects);
    controller.start(0);
    expect(sounds).toEqual(['ready']);
    expect(getVibrateCount()).toBe(0);
    expect(controller.getPhase().kind).toBe('readyDelay');
  });

  it('tick() before start() is a no-op', () => {
    const { effects, sounds } = makeSpyEffects();
    const controller = new TimerController(singleSeries(), effects);
    const phase = controller.tick(500);
    expect(phase.kind).toBe('idle');
    expect(sounds).toEqual([]);
  });

  it('running the whole drill plays start/stop/complete and vibrates for each (not for ready)', () => {
    const { effects, sounds, getVibrateCount } = makeSpyEffects();
    const controller = new TimerController(singleSeries(), effects);
    controller.start(0);
    controller.tick(3_000); // 1000 readyDelay + 2000 series
    expect(sounds).toEqual(['ready', 'start', 'stop', 'complete']);
    expect(getVibrateCount()).toBe(3); // start, stop, complete
    expect(controller.getPhase().kind).toBe('done');
    expect(controller.isRunning()).toBe(false);
  });

  it('isRunning() is true mid-drill', () => {
    const { effects } = makeSpyEffects();
    const controller = new TimerController(singleSeries(), effects);
    controller.start(0);
    controller.tick(1_500);
    expect(controller.isRunning()).toBe(true);
  });

  it('successive tick() calls use the delta since the previous tick, not since start', () => {
    const { effects, sounds } = makeSpyEffects();
    const controller = new TimerController(singleSeries(), effects);
    controller.start(1_000_000); // arbitrary wall-clock epoch
    controller.tick(1_000_500); // +500ms
    expect(sounds).toEqual(['ready']); // still within the 1000ms readyDelay
    controller.tick(1_001_500); // +1000ms more (total 1500 since start) -> crosses into series
    expect(sounds).toEqual(['ready', 'start']);
    expect(controller.getElapsedMs()).toBe(1_500);
  });

  it('reset() stops the drill, silences further ticks, and getPhase() returns idle', () => {
    const { effects, sounds } = makeSpyEffects();
    const controller = new TimerController(singleSeries(), effects);
    controller.start(0);
    controller.tick(500);
    controller.reset();
    expect(controller.getPhase()).toEqual({
      kind: 'idle',
      seriesIndex: -1,
      remainingMs: 0,
      elapsedMs: 0,
    });
    expect(controller.isRunning()).toBe(false);

    const soundsBeforeStaleTick = [...sounds];
    controller.tick(999_999); // stale tick after reset — must be a no-op
    expect(sounds).toEqual(soundsBeforeStaleTick);
  });

  it('getConfig() exposes the config passed to the constructor', () => {
    const config = singleSeries();
    const { effects } = makeSpyEffects();
    const controller = new TimerController(config, effects);
    expect(controller.getConfig()).toBe(config);
  });
});
