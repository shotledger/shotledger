import { describe, expect, it } from 'vitest';

import {
  analyseMark,
  buildMicDiagnosticsJson,
  DEFAULT_NOISE_FLOOR_OPTIONS,
  EVENT_EXCESS_DB,
  DEFAULT_MARK_WINDOW,
  MAX_DIAGNOSTIC_SAMPLES,
  MIC_DIAGNOSTICS_FORMAT,
  MIC_DIAGNOSTICS_VERSION,
  MicDiagnosticsRecorder,
  NoiseFloorTracker,
  type MicDiagnosticsMeta,
} from './mic-diagnostics';

const META: MicDiagnosticsMeta = {
  generatedAt: '2026-09-11T10:00:00.000Z',
  appVersion: '1.2.3',
  platform: 'android',
  osVersion: '14',
  deviceName: 'Test Device',
  sampleIntervalMs: 60,
};

describe('NoiseFloorTracker', () => {
  it('starts at the configured floor', () => {
    expect(new NoiseFloorTracker({ initialDb: -45 }).current).toBe(-45);
  });

  it('rises far more slowly than it falls', () => {
    const rising = new NoiseFloorTracker({ initialDb: -60 });
    const falling = new NoiseFloorTracker({ initialDb: -20 });

    const afterRise = rising.push(-20) - -60;
    const afterFall = -20 - falling.push(-60);

    expect(afterRise).toBeGreaterThan(0);
    expect(afterFall).toBeGreaterThan(afterRise);
  });

  it('barely moves for a single loud transient', () => {
    const tracker = new NoiseFloorTracker({ initialDb: -50 });
    for (let i = 0; i < 200; i += 1) tracker.push(-50);
    const before = tracker.current;
    tracker.push(0);
    expect(tracker.current - before).toBeLessThan(1);
  });

  it('converges towards a steady level', () => {
    const tracker = new NoiseFloorTracker({ initialDb: -60 });
    for (let i = 0; i < 5_000; i += 1) tracker.push(-40);
    expect(tracker.current).toBeCloseTo(-40, 1);
  });

  it('ignores a non-finite level', () => {
    const tracker = new NoiseFloorTracker({ initialDb: -50 });
    expect(tracker.push(Number.NaN)).toBe(-50);
    expect(tracker.current).toBe(-50);
  });

  it('rejects rates outside (0, 1]', () => {
    expect(() => new NoiseFloorTracker({ riseRate: 0 })).toThrow(/riseRate/);
    expect(() => new NoiseFloorTracker({ riseRate: 1.5 })).toThrow(/riseRate/);
    expect(() => new NoiseFloorTracker({ fallRate: -0.1 })).toThrow(/fallRate/);
    expect(() => new NoiseFloorTracker({ initialDb: Number.NaN })).toThrow(/initialDb/);
  });
});

