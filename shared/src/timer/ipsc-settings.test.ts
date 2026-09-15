import { describe, expect, it } from 'vitest';

import { DEFAULT_TIMER_CUE_MODE } from './cue-settings';
import {
  DEFAULT_IPSC_SETTINGS,
  IPSC_DELAY_MAX_SECONDS,
  ipscConfigFromSettings,
  ipscCueDelivery,
  normalizeIpscSettings,
} from './ipsc-settings';
import { MAX_TRIGGER_DB, MIN_TRIGGER_DB, type IpscCueKind } from './shot-detector';

describe('normalizeIpscSettings', () => {
  it('keeps a valid stored blob as it is', () => {
    const stored = {
      thresholdDb: -30,
      delayMinSeconds: 2,
      delayMaxSeconds: 5.5,
      parSeconds: 3,
      autoStopSeconds: 4,
      cueMode: 'vibrate',
      spokenPrompts: false,
    };
    expect(normalizeIpscSettings(stored)).toEqual(stored);
  });

  it('gives a row from before the cue settings the default cue mode and spoken prompts', () => {
    const result = normalizeIpscSettings({ thresholdDb: -30, parSeconds: 3 });
    expect(result).toMatchObject({
      thresholdDb: -30,
      parSeconds: 3,
      cueMode: DEFAULT_TIMER_CUE_MODE,
      spokenPrompts: true,
    });
  });

  it('replaces a cue mode it cannot deliver and a malformed spoken-prompts flag', () => {
    expect(normalizeIpscSettings({ cueMode: 'silent', spokenPrompts: 'yes' })).toMatchObject({
      cueMode: DEFAULT_TIMER_CUE_MODE,
      spokenPrompts: true,
    });
    expect(normalizeIpscSettings({ cueMode: 'beep', spokenPrompts: false })).toMatchObject({
      cueMode: 'beep',
      spokenPrompts: false,
    });
  });

  it('falls back to defaults for a missing, null or non-object row', () => {
    expect(normalizeIpscSettings(null)).toEqual(DEFAULT_IPSC_SETTINGS);
    expect(normalizeIpscSettings(undefined)).toEqual(DEFAULT_IPSC_SETTINGS);
    expect(normalizeIpscSettings('nonsense')).toEqual(DEFAULT_IPSC_SETTINGS);
    expect(normalizeIpscSettings({})).toEqual(DEFAULT_IPSC_SETTINGS);
  });

  it('replaces only the bad field, keeping the rest of a partly broken blob', () => {
    const result = normalizeIpscSettings({
      thresholdDb: 'loud',
      delayMinSeconds: 2,
      delayMaxSeconds: 6,
      parSeconds: 3,
      autoStopSeconds: 4,
    });
    expect(result.thresholdDb).toBe(DEFAULT_IPSC_SETTINGS.thresholdDb);
    expect(result.delayMinSeconds).toBe(2);
    expect(result.delayMaxSeconds).toBe(6);
    expect(result.parSeconds).toBe(3);
    expect(result.autoStopSeconds).toBe(4);
  });

  it('clamps an out-of-range trigger level back to the default', () => {
    expect(normalizeIpscSettings({ thresholdDb: MIN_TRIGGER_DB - 1 }).thresholdDb).toBe(
      DEFAULT_IPSC_SETTINGS.thresholdDb,
    );
    expect(normalizeIpscSettings({ thresholdDb: MAX_TRIGGER_DB + 1 }).thresholdDb).toBe(
      DEFAULT_IPSC_SETTINGS.thresholdDb,
    );
    expect(normalizeIpscSettings({ thresholdDb: MIN_TRIGGER_DB }).thresholdDb).toBe(MIN_TRIGGER_DB);
    expect(normalizeIpscSettings({ thresholdDb: MAX_TRIGGER_DB }).thresholdDb).toBe(MAX_TRIGGER_DB);
  });

  it('never lets the high delay thumb end up below the low one', () => {
    expect(normalizeIpscSettings({ delayMinSeconds: 6, delayMaxSeconds: 2 })).toMatchObject({
      delayMinSeconds: 6,
      delayMaxSeconds: 6,
    });
  });

  it('rejects delays beyond the slider range and negative times', () => {
    expect(normalizeIpscSettings({ delayMinSeconds: -1 }).delayMinSeconds).toBe(
      DEFAULT_IPSC_SETTINGS.delayMinSeconds,
    );
    expect(
      normalizeIpscSettings({ delayMaxSeconds: IPSC_DELAY_MAX_SECONDS + 1 }).delayMaxSeconds,
    ).toBe(DEFAULT_IPSC_SETTINGS.delayMaxSeconds);
    expect(normalizeIpscSettings({ parSeconds: -3 }).parSeconds).toBe(
      DEFAULT_IPSC_SETTINGS.parSeconds,
    );
    expect(normalizeIpscSettings({ autoStopSeconds: Number.NaN }).autoStopSeconds).toBe(
      DEFAULT_IPSC_SETTINGS.autoStopSeconds,
    );
  });

  it('keeps zero for PAR and auto-stop — both mean "off", not "unset"', () => {
    expect(normalizeIpscSettings({ parSeconds: 0, autoStopSeconds: 0 })).toMatchObject({
      parSeconds: 0,
      autoStopSeconds: 0,
    });
  });
});

