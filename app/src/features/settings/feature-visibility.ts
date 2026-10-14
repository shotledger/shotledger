// Settings → Features (#801, docs/specs/feature-visibility-spec.md): which
// optional areas the shooter shows. Hiding one removes its ways in; its data
// stays and still shows where it is recorded.
//
// One store for the whole app, so the tab bar and every screen agree the
// moment a switch moves. The switches sync, so a sync cycle re-reads them:
// a change made on another device or the web shows without a restart.
import {
  FEATURE_SETTING_KEYS,
  readFeatureVisibility,
  type FeatureId,
  type FeatureVisibility,
} from '@shotledger/shared';
import { useSyncExternalStore } from 'react';

import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/queries/settings';
import type { Database } from '@/db/types';
import { subscribeToSync } from '@/features/sync/sync-controller';

export function readFeatures(database: Database): FeatureVisibility {
  return readFeatureVisibility((key) => getSetting<unknown>(database, key, undefined));
}

let snapshot: FeatureVisibility | null = null;
const listeners = new Set<() => void>();
let unsubscribeSync: (() => void) | null = null;

function current(): FeatureVisibility {
  snapshot ??= readFeatures(db);
  return snapshot;
}

const same = (a: FeatureVisibility, b: FeatureVisibility) =>
  (Object.keys(a) as FeatureId[]).every((id) => a[id] === b[id]);

/** Re-reads the switches; listeners hear only a real change. */
export function refreshFeatures(): void {
  const next = readFeatures(db);
  if (snapshot !== null && same(snapshot, next)) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

export function setFeatureVisible(id: FeatureId, visible: boolean): void {
  setSetting<boolean>(db, FEATURE_SETTING_KEYS[id], visible);
  refreshFeatures();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // A pull may have applied another device's switch.
  unsubscribeSync ??= subscribeToSync(() => refreshFeatures());
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && unsubscribeSync) {
      unsubscribeSync();
      unsubscribeSync = null;
    }
  };
}

export function useFeatures(): FeatureVisibility {
  return useSyncExternalStore(subscribe, current, current);
}
