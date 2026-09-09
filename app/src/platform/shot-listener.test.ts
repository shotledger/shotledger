// Regression cover for the two things that made the IPSC shot timer kill the
// app on the second Start (fix/shot-timer-crash): a permission re-prompt that
// backgrounds the activity, and a second recorder opened while the setup
// meter's was still releasing. Metering itself is exercised on-device.
const mockEvents: string[] = [];
const mockSetAudioModeAsync = jest.fn(async () => undefined);
const mockGetPermissions = jest.fn(async () => ({ granted: true }));
const mockRequestPermissions = jest.fn(async () => ({ granted: true }));

/** Set to a pending promise to hold `recorder.stop()` open, as a real teardown does. */
const mockStopGate: { promise: Promise<void> | null } = { promise: null };

class MockAudioRecorder {
  private static count = 0;
  private readonly n: number;
  readonly uri = 'file:///cache/Audio/recording.m4a';

  constructor() {
    MockAudioRecorder.count += 1;
    this.n = MockAudioRecorder.count;
    mockEvents.push(`create#${this.n}`);
  }

  static reset(): void {
    MockAudioRecorder.count = 0;
  }

  async prepareToRecordAsync(): Promise<void> {}

  record(): void {
    mockEvents.push(`record#${this.n}`);
  }

  getStatus(): { metering: number } {
    return { metering: -40 };
  }

  async stop(): Promise<void> {
    mockEvents.push(`stop#${this.n}`);
    if (mockStopGate.promise) await mockStopGate.promise;
  }

  release(): void {
    mockEvents.push(`release#${this.n}`);
  }
}

jest.mock('expo-audio', () => ({
  AudioModule: {
    AudioRecorder: MockAudioRecorder,
    getRecordingPermissionsAsync: mockGetPermissions,
    requestRecordingPermissionsAsync: mockRequestPermissions,
  },
  RecordingPresets: { LOW_QUALITY: {} },
  setAudioModeAsync: mockSetAudioModeAsync,
}));

jest.mock('expo-file-system', () => ({
  File: class {
    readonly exists = false;
    delete(): void {}
  },
}));

type ShotListener = typeof import('./shot-listener');

/** Fresh module state per test — the one-recorder-at-a-time queue is module-level. */
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

const noop = () => {};

beforeEach(() => {
  jest.useFakeTimers();
  mockEvents.length = 0;
  MockAudioRecorder.reset();
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
  it('releases the previous recorder before opening a new one', async () => {
    const listener = load();
    await listener.startShotListening(noop);
    await listener.startShotListening(noop);

    expect(mockEvents).toEqual([
      'create#1',
      'record#1',
      'stop#1',
      'release#1',
      'create#2',
      'record#2',
    ]);
  });

  it('waits for an in-flight stop instead of opening a second recorder', async () => {
    const listener = load();
    const handle = await listener.startShotListening(noop);

    let finishStop!: () => void;
    mockStopGate.promise = new Promise<void>((resolve) => {
      finishStop = resolve;
    });

    // Fire-and-forget, the way the setup meter's effect cleanup stops it.
    void handle.stop();
    const started = listener.startShotListening(noop);
    await flush();

    expect(mockEvents).toEqual(['create#1', 'record#1', 'stop#1']);

    finishStop();
    await started;

    expect(mockEvents).toEqual([
      'create#1',
      'record#1',
      'stop#1',
      'release#1',
      'create#2',
      'record#2',
    ]);
  });

  it('releases a recorder that could not be started', async () => {
    const listener = load();
    jest
      .spyOn(MockAudioRecorder.prototype, 'prepareToRecordAsync')
      .mockRejectedValueOnce(new Error('mic busy'));

    await expect(listener.startShotListening(noop)).rejects.toThrow('mic busy');
    expect(mockEvents).toEqual(['create#1', 'release#1']);

    // The failed attempt must not leave itself behind as the active listener.
    await listener.startShotListening(noop);
    expect(mockEvents).toEqual(['create#1', 'release#1', 'create#2', 'record#2']);
  });
});