describe('ipscConfigFromSettings', () => {
  it('converts seconds to the engine’s milliseconds', () => {
    expect(
      ipscConfigFromSettings(
        {
          thresholdDb: -30,
          delayMinSeconds: 1.5,
          delayMaxSeconds: 4,
          parSeconds: 2.5,
          autoStopSeconds: 10,
          cueMode: 'both',
          spokenPrompts: true,
        },
        1_500,
      ),
    ).toEqual({
      readyMs: 1_500,
      randomDelay: { minMs: 1_500, maxMs: 4_000 },
      parMs: 2_500,
      autoStopSilenceMs: 10_000,
      thresholdDb: -30,
    });
  });

  it('leaves parMs unset when PAR is off — 0 ms would be rejected by the engine', () => {
    expect(
      ipscConfigFromSettings({ ...DEFAULT_IPSC_SETTINGS, parSeconds: 0 }, 1_500).parMs,
    ).toBeUndefined();
  });

  it('normalizes on the way in, so a bad in-memory value cannot reach the engine', () => {
    const config = ipscConfigFromSettings(
      { ...DEFAULT_IPSC_SETTINGS, delayMinSeconds: 6, delayMaxSeconds: 2 },
      1_500,
    );
    expect(config.randomDelay).toEqual({ minMs: 6_000, maxMs: 6_000 });
  });
});

describe('ipscCueDelivery', () => {
  const ALL: readonly IpscCueKind[] = ['ready', 'standby', 'start', 'stop'];

  it('speaks ready and standby and beeps start and stop, buzzing all four, by default', () => {
    expect(ipscCueDelivery(DEFAULT_IPSC_SETTINGS, 'ready')).toEqual({
      sound: 'voice',
      vibrate: true,
    });
    expect(ipscCueDelivery(DEFAULT_IPSC_SETTINGS, 'standby')).toEqual({
      sound: 'voice',
      vibrate: true,
    });
    expect(ipscCueDelivery(DEFAULT_IPSC_SETTINGS, 'start')).toEqual({
      sound: 'beep',
      vibrate: true,
    });
    expect(ipscCueDelivery(DEFAULT_IPSC_SETTINGS, 'stop')).toEqual({
      sound: 'beep',
      vibrate: true,
    });
  });

  it('beeps the prompts too with spoken prompts off', () => {
    for (const cue of ALL) {
      expect(ipscCueDelivery({ cueMode: 'both', spokenPrompts: false }, cue).sound).toBe('beep');
    }
  });

  it("'beep' drops the buzz and keeps the voice; 'vibrate' drops every sound, the voice included", () => {
    expect(ipscCueDelivery({ cueMode: 'beep', spokenPrompts: true }, 'ready')).toEqual({
      sound: 'voice',
      vibrate: false,
    });
    for (const cue of ALL) {
      expect(ipscCueDelivery({ cueMode: 'vibrate', spokenPrompts: true }, cue)).toEqual({
        sound: null,
        vibrate: true,
      });
    }
  });

  it('never yields a cue nobody can perceive', () => {
    for (const cueMode of ['beep', 'vibrate', 'both'] as const) {
      for (const spokenPrompts of [true, false]) {
        for (const cue of ALL) {
          const delivery = ipscCueDelivery({ cueMode, spokenPrompts }, cue);
          expect(delivery.sound !== null || delivery.vibrate).toBe(true);
        }
      }
    }
  });
});
