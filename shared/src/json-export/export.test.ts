import { describe, expect, it } from 'vitest';

import { exportSessionsToJson } from './export';
import { JSON_EXPORT_FORMAT, JSON_EXPORT_VERSION, type SessionExport } from './types';

const OPTIONS = { appVersion: '1.0.0', generatedAt: '2026-09-11T09:12:33.104Z' };

function session(overrides: Partial<SessionExport> = {}): SessionExport {
  return {
    id: 's1',
    name: 'Träning Precision',
    type: 'training',
    disciplineId: 'spsf-precision',
    programId: null,
    competitionLevel: null,
    isChampionship: false,
    competitionName: null,
    weaponGroup: null,
    shooterClass: null,
    eventId: null,
    firearm: null,
    ammoLot: null,
    startedAt: '2026-01-01T00:00:00.000Z',
    location: null,
    notes: null,
    decimalScoring: false,
    extraRounds: null,
    tags: [],
    series: [],
    ...overrides,
  };
}

describe('exportSessionsToJson', () => {
  it('C1: an empty export is a valid envelope with no sessions', () => {
    const parsed = JSON.parse(exportSessionsToJson([], OPTIONS)) as Record<string, unknown>;
    expect(parsed.format).toBe(JSON_EXPORT_FORMAT);
    expect(parsed.formatVersion).toBe(JSON_EXPORT_VERSION);
    expect(parsed.generatedAt).toBe(OPTIONS.generatedAt);
    expect(parsed.app).toEqual({ name: 'ShotLedger', version: '1.0.0' });
    expect(parsed.sessions).toEqual([]);
  });

  it('C2: a session with two series of five shots keeps its exact structure', () => {
    const shots = (base: number) =>
      Array.from({ length: 5 }, (_, i) => ({
        position: i + 1,
        valueTenths: base + i,
        isInnerTen: i === 0,
      }));
    const input = session({
      series: [
        { position: 1, isSighter: false, isFinal: false, shots: shots(80) },
        { position: 2, isSighter: false, isFinal: false, shots: shots(90) },
      ],
    });

    const parsed = JSON.parse(exportSessionsToJson([input], OPTIONS)) as {
      sessions: SessionExport[];
    };
    expect(parsed.sessions).toEqual([input]);
  });

  it('C3: a series with zero shots survives — the CSV shape could not hold one', () => {
    const input = session({
      series: [{ position: 1, isSighter: true, isFinal: false, shots: [] }],
    });
    const parsed = JSON.parse(exportSessionsToJson([input], OPTIONS)) as {
      sessions: SessionExport[];
    };
    expect(parsed.sessions[0]!.series).toEqual([
      { position: 1, isSighter: true, isFinal: false, shots: [] },
    ]);
  });

  it('C4: a session with no series survives', () => {
    const parsed = JSON.parse(exportSessionsToJson([session()], OPTIONS)) as {
      sessions: SessionExport[];
    };
    expect(parsed.sessions[0]!.series).toEqual([]);
  });

  it('C5: nulls stay null — never undefined, omitted, or empty string', () => {
    const json = exportSessionsToJson([session()], OPTIONS);
    const raw = JSON.parse(json) as { sessions: Record<string, unknown>[] };
    for (const key of [
      'programId',
      'competitionLevel',
      'competitionName',
      'weaponGroup',
      'shooterClass',
      'firearm',
      'ammoLot',
      'location',
      'notes',
      'extraRounds',
    ]) {
      expect(raw.sessions[0]).toHaveProperty(key);
      expect(raw.sessions[0]![key]).toBeNull();
    }
  });

  it('C6: an empty tag list stays an array, not null', () => {
    const parsed = JSON.parse(exportSessionsToJson([session()], OPTIONS)) as {
      sessions: SessionExport[];
    };
    expect(parsed.sessions[0]!.tags).toEqual([]);
  });

  it('C7: unicode survives intact', () => {
    const input = session({ name: 'Träning å ä ö', notes: 'skjutbanan — 25 m' });
    const parsed = JSON.parse(exportSessionsToJson([input], OPTIONS)) as {
      sessions: SessionExport[];
    };
    expect(parsed.sessions[0]!.name).toBe('Träning å ä ö');
    expect(parsed.sessions[0]!.notes).toBe('skjutbanan — 25 m');
  });
});
