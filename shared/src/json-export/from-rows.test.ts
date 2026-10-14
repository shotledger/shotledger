import { describe, expect, it } from 'vitest';

import {
  firearmExportsFromRows,
  licenseExportsFromRows,
  sessionExportsFromRows,
  type ExportFirearmRow,
  type ExportSeriesRow,
  type ExportSessionRow,
  type SessionExportRows,
} from './from-rows';

function session(overrides: Partial<ExportSessionRow> = {}): ExportSessionRow {
  return {
    id: 'S1',
    name: 'Training',
    type: 'training',
    disciplineId: 'spsf-precision',
    programId: null,
    competitionLevel: null,
    isChampionship: 0,
    competitionName: null,
    weaponGroup: null,
    shooterClass: null,
    eventId: null,
    firearmId: null,
    ammoLotId: null,
    startedAt: '2026-05-01T10:00:00.000Z',
    location: null,
    notes: null,
    decimalScoring: 0,
    seriesLength: null,
    extraRounds: null,
    faltResultMode: null,
    ...overrides,
  };
}

function seriesRow(overrides: Partial<ExportSeriesRow> = {}): ExportSeriesRow {
  return {
    id: 'R1',
    sessionId: 'S1',
    position: 1,
    isSighter: 0,
    isFinal: 0,
    isShootOff: 0,
    isTotalOverride: 0,
    totalOverrideTenths: null,
    totalOverrideShotCount: null,
    ...overrides,
  };
}

const firearm: ExportFirearmRow = {
  id: 'F1',
  make: 'Acme',
  model: 'Target',
  caliber: '.22 LR',
  weaponType: 'pistol',
  isOwn: 1,
  serialNumber: 'SN-1',
  vapenId: 'V-1',
  loadSystem: 'semi',
  notes: 'note',
  roundCount: 500,
  maintenanceIntervalRounds: 1000,
  roundsSinceMaintenance: 200,
  archivedAt: '2026-10-01T00:00:00.000Z',
};

const empty: SessionExportRows = {
  sessions: [],
  series: [],
  shots: [],
  stations: [],
  firearms: [],
  ammoLots: [],
};

