import { describe, expect, it } from 'vitest';

import {
  MILSNABB_DEFAULT_REST_MS,
  MILSNABB_OFFICIAL_READY_DELAY_MS,
  MILSNABB_PRACTICE_READY_DELAY_MS,
  PAR_INTERVAL_DRILL,
  PAR_PRESETS,
  PAR_RANDOM_START,
  PAR_SINGLE,
  buildMilsnabbDrillConfig,
  buildMilsnabbDrillConfigFrom,
  requireMilsnabbProgram,
} from './presets';
import { TimerEngine } from './engine';

describe('PAR presets', () => {
  it('are all constructible as a TimerEngine (config validity)', () => {
    for (const preset of PAR_PRESETS) {
      expect(() => new TimerEngine(preset.config)).not.toThrow();
    }
  });

  it('PAR_SINGLE is one series, fixed ready delay, no rest', () => {
    expect(PAR_SINGLE.config.series).toHaveLength(1);
    expect(PAR_SINGLE.config.randomReadyDelay).toBeUndefined();
    expect(PAR_SINGLE.config.restMs).toBe(0);
  });

  it('PAR_RANDOM_START randomizes the ready delay', () => {
    expect(PAR_RANDOM_START.config.randomReadyDelay).toEqual({ minMs: 1_000, maxMs: 4_000 });
  });

  it('PAR_INTERVAL_DRILL is a 5-rep interval drill with rest between reps', () => {
    expect(PAR_INTERVAL_DRILL.config.series).toHaveLength(5);
    expect(PAR_INTERVAL_DRILL.config.restMs).toBe(10_000);
  });

  it('PAR_PRESETS lists exactly the three exported presets, each with a unique id', () => {
    expect(PAR_PRESETS).toEqual([PAR_SINGLE, PAR_RANDOM_START, PAR_INTERVAL_DRILL]);
    const ids = new Set(PAR_PRESETS.map((p) => p.id));
    expect(ids.size).toBe(PAR_PRESETS.length);
  });
});

describe('buildMilsnabbDrillConfig', () => {
  it('builds 1 provserie (10s) + 3 omgångar x 4 serier at 10/8/6s (J.6.1 p. 290)', () => {
    const config = buildMilsnabbDrillConfig();
    expect(config.series).toHaveLength(13); // 1 sighter + 12
    const durations = config.series.map((s) => s.durationMs);
    expect(durations).toEqual([
      10_000, // provserie
      10_000, 10_000, 10_000, 10_000,
      8_000, 8_000, 8_000, 8_000,
      6_000, 6_000, 6_000, 6_000,
    ]);
  });

  it('defaults to the practice ready delay and default rest', () => {
    const config = buildMilsnabbDrillConfig();
    expect(config.readyDelayMs).toBe(MILSNABB_PRACTICE_READY_DELAY_MS);
    expect(config.restMs).toBe(MILSNABB_DEFAULT_REST_MS);
  });

  it('accepts an override, e.g. the SHB-authentic 60s LADDA→FÄRDIGA cadence', () => {
    const config = buildMilsnabbDrillConfig(MILSNABB_OFFICIAL_READY_DELAY_MS, 2_000);
    expect(config.readyDelayMs).toBe(60_000);
    expect(config.restMs).toBe(2_000);
  });

  it('series indices are 0-based and sequential', () => {
    const config = buildMilsnabbDrillConfig();
    expect(config.series.map((s) => s.index)).toEqual(Array.from({ length: 13 }, (_, i) => i));
  });

  it('is a valid TimerEngine config', () => {
    expect(() => new TimerEngine(buildMilsnabbDrillConfig())).not.toThrow();
  });

  // Data-integrity guards: unreachable with the real `spsf-milsnabb.json`
  // (validated by `programSchema` at module load — see disciplines/schema.ts)
  // but exercised here via an injected malformed program/lookup, the same
  // way `resolveWeaponGroupIds` in disciplines/index.ts is tested.
  it('throws when the program has no structure', () => {
    expect(() =>
      buildMilsnabbDrillConfigFrom(
        {
          id: 'x',
          disciplineId: 'x',
          federation: 'SPSF',
          name: { sv: 'x', en: 'x' },
          shotsPerSeries: 5,
          scoring: 'integer',
          supportsFinal: false,
        },
        1_000,
        1_000,
      ),
    ).toThrow(/structure is missing/);
  });

  it('throws when the program structure has no groups at all', () => {
    expect(() =>
      buildMilsnabbDrillConfigFrom(
        {
          id: 'x',
          disciplineId: 'x',
          federation: 'SPSF',
          name: { sv: 'x', en: 'x' },
          shotsPerSeries: 5,
          scoring: 'integer',
          supportsFinal: false,
          structure: { sighterSeries: 1, groups: [] },
        },
        1_000,
        1_000,
      ),
    ).toThrow(/no time limit for its first group/);
  });

  it('throws when the first group has no time limit', () => {
    expect(() =>
      buildMilsnabbDrillConfigFrom(
        {
          id: 'x',
          disciplineId: 'x',
          federation: 'SPSF',
          name: { sv: 'x', en: 'x' },
          shotsPerSeries: 5,
          scoring: 'integer',
          supportsFinal: false,
          structure: { sighterSeries: 1, groups: [{ seriesCount: 4 }] },
        },
        1_000,
        1_000,
      ),
    ).toThrow(/no time limit for its first group/);
  });

  it('throws when a later group has no time limit', () => {
    expect(() =>
      buildMilsnabbDrillConfigFrom(
        {
          id: 'x',
          disciplineId: 'x',
          federation: 'SPSF',
          name: { sv: 'x', en: 'x' },
          shotsPerSeries: 5,
          scoring: 'integer',
          supportsFinal: false,
          structure: {
            sighterSeries: 0,
            groups: [{ seriesCount: 4, timeLimitSeconds: 10 }, { seriesCount: 4 }],
          },
        },
        1_000,
        1_000,
      ),
    ).toThrow(/group is missing a time limit/);
  });
});

describe('requireMilsnabbProgram', () => {
  it('returns the registered spsf-milsnabb program by default', () => {
    expect(requireMilsnabbProgram().id).toBe('spsf-milsnabb');
  });

  it('throws when the lookup finds nothing (registry data-integrity guard)', () => {
    expect(() => requireMilsnabbProgram(() => undefined)).toThrow(/not registered/);
  });
});
