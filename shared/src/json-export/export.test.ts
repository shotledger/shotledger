import { describe, expect, it } from 'vitest';

import { exportSessionsToJson } from './export';
import {
  JSON_EXPORT_FORMAT,
  JSON_EXPORT_VERSION,
  type FirearmExport,
  type LicenseExport,
  type SessionExport,
} from './types';

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
    firearmId: null,
    firearm: null,
    ammoLot: null,
    startedAt: '2026-01-01T00:00:00.000Z',
    location: null,
    notes: null,
    decimalScoring: false,
    seriesLength: null,
    extraRounds: null,
    tags: [],
    series: [],
    faltResultMode: null,
    stations: [],
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
        { position: 1, isSighter: false, isFinal: false, totalOverride: null, shots: shots(80) },
        { position: 2, isSighter: false, isFinal: false, totalOverride: null, shots: shots(90) },
      ],
    });

    const parsed = JSON.parse(exportSessionsToJson([input], OPTIONS)) as {
      sessions: SessionExport[];
    };
    expect(parsed.sessions).toEqual([input]);
  });

  it('C3: a series with zero shots survives — the CSV shape could not hold one', () => {
    const input = session({
      series: [{ position: 1, isSighter: true, isFinal: false, totalOverride: null, shots: [] }],
    });
    const parsed = JSON.parse(exportSessionsToJson([input], OPTIONS)) as {
      sessions: SessionExport[];
    };
    expect(parsed.sessions[0]!.series).toEqual([
      { position: 1, isSighter: true, isFinal: false, shots: [], totalOverride: null },
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

describe('exportSessionsToJson — firearms and licenses (#314)', () => {
  const firearm: FirearmExport = {
    id: 'f1',
    make: 'Pardini',
    model: 'SP',
    caliber: '.22 LR',
    weaponType: 'pistol',
    isOwn: true,
    serialNumber: 'SN-0001',
    vapenId: 'SE-TEST-0001',
    loadSystem: 'halvautomat',
    notes: 'Träningsvapen',
    roundCount: 1200,
    maintenanceIntervalRounds: 500,
    roundsSinceMaintenance: 120,
  };
  const license: LicenseExport = {
    id: 'l1',
    firearmId: 'f1',
    licenseNumber: 'TEST-000.000/00-00',
    purpose: 'Målskjutning',
    decidedOn: '2026-01-15',
    validUntil: null,
    conditions: null,
    authority: 'Polismyndigheten',
  };

  it('always writes both arrays, even with nothing to put in them', () => {
    const parsed = JSON.parse(exportSessionsToJson([], OPTIONS)) as Record<string, unknown>;
    expect(parsed.firearms).toEqual([]);
    expect(parsed.licenses).toEqual([]);
  });

  it('carries a firearm and its license through unchanged', () => {
    const json = exportSessionsToJson([session({ firearmId: 'f1', firearm: 'Pardini SP' })], {
      ...OPTIONS,
      firearms: [firearm],
      licenses: [license],
    });
    const parsed = JSON.parse(json) as {
      sessions: SessionExport[];
      firearms: FirearmExport[];
      licenses: LicenseExport[];
    };
    expect(parsed.firearms).toEqual([firearm]);
    expect(parsed.licenses).toEqual([license]);
    expect(parsed.sessions[0]!.firearmId).toBe('f1');
    // The name stays beside the id: a reader with no firearms array still
    // learns what was shot with.
    expect(parsed.sessions[0]!.firearm).toBe('Pardini SP');
  });
});