describe('MicDiagnosticsRecorder', () => {
  it('records samples with the floor in force at each one', () => {
    const recorder = new MicDiagnosticsRecorder();
    recorder.push(0, -50);
    recorder.push(60, -10);

    const { samples } = recorder.getSnapshot();
    expect(samples).toHaveLength(2);
    expect(samples[1]?.db).toBe(-10);
    expect(samples[1]?.noiseFloorDb).toBeLessThan(-40);
  });

  it('ignores a non-finite level or a negative time', () => {
    const recorder = new MicDiagnosticsRecorder();
    expect(recorder.push(-1, -50)).toBeNull();
    expect(recorder.push(0, Number.NaN)).toBeNull();
    expect(recorder.push(Number.POSITIVE_INFINITY, -50)).toBeNull();
    expect(recorder.getSnapshot().samples).toHaveLength(0);
  });

  it('holds the peak and can clear it back to the current level', () => {
    const recorder = new MicDiagnosticsRecorder();
    recorder.push(0, -50);
    recorder.push(60, -5);
    recorder.push(120, -48);
    expect(recorder.getLiveStats().peakDb).toBe(-5);

    recorder.resetPeak();
    expect(recorder.getLiveStats().peakDb).toBe(-48);
  });

  it('keeps the newest samples and counts the dropped ones', () => {
    const recorder = new MicDiagnosticsRecorder({ maxSamples: 3 });
    for (let i = 0; i < 5; i += 1) recorder.push(i * 60, -50 + i);

    const snapshot = recorder.getSnapshot();
    expect(snapshot.samples.map((s) => s.atMs)).toEqual([120, 180, 240]);
    expect(snapshot.droppedSampleCount).toBe(2);
    expect(snapshot.totalSampleCount).toBe(5);
    expect(recorder.getLiveStats().sampleCount).toBe(3);
  });

  it('reports duration and the retained level range', () => {
    const recorder = new MicDiagnosticsRecorder();
    recorder.push(100, -40);
    recorder.push(400, -12);
    recorder.push(700, -55);

    const snapshot = recorder.getSnapshot();
    expect(snapshot.durationMs).toBe(600);
    expect(snapshot.maxDb).toBe(-12);
    expect(snapshot.minDb).toBe(-55);
  });

  it('is empty, not broken, before the first sample', () => {
    const snapshot = new MicDiagnosticsRecorder().getSnapshot();
    expect(snapshot.durationMs).toBe(0);
    expect(snapshot.minDb).toBeNull();
    expect(snapshot.maxDb).toBeNull();
    expect(snapshot.noiseFloorDb).toBe(DEFAULT_NOISE_FLOOR_OPTIONS.initialDb);
    expect(new MicDiagnosticsRecorder().getLiveStats().currentDb).toBeNull();
  });

  it('numbers marks in order and analyses the newest one', () => {
    const recorder = new MicDiagnosticsRecorder();
    recorder.push(0, -50);
    recorder.push(60, -4);
    recorder.mark(60);

    const stats = recorder.getLiveStats();
    expect(stats.markCount).toBe(1);
    expect(stats.lastMark?.index).toBe(0);
    expect(stats.lastMark?.peakDb).toBe(-4);
    expect(stats.lastMark?.excessDb).toBeGreaterThan(EVENT_EXCESS_DB);
  });

  it('ignores a negative mark time', () => {
    const recorder = new MicDiagnosticsRecorder();
    expect(recorder.mark(-5)).toBeNull();
    expect(recorder.getLiveStats().markCount).toBe(0);
  });

  it('clears everything on reset, floor included', () => {
    const recorder = new MicDiagnosticsRecorder();
    for (let i = 0; i < 100; i += 1) recorder.push(i * 60, -10);
    recorder.mark(120);
    recorder.reset();

    const snapshot = recorder.getSnapshot();
    expect(snapshot.samples).toHaveLength(0);
    expect(snapshot.marks).toHaveLength(0);
    expect(snapshot.totalSampleCount).toBe(0);
    expect(snapshot.droppedSampleCount).toBe(0);
    expect(snapshot.noiseFloorDb).toBe(DEFAULT_NOISE_FLOOR_OPTIONS.initialDb);
    expect(recorder.getLiveStats().lastMark).toBeNull();
  });

  it('rejects a nonsensical buffer size', () => {
    expect(() => new MicDiagnosticsRecorder({ maxSamples: 0 })).toThrow(/maxSamples/);
    expect(() => new MicDiagnosticsRecorder({ maxSamples: 1.5 })).toThrow(/maxSamples/);
  });

  it('bounds itself at the documented default', () => {
    expect(MAX_DIAGNOSTIC_SAMPLES).toBe(20_000);
  });
});

describe('analyseMark', () => {
  const samples = [
    { atMs: 0, db: -50, noiseFloorDb: -50 },
    { atMs: 900, db: -50, noiseFloorDb: -50 },
    { atMs: 960, db: -8, noiseFloorDb: -50 },
    { atMs: 1_020, db: -20, noiseFloorDb: -49 },
    { atMs: 1_080, db: -48, noiseFloorDb: -49 },
    { atMs: 2_000, db: -2, noiseFloorDb: -50 },
  ];

  it('finds the peak and its excess over the floor within the window', () => {
    const analysis = analyseMark(samples, { index: 0, atMs: 1_100 });
    expect(analysis.peakDb).toBe(-8);
    expect(analysis.noiseFloorDb).toBe(-50);
    expect(analysis.excessDb).toBe(42);
  });

  it('counts the samples the event spans, not every sample in the window', () => {
    // -8 and -20 clear floor + 10 dB; -50 and -48 do not.
    expect(analyseMark(samples, { index: 0, atMs: 1_100 }).samplesAboveFloor).toBe(2);
  });

  it('ignores a louder event outside the window', () => {
    expect(analyseMark(samples, { index: 0, atMs: 1_100 }).peakDb).not.toBe(-2);
  });

  it('reaches back further than forward, since the tap follows the shot', () => {
    expect(DEFAULT_MARK_WINDOW.lookbackMs).toBeGreaterThan(DEFAULT_MARK_WINDOW.lookaheadMs);
    // A shot 500 ms before the tap is still found; the same gap ahead is not.
    expect(analyseMark(samples, { index: 0, atMs: 1_460 }).peakDb).toBe(-8);
    expect(analyseMark(samples, { index: 0, atMs: 460 }).peakDb).not.toBe(-8);
  });

  it('honours a custom window', () => {
    expect(
      analyseMark(samples, { index: 0, atMs: 1_000 }, { lookbackMs: 20, lookaheadMs: 20 }).peakDb,
    ).toBe(-20);
  });

  it('reports nulls when no sample fell in the window', () => {
    const analysis = analyseMark(samples, { index: 3, atMs: 10_000 });
    expect(analysis).toEqual({
      index: 3,
      atMs: 10_000,
      peakDb: null,
      noiseFloorDb: null,
      excessDb: null,
      samplesAboveFloor: 0,
    });
  });
});

