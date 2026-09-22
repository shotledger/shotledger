// The gate itself is one line of Kotlin; what needs cover is the JS side
// refusing to go quiet by mistake — on iOS, on a dev client built before the
// module existed, or when the call throws.
const mockGetRingerMode = jest.fn<string, []>(() => 'normal');
const mockRequireOptionalNativeModule = jest.fn<unknown, [string]>(() => ({
  getRingerMode: mockGetRingerMode,
}));
const platform = { OS: 'android' as string };

jest.mock('expo', () => ({
  requireOptionalNativeModule: (name: string) => mockRequireOptionalNativeModule(name),
}));
jest.mock('react-native', () => ({
  get Platform() {
    return platform;
  },
}));

/** Re-imported per test: the native module is resolved once at module load. */
function loadRinger(): typeof import('./ringer') {
  let module!: typeof import('./ringer');
  jest.isolateModules(() => {
    module = require('./ringer') as typeof import('./ringer');
  });
  return module;
}

beforeEach(() => {
  jest.clearAllMocks();
  platform.OS = 'android';
  mockGetRingerMode.mockReturnValue('normal');
  mockRequireOptionalNativeModule.mockReturnValue({ getRingerMode: mockGetRingerMode });
});

it('reports the ringer mode on Android', () => {
  mockGetRingerMode.mockReturnValue('vibrate');
  const { androidRingerMode, cuesAreAudible } = loadRinger();

  expect(androidRingerMode()).toBe('vibrate');
  expect(cuesAreAudible()).toBe(false);
});

it('is audible while the ringer is normal', () => {
  const { cuesAreAudible } = loadRinger();

  expect(cuesAreAudible()).toBe(true);
});

it('does not ask on iOS, where the audio session already mutes the synthesizer', () => {
  platform.OS = 'ios';
  const { androidRingerMode, cuesAreAudible } = loadRinger();

  expect(androidRingerMode()).toBeNull();
  expect(cuesAreAudible()).toBe(true);
  expect(mockGetRingerMode).not.toHaveBeenCalled();
});

it('stays audible when the module is missing — an older dev client', () => {
  mockRequireOptionalNativeModule.mockReturnValue(null);
  const { androidRingerMode, cuesAreAudible } = loadRinger();

  expect(androidRingerMode()).toBeNull();
  expect(cuesAreAudible()).toBe(true);
});

it('stays audible when the native call throws', () => {
  mockGetRingerMode.mockImplementation(() => {
    throw new Error('no audio service');
  });
  const { cuesAreAudible } = loadRinger();

  expect(cuesAreAudible()).toBe(true);
});