describe('sessionExportsFromRows', () => {
  it('copies every session field and turns 0/1 flags into booleans', () => {
    const row = session({
      programId: 'P',
      competitionLevel: 'club',
      isChampionship: 1,
      competitionName: 'Cup',
      weaponGroup: 'C',
      shooterClass: '1',
      eventId: 'E',
      startedAt: '2026-05-02T10:00:00.000Z',
      location: 'Range',
      notes: 'Windy',
      decimalScoring: 1,
      seriesLength: 5,
      extraRounds: 2,
      faltResultMode: 'poangfalt',
      type: 'competition',
      kind: 'rounds',
      tenCount: 9,
      innerTenCount: 3,
      externalSource: 'webshooter',
      externalRef: 'webshooter:1:2',
      officialPlacement: 4,
      officialStandardMedal: 'brons',
    });
    expect(sessionExportsFromRows({ ...empty, sessions: [row] })).toEqual([
      {
        id: 'S1',
        name: 'Training',
        type: 'competition',
        disciplineId: 'spsf-precision',
        programId: 'P',
        competitionLevel: 'club',
        isChampionship: true,
        competitionName: 'Cup',
        weaponGroup: 'C',
        shooterClass: '1',
        eventId: 'E',
        firearmId: null,
        firearm: null,
        ammoLot: null,
        startedAt: '2026-05-02T10:00:00.000Z',
        location: 'Range',
        notes: 'Windy',
        decimalScoring: true,
        seriesLength: 5,
        extraRounds: 2,
        tags: [],
        series: [],
        faltResultMode: 'poangfalt',
        stations: [],
        kind: 'rounds',
        tenCount: 9,
        innerTenCount: 3,
        externalSource: 'webshooter',
        externalRef: 'webshooter:1:2',
        officialPlacement: 4,
        officialStandardMedal: 'brons',
      },
    ]);
  });

  it('exports a source without the #756 columns as a series session with them null', () => {
    const [exported] = sessionExportsFromRows({ ...empty, sessions: [session()] });
    expect(exported).toMatchObject({
      kind: 'series',
      tenCount: null,
      innerTenCount: null,
      externalSource: null,
      externalRef: null,
      officialPlacement: null,
      officialStandardMedal: null,
    });
  });

  it('reads booleans as well as 0/1, and a missing result mode as null', () => {
    const [exported] = sessionExportsFromRows({
      ...empty,
      sessions: [
        session({ isChampionship: true, decimalScoring: false, faltResultMode: undefined }),
      ],
    });
    expect(exported).toMatchObject({
      isChampionship: true,
      decimalScoring: false,
      faltResultMode: null,
    });
  });

  it('orders sessions oldest first', () => {
    const exported = sessionExportsFromRows({
      ...empty,
      sessions: [
        session({ id: 'late', startedAt: '2026-06-01T00:00:00.000Z' }),
        session({ id: 'early', startedAt: '2026-01-01T00:00:00.000Z' }),
      ],
    });
    expect(exported.map((s) => s.id)).toEqual(['early', 'late']);
  });

  it('names the firearm and ammo lot, and drops a reference to a missing one', () => {
    const exported = sessionExportsFromRows({
      ...empty,
      sessions: [
        session({ id: 'A', firearmId: 'F1', ammoLotId: 'L1' }),
        session({ id: 'B', firearmId: 'gone', ammoLotId: 'gone' }),
      ],
      firearms: [firearm],
      ammoLots: [{ id: 'L1', label: 'Lot 7' }],
    });
    expect(
      exported.map(({ firearmId, firearm: name, ammoLot }) => [firearmId, name, ammoLot]),
    ).toEqual([
      ['F1', 'Acme Target', 'Lot 7'],
      [null, null, null],
    ]);
  });

  it('takes tags per session from the map', () => {
    const exported = sessionExportsFromRows({
      ...empty,
      sessions: [session({ id: 'A' }), session({ id: 'B' })],
      tagsBySession: new Map([['A', ['dry', 'match']]]),
    });
    expect(exported.map((s) => s.tags)).toEqual([['dry', 'match'], []]);
  });

  it('S5 carries a shoot-off series as isShootOff', () => {
    const [exported] = sessionExportsFromRows({
      ...empty,
      sessions: [session()],
      series: [
        seriesRow({ id: 'R1', position: 1 }),
        seriesRow({ id: 'R2', position: 2, isShootOff: 1 }),
      ],
    });
    expect(exported!.series.map((s) => s.isShootOff)).toEqual([false, true]);
  });

  it('nests series and shots under their parents, in position order', () => {
    const [exported] = sessionExportsFromRows({
      ...empty,
      sessions: [session()],
      series: [
        seriesRow({ id: 'R2', position: 2, isFinal: 1 }),
        seriesRow({ id: 'R1', position: 1, isSighter: 1 }),
        seriesRow({ id: 'other', sessionId: 'S2' }),
      ],
      shots: [
        { seriesId: 'R2', position: 2, valueTenths: 90, isInnerTen: 0 },
        { seriesId: 'R2', position: 1, valueTenths: 100, isInnerTen: 1 },
        { seriesId: 'other', position: 1, valueTenths: 50, isInnerTen: 0 },
      ],
    });
    expect(exported!.series).toEqual([
      {
        position: 1,
        isSighter: true,
        isFinal: false,
        isShootOff: false,
        shots: [],
        totalOverride: null,
      },
      {
        position: 2,
        isSighter: false,
        isFinal: true,
        isShootOff: false,
        shots: [
          { position: 1, valueTenths: 100, isInnerTen: true },
          { position: 2, valueTenths: 90, isInnerTen: false },
        ],
        totalOverride: null,
      },
    ]);
  });

  it('carries a total-only series as its override, and only when the total is set', () => {
    const [exported] = sessionExportsFromRows({
      ...empty,
      sessions: [session()],
      series: [
        seriesRow({
          id: 'R1',
          position: 1,
          isTotalOverride: 1,
          totalOverrideTenths: 480,
          totalOverrideShotCount: 5,
        }),
        seriesRow({ id: 'R2', position: 2, isTotalOverride: 1, totalOverrideTenths: null }),
        seriesRow({ id: 'R3', position: 3, isTotalOverride: 0, totalOverrideTenths: 300 }),
      ],
    });
    expect(exported!.series.map((s) => s.totalOverride)).toEqual([
      { tenths: 480, shotCount: 5 },
      null,
      null,
    ]);
  });

  it('nests fält stations in position order', () => {
    const station = {
      sessionId: 'S1',
      hits: 6,
      figuresHit: 3,
      figureCount: 4,
      points: 2,
      pointsMax: 6,
      isScratched: 0,
      isShootOff: 1,
      note: 'wind',
    };
    const [exported] = sessionExportsFromRows({
      ...empty,
      sessions: [session()],
      stations: [
        { ...station, position: 2 },
        { ...station, position: 1, isScratched: 1, isShootOff: 0, note: null },
        { ...station, position: 1, sessionId: 'S2' },
      ],
    });
    expect(exported!.stations).toEqual([
      {
        position: 1,
        hits: 6,
        figuresHit: 3,
        figureCount: 4,
        points: 2,
        pointsMax: 6,
        isScratched: true,
        isShootOff: false,
        note: null,
      },
      {
        position: 2,
        hits: 6,
        figuresHit: 3,
        figureCount: 4,
        points: 2,
        pointsMax: 6,
        isScratched: false,
        isShootOff: true,
        note: 'wind',
      },
    ]);
  });
});

describe('firearmExportsFromRows', () => {
  it('copies every field and reads isOwn as a boolean', () => {
    expect(firearmExportsFromRows([firearm, { ...firearm, id: 'F2', isOwn: false }])).toEqual([
      {
        id: 'F1',
        make: 'Acme',
        model: 'Target',
        caliber: '.22 LR',
        weaponType: 'pistol',
        isOwn: true,
        serialNumber: 'SN-1',
        vapenId: 'V-1',
        loadSystem: 'semi',
        notes: 'note',
        roundCount: 500,
        maintenanceIntervalRounds: 1000,
        roundsSinceMaintenance: 200,
        archivedAt: '2026-10-01T00:00:00.000Z',
      },
      expect.objectContaining({ id: 'F2', isOwn: false }),
    ]);
  });
});

describe('licenseExportsFromRows', () => {
  it('keeps the envelope fields and drops row bookkeeping', () => {
    const license = {
      id: 'L1',
      firearmId: 'F1',
      licenseNumber: 'N-1',
      purpose: 'target',
      decidedOn: '2026-01-01',
      validUntil: '2031-01-01',
      conditions: null,
      authority: 'Police',
    };
    expect(licenseExportsFromRows([{ ...license, deletedAt: null } as typeof license])).toEqual([
      license,
    ]);
  });
});
