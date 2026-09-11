// Screen glue for the shot-detection diagnostics: owns the microphone
// handle, the wall clock and the share sheet. Every rule — the noise floor,
// the bounded sample buffer, the mark analysis, the export document — is in
// `shared/src/timer/mic-diagnostics.ts`; this file only feeds it.
import {
  buildMicDiagnosticsJson,
  MAX_DIAGNOSTIC_SAMPLES,
  MicDiagnosticsRecorder,
  type DiagnosticsLiveStats,
} from '@shotledger/shared';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { shareJson } from '@/platform/export-file';
import {
  ensureMicPermission,
  isShotListeningAvailable,
  startShotListening,
  type ShotListenerHandle,
} from '@/platform/shot-listener';

/** Kept in step with shot-listener.ts's POLL_INTERVAL_MS — reported, not enforced. */
const SAMPLE_INTERVAL_MS = 60;

export type MicDiagnosticsError = 'unavailable' | 'denied' | 'failed';

export type MicDiagnosticsExportStatus = 'idle' | 'success' | 'failed';

function exportFilename(): string {
  return `shotledger-mic-diagnostics-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
}

export function useMicDiagnostics() {
  const listenerRef = useRef<ShotListenerHandle | null>(null);
  const startedAtRef = useRef(0);

  // One recorder for the screen's lifetime; `clear()` empties it in place.
  const [recorder] = useState(() => new MicDiagnosticsRecorder());
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<MicDiagnosticsError | null>(null);
  const [exportStatus, setExportStatus] = useState<MicDiagnosticsExportStatus>('idle');
  const [stats, setStats] = useState<DiagnosticsLiveStats>(() => recorder.getLiveStats());

  // A recorder left running would hold the microphone for the whole app.
  useEffect(
    () => () => {
      const listener = listenerRef.current;
      listenerRef.current = null;
      void listener?.stop();
    },
    [],
  );

  const start = useCallback(async () => {
    if (listenerRef.current) return;
    setExportStatus('idle');
    if (!isShotListeningAvailable()) {
      setError('unavailable');
      return;
    }
    const permission = await ensureMicPermission();
    if (permission !== 'granted') {
      setError(permission === 'denied' ? 'denied' : 'unavailable');
      return;
    }

    startedAtRef.current = Date.now();
    try {
      listenerRef.current = await startShotListening((db) => {
        recorder.push(Date.now() - startedAtRef.current, db);
        setStats(recorder.getLiveStats());
      });
      setError(null);
      setRecording(true);
    } catch {
      setError('failed');
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    const listener = listenerRef.current;
    listenerRef.current = null;
    await listener?.stop();
    setRecording(false);
  }, []);

  /** Ground truth: the shooter says the shot they just fired was a real one. */
  const markShot = useCallback(() => {
    recorder.mark(Date.now() - startedAtRef.current);
    setStats(recorder.getLiveStats());
  }, [recorder]);

  /** Clears the peak hold only — the recording and the marks stay. */
  const resetPeak = useCallback(() => {
    recorder.resetPeak();
    setStats(recorder.getLiveStats());
  }, [recorder]);

  const clear = useCallback(() => {
    recorder.reset();
    startedAtRef.current = Date.now();
    setExportStatus('idle');
    setStats(recorder.getLiveStats());
  }, [recorder]);

  /** `note` is the shooter's free-text context, typed on the screen. */
  const exportRecording = useCallback(
    async (note: string) => {
      const json = buildMicDiagnosticsJson(recorder.getSnapshot(), {
        generatedAt: new Date().toISOString(),
        appVersion: Constants.expoConfig?.version ?? 'unknown',
        platform: Platform.OS,
        osVersion: Device.osVersion ?? undefined,
        deviceName: Device.modelName ?? undefined,
        sampleIntervalMs: SAMPLE_INTERVAL_MS,
        note,
      });
      // Compact, not pretty-printed: 20 000 samples indented is several MB
      // through a share sheet, and nothing reads this by eye.
      const ok = await shareJson(JSON.stringify(json), exportFilename());
      setExportStatus(ok ? 'success' : 'failed');
    },
    [recorder],
  );

  return {
    recording,
    error,
    exportStatus,
    stats,
    maxSamples: MAX_DIAGNOSTIC_SAMPLES,
    sampleIntervalMs: SAMPLE_INTERVAL_MS,
    start,
    stop,
    markShot,
    resetPeak,
    clear,
    exportRecording,
  };
}
