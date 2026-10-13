// The Features store (#801, docs/specs/feature-visibility-spec.md P1, P8):
// what a switch writes, and that a write here or a sync from another device
// reaches every screen without a restart.
import { act, renderHook } from '@testing-library/react-native';

jest.mock('@/db/client', () => ({ db: { tag: 'drizzle-db' } }));

const mockSettings = new Map<string, unknown>();
const mockSetSetting = jest.fn((_db: unknown, key: string, value: unknown) => {
  mockSettings.set(key, value);
});
jest.mock('@/db/queries/settings', () => ({
  getSetting: (_db: unknown, key: string, fallback: unknown) =>
    mockSettings.has(key) ? mockSettings.get(key) : fallback,
  setSetting: (...args: [unknown, string, unknown]) => mockSetSetting(...args),
}));

let mockSyncListener: (() => void) | null = null;
const mockUnsubscribe = jest.fn();
jest.mock('@/features/sync/sync-controller', () => ({
  subscribeToSync: (listener: () => void) => {
    mockSyncListener = listener;
    return mockUnsubscribe;
  },
}));

import {
  readFeatures,
  refreshFeatures,
  setFeatureVisible,
  useFeatures,
} from './feature-visibility';

const ALL_SHOWN = {
  licenseActivity: true,
  photos: true,
  timer: true,
  sightSettings: true,
  ammoLots: true,
};

beforeEach(() => {
  mockSettings.clear();
  mockSetSetting.mockClear();
  mockUnsubscribe.mockClear();
  // The store is module-level: start each test from what is stored now.
  refreshFeatures();
});

it('shows every area when nothing is stored', async () => {
  const { result } = await renderHook(() => useFeatures());
  expect(result.current).toEqual(ALL_SHOWN);
});

it('a switch writes its own synced key and every reader sees it at once', async () => {
  const first = await renderHook(() => useFeatures());
  const second = await renderHook(() => useFeatures());
  await act(async () => setFeatureVisible('photos', false));
  expect(mockSetSetting).toHaveBeenCalledWith({ tag: 'drizzle-db' }, 'showPhotos', false);
  expect(first.result.current).toEqual({ ...ALL_SHOWN, photos: false });
  expect(second.result.current).toEqual({ ...ALL_SHOWN, photos: false });
  await act(async () => setFeatureVisible('photos', true));
  expect(mockSetSetting).toHaveBeenLastCalledWith({ tag: 'drizzle-db' }, 'showPhotos', true);
  expect(first.result.current).toEqual(ALL_SHOWN);
});

it('a sync that brings another device’s switch re-reads it (P8)', async () => {
  mockSyncListener = null;
  const { result, unmount } = await renderHook(() => useFeatures());
  expect(mockSyncListener).not.toBeNull();
  mockSettings.set('showAmmoLots', false);
  await act(async () => mockSyncListener!());
  expect(result.current).toEqual({ ...ALL_SHOWN, ammoLots: false });
  // A sync with nothing new keeps the same object, so nothing re-renders.
  const before = result.current;
  await act(async () => mockSyncListener!());
  expect(result.current).toBe(before);
  await unmount();
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});

it('reads the stored values through the shared rule: only false hides', () => {
  mockSettings.set('showTimer', false);
  mockSettings.set('showSightSettings', 'false');
  expect(readFeatures({} as never)).toEqual({ ...ALL_SHOWN, timer: false });
});
