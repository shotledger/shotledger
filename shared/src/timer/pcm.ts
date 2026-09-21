// Raw PCM → a stream of short level windows, which is what the impulse
// detector in shot-detector.ts gates on.
//
// The microphone hands us ~100 ms buffers of interleaved PCM (expo-audio's
// `AudioStream`). A 100 ms block is far too coarse to measure an event that
// is supposed to be under 80 ms long, so each buffer is chopped into
// `windowMs` slices and reduced to one peak level each. Peak rather than
// RMS: a muzzle blast is an impulse whose energy is concentrated in a few
// milliseconds, and RMS over a window would average exactly that away.
//
// The clock is the sample count, not the wall clock. A buffer arrives on the
// JS thread whenever the bridge gets round to it, so its arrival time
// carries tens of milliseconds of jitter — while the samples themselves are
// evenly spaced by construction. Splits measured off the sample clock are
// therefore accurate even when the buffer that carried them was late.

/** PCM encodings `AudioStream` can deliver. */
export type PcmEncoding = 'float32' | 'int16';

/** One buffer as it arrives from the microphone. Samples are interleaved per frame. */
export interface PcmBuffer {
  data: ArrayBuffer;
  sampleRate: number;
  channels: number;
}

/** One analysis window: the peak level over `windowMs` of audio. */
export interface LevelWindow {
  /** ms since the stream started, at the end of the window (sample clock). */
  atMs: number;
  /** Peak level in the window, dBFS (<= 0). */
  db: number;
}

/** Level reported for digital silence — far below every trigger. */
export const SILENT_DB = -160;

/** Window length the shot detector runs at. Short enough to measure a 25 ms event. */
export const DEFAULT_WINDOW_MS = 10;

export interface PcmWindowerOptions {
  windowMs?: number;
  encoding?: PcmEncoding;
}

/** Full-scale amplitude (0..1) as dBFS, floored at SILENT_DB. */
export function amplitudeToDb(amplitude: number): number {
  if (!Number.isFinite(amplitude) || amplitude <= 0) return SILENT_DB;
  return Math.max(SILENT_DB, 20 * Math.log10(Math.min(1, amplitude)));
}

/**
 * Slices incoming PCM buffers into fixed-length level windows, carrying the
 * remainder of one buffer into the next so a window is never split by a
 * buffer boundary (the boundary lands mid-shot often enough to matter — at
 * 100 ms buffers and a 30 ms blast, roughly a third of the time).
 */
export class PcmWindower {
  private readonly windowMs: number;
  private readonly encoding: PcmEncoding;

  /** Frames consumed since the stream started — the sample clock. */
  private frameCount = 0;
  /** Sample rate the current partial window is being measured at. */
  private sampleRate = 0;
  /** Frames already accumulated into the partial window. */
  private partialFrames = 0;
  /** Peak amplitude of the partial window. */
  private partialPeak = 0;

  constructor(options: PcmWindowerOptions = {}) {
    const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    if (!Number.isFinite(windowMs) || windowMs <= 0) throw new Error('windowMs must be > 0');
    this.windowMs = windowMs;
    this.encoding = options.encoding ?? 'float32';
  }

  /** Consumes one buffer and returns the windows it completed, in order. */
  push(buffer: PcmBuffer): LevelWindow[] {
    const { sampleRate, channels } = buffer;
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) return [];
    if (!Number.isInteger(channels) || channels < 1) return [];

    // A rate change mid-stream would make the partial window's frames mean a
    // different duration than the ones following them. Drop it rather than
    // emit a window of two different lengths.
    if (sampleRate !== this.sampleRate) {
      this.sampleRate = sampleRate;
      this.partialFrames = 0;
      this.partialPeak = 0;
    }

    const samples = this.view(buffer.data);
    const scale = this.encoding === 'int16' ? 1 / 32_768 : 1;
    const windowFrames = Math.max(1, Math.round((this.windowMs * sampleRate) / 1_000));
    const frames = Math.floor(samples.length / channels);
    const windows: LevelWindow[] = [];

    for (let frame = 0; frame < frames; frame += 1) {
      // The loudest channel in the frame: a shot is in both of them, and
      // taking the louder one costs nothing when there is only one.
      for (let channel = 0; channel < channels; channel += 1) {
        const value = Math.abs((samples[frame * channels + channel] as number) * scale);
        if (value > this.partialPeak) this.partialPeak = value;
      }
      this.partialFrames += 1;
      this.frameCount += 1;

      if (this.partialFrames === windowFrames) {
        windows.push({
          atMs: (this.frameCount / sampleRate) * 1_000,
          db: amplitudeToDb(this.partialPeak),
        });
        this.partialFrames = 0;
        this.partialPeak = 0;
      }
    }

    return windows;
  }

  /** ms of audio consumed since the stream started. */
  get elapsedMs(): number {
    return this.sampleRate > 0 ? (this.frameCount / this.sampleRate) * 1_000 : 0;
  }

  reset(): void {
    this.frameCount = 0;
    this.sampleRate = 0;
    this.partialFrames = 0;
    this.partialPeak = 0;
  }

  /**
   * The buffer as samples. Typed arrays read in the platform's byte order,
   * which is what the native side wrote (`ByteOrder.nativeOrder()`), so no
   * swapping is needed. A trailing partial sample — possible when a read is
   * cut short — is ignored rather than throwing on a bad array length.
   */
  private view(data: ArrayBuffer): Float32Array | Int16Array {
    const bytesPerSample = this.encoding === 'int16' ? 2 : 4;
    const count = Math.floor(data.byteLength / bytesPerSample);
    return this.encoding === 'int16'
      ? new Int16Array(data, 0, count)
      : new Float32Array(data, 0, count);
  }
}
