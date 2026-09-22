import { describe, expect, it } from 'vitest';

import { DEFAULT_WINDOW_MS, PcmWindower, SILENT_DB, amplitudeToDb } from './pcm';

const SAMPLE_RATE = 48_000;

/** One buffer of mono float32 at `amplitude`, `frames` long. */
function buffer(frames: number, amplitude: number, channels = 1): ArrayBuffer {
  const samples = new Float32Array(frames * channels).fill(amplitude);
  return samples.buffer;
}

function windower(windowMs = 10) {
  return new PcmWindower({ windowMs });
}

describe('amplitudeToDb', () => {
  it('maps full scale to 0 dBFS and halves to about −6 dB', () => {
    expect(amplitudeToDb(1)).toBe(0);
    expect(amplitudeToDb(0.5)).toBeCloseTo(-6.02, 2);
  });

  it('floors silence and nonsense at SILENT_DB', () => {
    expect(amplitudeToDb(0)).toBe(SILENT_DB);
    expect(amplitudeToDb(-1)).toBe(SILENT_DB);
    expect(amplitudeToDb(Number.NaN)).toBe(SILENT_DB);
  });

  it('clamps above full scale rather than reporting a positive level', () => {
    expect(amplitudeToDb(2)).toBe(0);
  });
});

describe('PcmWindower', () => {
  it('cuts a buffer into windows and times them on the sample clock', () => {
    // 100 ms of audio at 48 kHz = ten 10 ms windows.
    const windows = windower().push({
      data: buffer(4_800, 0.5),
      sampleRate: SAMPLE_RATE,
      channels: 1,
    });

    expect(windows).toHaveLength(10);
    expect(windows.map((w) => w.atMs)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(windows[0]?.db).toBeCloseTo(-6.02, 2);
  });

  it('reports the peak of a window, not its average', () => {
    const samples = new Float32Array(480).fill(0.01);
    samples[100] = 1; // one sample of muzzle blast in 10 ms of near-silence
    const [window] = windower().push({
      data: samples.buffer,
      sampleRate: SAMPLE_RATE,
      channels: 1,
    });
    expect(window?.db).toBe(0);
  });

  it('carries a partial window across the buffer boundary', () => {
    const pcm = windower();
    // 15 ms: one window out, 5 ms held back.
    const first = pcm.push({ data: buffer(720, 0.5), sampleRate: SAMPLE_RATE, channels: 1 });
    expect(first).toHaveLength(1);

    // The held-back 5 ms is where the peak is; it must survive into the
    // window the next buffer completes.
    const next = new Float32Array(720).fill(0.001);
    const second = pcm.push({ data: next.buffer, sampleRate: SAMPLE_RATE, channels: 1 });
    expect(second[0]?.atMs).toBe(20);
    expect(second[0]?.db).toBeCloseTo(-6.02, 2);
    // …and the window after it sees only the new, quiet buffer.
    expect(second[1]?.db).toBeCloseTo(-60, 0);
  });

  it('keeps the clock running across buffers', () => {
    const pcm = windower();
    pcm.push({ data: buffer(4_800, 0.5), sampleRate: SAMPLE_RATE, channels: 1 });
    const second = pcm.push({ data: buffer(4_800, 0.5), sampleRate: SAMPLE_RATE, channels: 1 });
    expect(second[0]?.atMs).toBe(110);
    expect(pcm.elapsedMs).toBe(200);
  });

  it('takes the loudest channel of an interleaved frame', () => {
    const samples = new Float32Array(960); // 480 stereo frames = 10 ms
    for (let frame = 0; frame < 480; frame += 1) {
      samples[frame * 2] = 0.001; // left: near silence
      samples[frame * 2 + 1] = 0.5; // right
    }
    const [window] = windower().push({
      data: samples.buffer,
      sampleRate: SAMPLE_RATE,
      channels: 2,
    });
    expect(window?.db).toBeCloseTo(-6.02, 2);
  });

  it('scales int16 samples to full scale', () => {
    const samples = new Int16Array(480).fill(16_384);
    const [window] = new PcmWindower({ windowMs: 10, encoding: 'int16' }).push({
      data: samples.buffer,
      sampleRate: SAMPLE_RATE,
      channels: 1,
    });
    expect(window?.db).toBeCloseTo(-6.02, 2);
  });

  it('measures windows against the rate the buffer actually arrived at', () => {
    // The hardware may ignore the requested rate (AudioStream documents it).
    const windows = windower().push({ data: buffer(160, 0.5), sampleRate: 16_000, channels: 1 });
    expect(windows).toHaveLength(1);
    expect(windows[0]?.atMs).toBe(10);
  });

  it('drops the partial window when the sample rate changes mid-stream', () => {
    const pcm = windower();
    pcm.push({ data: buffer(240, 1), sampleRate: SAMPLE_RATE, channels: 1 }); // 5 ms held
    const windows = pcm.push({ data: buffer(160, 0.5), sampleRate: 16_000, channels: 1 });
    expect(windows).toHaveLength(1);
    expect(windows[0]?.db).toBeCloseTo(-6.02, 2); // not the full-scale remnant
  });

  it('ignores a buffer with no usable geometry', () => {
    const pcm = windower();
    expect(pcm.push({ data: buffer(480, 0.5), sampleRate: 0, channels: 1 })).toEqual([]);
    expect(pcm.push({ data: buffer(480, 0.5), sampleRate: SAMPLE_RATE, channels: 0 })).toEqual([]);
    expect(pcm.elapsedMs).toBe(0);
  });

  it('ignores a trailing partial sample rather than throwing on it', () => {
    // A read cut short leaves a byte count that is not a whole number of
    // float32 samples; `new Float32Array(data)` would throw on it.
    const cutShort = { data: new ArrayBuffer(480 * 4 + 3), sampleRate: SAMPLE_RATE, channels: 1 };
    expect(() => windower().push(cutShort)).not.toThrow();
    expect(windower().push(cutShort)).toHaveLength(1);
  });

  it('defaults to DEFAULT_WINDOW_MS when no length is given', () => {
    // 100 ms of audio cut into default-length windows.
    const windows = new PcmWindower().push({
      data: buffer(4_800, 0.5),
      sampleRate: SAMPLE_RATE,
      channels: 1,
    });

    expect(windows).toHaveLength(100 / DEFAULT_WINDOW_MS);
  });

  it('rejects a window length that cannot measure anything', () => {
    expect(() => new PcmWindower({ windowMs: 0 })).toThrow(/windowMs/);
    expect(() => new PcmWindower({ windowMs: Number.NaN })).toThrow(/windowMs/);
  });

  it('resets the clock and the partial window', () => {
    const pcm = windower();
    pcm.push({ data: buffer(4_800, 0.5), sampleRate: SAMPLE_RATE, channels: 1 });
    pcm.reset();
    expect(pcm.elapsedMs).toBe(0);
    const windows = pcm.push({ data: buffer(480, 0.5), sampleRate: SAMPLE_RATE, channels: 1 });
    expect(windows[0]?.atMs).toBe(10);
  });
});
