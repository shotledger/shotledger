// Regression cover for the two things that made the IPSC shot timer kill the
// app on the second Start (fix/shot-timer-crash): a permission re-prompt that
// backgrounds the activity, and a second capture opened while the first was
// still releasing. Plus the buffer → window path, which is what the detector
// is fed. Real microphone capture is exercised on-device.
import type { AudioStreamBuffer } from 'expo-audio';

const mockEvents: string[] = [];
const mockSetAudioModeAsync = jest.fn(async () => undefined);
const mockGetPermissions = jest.fn(async () => ({ granted: true }));
const mockRequestPermissions = jest.fn(async () => ({ granted: true }));

/** Set to a pending promise to hold `stream.start()` open, as a real one does. */
const mockStartGate: { promise: Promise<void> | null } = { promise: null };
/** Set to hold `stop()` open, the way a real teardown takes a moment. */
const mockStopGate: { promise: Promise<void> | null } = { promise: null };

type BufferListener = (buffer: AudioStreamBuffer) => void;

class MockAudioStream {
  private static count = 0;
  private static live: MockAudioStream[] = [];
  private readonly n: number;
  private listener: BufferListener | null = null;

  constructor() {
    MockAudioStream.count += 1;
    this.n = MockAudioStream.count;
    MockAudioStream.live.push(this);
    mockEvents.push(`create#${this.n}`);
  }

  static reset(): void {
    MockAudioStream.count = 0;
    MockAudioStream.live = [];
  }

  /** Delivers one buffer to whichever stream is currently listening. */
  static emit(buffer: AudioStreamBuffer): void {
    for (const stream of MockAudioStream.live) stream.listener?.(buffer);
  }

  addListener(event: string, listener: BufferListener): { remove: () => void } {
    this.listener = listener;
    return {
      remove: () => {
        this.listener = null;
        mockEvents.push(`remove#${this.n}`);
      },
    };
  }

  async start(): Promise<void> {
    if (mockStartGate.promise) await mockStartGate.promise;
    mockEvents.push(`start#${this.n}`);
  }

  stop(): void {
    mockEvents.push(`stop#${this.n}`);
    if (mockStopGate.promise) void mockStopGate.promise;
  }
}

jest.mock('expo-audio', () => ({
  AudioModule: {
    AudioStream: MockAudioStream,
    getRecordingPermissionsAsync: mockGetPermissions,
    requestRecordingPermissionsAsync: mockRequestPermissions,
  },
  setAudioModeAsync: mockSetAudioModeAsync,
}));

type ShotListener = typeof import('./shot-listener');

/** Fresh module state per test — the one-capture-at-a-time queue is module-level. */
function load(): ShotListener {
  let module!: ShotListener;
  jest.isolateModules(() => {
    module = require('./shot-listener') as ShotListener;
  });
  return module;
}

/** Lets every already-resolved promise continuation run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

/** `frames` of mono float32 at `amplitude`, as the native side would hand it over. */
function buffer(frames: number, amplitude: number): AudioStreamBuffer {
  return {
    data: new Float32Array(frames).fill(amplitude).buffer,
    sampleRate: 48_000,
    channels: 1,
    timestamp: 0,
  };
}

const noop = () => {};

beforeEach(() => {
  jest.useFakeTimers();
  mockEvents.length = 0;
  MockAudioStream.reset();
  mockStartGate.promise = null;
  mockStopGate.promise = null;
  mockGetPermissions.mockClear();
  mockRequestPermissions.mockClear();
  mockGetPermissions.mockResolvedValue({ granted: true });
  mockRequestPermissions.mockResolvedValue({ granted: true });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ensureMicPermission', () => {
  it('does not prompt when permission is already granted', async () => {
    await expect(load().ensureMicPermission()).resolves.toBe('granted');
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it('prompts when permission is not held yet', async () => {
    mockGetPermissions.mockResolvedValue({ granted: false });
    await expect(load().ensureMicPermission()).resolves.toBe('granted');
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
  });

  it('reports denied when the prompt is refused', async () => {
    mockGetPermissions.mockResolvedValue({ granted: false });
    mockRequestPermissions.mockResolvedValue({ granted: false });
    await expect(load().ensureMicPermission()).resolves.toBe('denied');
  });
});

describe('startShotListening', () => {
  it('turns a PCM buffer into windows on the sample clock', async () => {
    const windows: { atMs: number; db: number }[] = [];
    const listener = load();
    await listener.startShotListening((window) => windows.push(window), { windowMs: 10 });

    // 30 ms of half-scale audio at 48 kHz.
    MockAudioStream.emit(buffer(1_440, 0.5));

    expect(windows.map((window) => window.atMs)).toEqual([10, 20, 30]);
    expect(windows[0]?.db).toBeCloseTo(-6.02, 1);
  });

  it('stops delivering windows once the handle is stopped', async () => {
    const windows: unknown[] = [];
    const listener = load();
    const handle = await listener.startShotListening((window) => windows.push(window));
    await handle.stop();

    MockAudioStream.emit(buffer(4_800, 0.5));
    expect(windows).toHaveLength(0);
  });

  it('releases the previous capture before opening a new one', async () => {
    const listener = load();
    await listener.startShotListening(noop);
    await listener.startShotListening(noop);

    expect(mockEvents).toEqual([
      'create#1',
      'start#1',
      'remove#1',
      'stop#1',
      'create#2',
      'start#2',
    ]);
  });

  it('waits for an in-flight stop instead of opening a second capture', async () => {
    const listener = load();
    const handle = await listener.startShotListening(noop);

    let finishMode!: () => void;
    mockSetAudioModeAsync.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          finishMode = () => resolve(undefined);
        }),
    );

    // Fire-and-forget, the way the setup meter's effect cleanup stops it.
    void handle.stop();
    const started = listener.startShotListening(noop);
    await flush();

    expect(mockEvents).toEqual(['create#1', 'start#1', 'remove#1', 'stop#1']);

    finishMode();
    await started;

    expect(mockEvents).toEqual([
      'create#1',
      'start#1',
      'remove#1',
      'stop#1',
      'create#2',
      'start#2',
    ]);
  });

  it('releases a capture that could not be started', async () => {
    const listener = load();
    mockStartGate.promise = Promise.reject(new Error('mic busy'));

    await expect(listener.startShotListening(noop)).rejects.toThrow('mic busy');
    expect(mockEvents).toEqual(['create#1', 'remove#1', 'stop#1']);

    // The failed attempt must not leave itself behind as the active listener.
    mockStartGate.promise = null;
    await listener.startShotListening(noop);
    expect(mockEvents).toEqual(['create#1', 'remove#1', 'stop#1', 'create#2', 'start#2']);
  });
});