describe('buildMicDiagnosticsJson', () => {
  function recorded() {
    const recorder = new MicDiagnosticsRecorder();
    recorder.push(0, -50);
    recorder.push(60, -50);
    recorder.push(120, -6);
    recorder.mark(120);
    return recorder;
  }

  it('leads with the format and version so a consumer can dispatch', () => {
    const json = buildMicDiagnosticsJson(recorded().getSnapshot(), META);
    expect(Object.keys(json).slice(0, 2)).toEqual(['format', 'version']);
    expect(json.format).toBe(MIC_DIAGNOSTICS_FORMAT);
    expect(json.version).toBe(MIC_DIAGNOSTICS_VERSION);
  });

  it('carries every retained sample, oldest first', () => {
    const json = buildMicDiagnosticsJson(recorded().getSnapshot(), META);
    expect(json.samples.map((s) => s.atMs)).toEqual([0, 60, 120]);
    expect(json.summary.sampleCount).toBe(3);
    expect(json.summary.durationMs).toBe(120);
    expect(json.summary.maxDb).toBe(-6);
  });

  it('analyses each mark in the document', () => {
    const json = buildMicDiagnosticsJson(recorded().getSnapshot(), META);
    expect(json.summary.markCount).toBe(1);
    expect(json.marks).toHaveLength(1);
    expect(json.marks[0]?.peakDb).toBe(-6);
  });

  it('records the parameters a reading was derived under', () => {
    const json = buildMicDiagnosticsJson(recorded().getSnapshot(), META, { riseRate: 0.5 });
    expect(json.noiseFloor.riseRate).toBe(0.5);
    expect(json.noiseFloor.fallRate).toBe(DEFAULT_NOISE_FLOOR_OPTIONS.fallRate);
    expect(json.eventExcessDb).toBe(EVENT_EXCESS_DB);
    expect(json.markWindow).toEqual(DEFAULT_MARK_WINDOW);
    expect(json.sampleIntervalMs).toBe(60);
  });

  it('normalises optional metadata to nulls', () => {
    const json = buildMicDiagnosticsJson(new MicDiagnosticsRecorder().getSnapshot(), {
      generatedAt: META.generatedAt,
      appVersion: META.appVersion,
      platform: 'ios',
      sampleIntervalMs: 60,
      note: '   ',
    });
    expect(json.device).toEqual({ platform: 'ios', osVersion: null, name: null });
    expect(json.note).toBeNull();
    expect(json.summary.minDb).toBeNull();
    expect(json.samples).toEqual([]);
  });

  it('keeps a trimmed note', () => {
    const json = buildMicDiagnosticsJson(recorded().getSnapshot(), { ...META, note: '  .22 LR ' });
    expect(json.note).toBe('.22 LR');
  });

  it('serialises to JSON without losing anything', () => {
    const json = buildMicDiagnosticsJson(recorded().getSnapshot(), META);
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
  });
});

describe('MicDiagnosticsRecorder.isEmpty', () => {
  it('is true before anything is recorded', () => {
    expect(new MicDiagnosticsRecorder().isEmpty()).toBe(true);
  });

  it('is false once a sample has arrived', () => {
    const r = new MicDiagnosticsRecorder();
    r.push(0, -40);
    expect(r.isEmpty()).toBe(false);
  });

  it('is false once a mark has been made, even with no samples', () => {
    const r = new MicDiagnosticsRecorder();
    r.mark(0);
    expect(r.isEmpty()).toBe(false);
  });

  it('is true again after a reset — a genuinely new recording', () => {
    const r = new MicDiagnosticsRecorder();
    r.push(0, -40);
    r.mark(10);
    r.reset();
    expect(r.isEmpty()).toBe(true);
  });

  it('keeps a resumed recording on one timeline', () => {
    // The bug this exists to stop: a second run restarting at zero puts two
    // unrelated moments at the same atMs, and a mark window then spans both.
    const r = new MicDiagnosticsRecorder();
    r.push(0, -40);
    r.push(100, -40);
    // Host resumes: isEmpty() is false, so it keeps the original epoch and
    // pushes continue past the old times rather than restarting.
    expect(r.isEmpty()).toBe(false);
    r.push(5_000, -20);
    const times = r.getSnapshot().samples.map((s) => s.atMs);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});
