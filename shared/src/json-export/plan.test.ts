import { describe, expect, it } from 'vitest';

import type { SessionImportGroup } from './import';
import { buildDryRunPlan, type ExistingIndex } from './plan';
import type { FirearmExport, LicenseExport } from './types';

const emptyIndex: ExistingIndex = {
  sessionIds: new Set(),
  firearmIds: new Set(),
  licenseIds: new Set(),
  firearmNames: new Set(),
  ammoLotNames: new Set(),
  tagNames: new Set(),
};

function group(overrides: Partial<SessionImportGroup> = {}): SessionImportGroup {
  return {
    sessionId: 's1',
    name: 'Kvällsträning',
    type: 'training',
    disciplineId: 'precision',
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
    startedAt: '2026-08-01T18:00:00.000Z',
    location: null,
    notes: null,
    decimalScoring: false,
    seriesLength: null,
    extraRounds: null,
    tags: [],
    series: [],
    ...overrides,
  };
}

describe('buildDryRunPlan', () => {
  it('plans create for every session/firearm/lot/tag with no matches', () => {
    const plan = buildDryRunPlan(
      [group({ firearm: 'Pardini SP', ammoLot: 'SK Standard', tags: ['KM'] })],
      emptyIndex,
    );
    expect(plan.sessions).toEqual([
      { sessionId: 's1', name: 'Kvällsträning', action: 'create', shotCount: 0 },
    ]);
    expect(plan.firearms).toEqual([{ name: 'Pardini SP', action: 'create' }]);
    expect(plan.ammoLots).toEqual([{ name: 'SK Standard', action: 'create' }]);
    expect(plan.tags).toEqual([{ name: 'KM', action: 'create' }]);
  });

  it('plans update for a session id already present in the index', () => {
    const index: ExistingIndex = { ...emptyIndex, sessionIds: new Set(['s1']) };
    const plan = buildDryRunPlan([group()], index);
    expect(plan.sessions[0]!.action).toBe('update');
  });

  it('plans reuse for a firearm/lot/tag name already present in the index (case-sensitive)', () => {
    const index: ExistingIndex = {
      ...emptyIndex,
      firearmNames: new Set(['Pardini SP']),
      ammoLotNames: new Set(['SK Standard']),
      tagNames: new Set(['KM']),
    };
    const plan = buildDryRunPlan(
      [
        group({
          firearm: 'Pardini SP',
          ammoLot: 'SK Standard',
          tags: ['KM', 'pardini sp' /* different case */],
        }),
      ],
      index,
    );
    expect(plan.firearms).toEqual([{ name: 'Pardini SP', action: 'reuse' }]);
    expect(plan.ammoLots).toEqual([{ name: 'SK Standard', action: 'reuse' }]);
    expect(plan.tags).toEqual([
      { name: 'KM', action: 'reuse' },
      { name: 'pardini sp', action: 'create' },
    ]);
  });

  it('is a pure function of its inputs', () => {
    const groups = [group({ firearm: 'Pardini SP' })];
    const a = buildDryRunPlan(groups, emptyIndex);
    const b = buildDryRunPlan(groups, emptyIndex);
    expect(a).toEqual(b);
  });
});

describe('buildDryRunPlan shot counts', () => {
  it('reports the total shots across a session’s series', () => {
    // What the user is shown before confirming an import — "N shots" is the
    // number that tells them whether they picked the right file.
    const plan = buildDryRunPlan(
      [
        {
          sessionId: 's1',
          name: 'Träning',
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
          series: [
            {
              position: 1,
              isSighter: true,
              isFinal: false,
              shots: [],
            },
            {
              position: 2,
              isSighter: false,
              isFinal: false,
              shots: [
                { position: 1, valueTenths: 100, isInnerTen: true },
                { position: 2, valueTenths: 90, isInnerTen: false },
              ],
            },
            {
              position: 3,
              isSighter: false,
              isFinal: false,
              shots: [
                { position: 1, valueTenths: 80, isInnerTen: false },
                { position: 2, valueTenths: 70, isInnerTen: false },
                { position: 3, valueTenths: 60, isInnerTen: false },
              ],
            },
          ],
        },
      ],
      {
        sessionIds: new Set(),
        firearmIds: new Set(),
        licenseIds: new Set(),
        firearmNames: new Set(),
        ammoLotNames: new Set(),
        tagNames: new Set(),
      },
    );

    // 5 shots across 3 series: the two numbers must differ, or counting
    // series instead of shots would pass unnoticed (mutation survivor, fixed).
    expect(plan.sessions[0]!.shotCount).toBe(5);
  });
});

describe('buildDryRunPlan tag reuse', () => {
  it('reuses a tag that already exists instead of planning to create it', () => {
    const group = {
      sessionId: 's1',
      name: 'Träning',
      type: 'training' as const,
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
      tags: ['KM', 'Nytt'],
      series: [],
    };
    const plan = buildDryRunPlan([group], {
      sessionIds: new Set(),
      firearmIds: new Set(),
      licenseIds: new Set(),
      firearmNames: new Set(),
      ammoLotNames: new Set(),
      tagNames: new Set(['KM']),
    });

    expect(plan.tags).toEqual([
      { name: 'KM', action: 'reuse' },
      { name: 'Nytt', action: 'create' },
    ]);
  });

  it('plans a tag once even when several sessions carry it', () => {
    // Otherwise importing ten sessions tagged "KM" would tell the user it is
    // about to create ten tags.
    const base = {
      name: 'Träning',
      type: 'training' as const,
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
      tags: ['KM'],
      series: [],
    };
    const plan = buildDryRunPlan(
      [
        { ...base, sessionId: 's1' },
        { ...base, sessionId: 's2' },
      ],
      {
        sessionIds: new Set(),
        firearmIds: new Set(),
        licenseIds: new Set(),
        firearmNames: new Set(),
        ammoLotNames: new Set(),
        tagNames: new Set(),
      },
    );

    expect(plan.tags).toEqual([{ name: 'KM', action: 'create' }]);
  });
});

describe('buildDryRunPlan — firearms and licenses the file carries (#314)', () => {
  const firearm: FirearmExport = {
    id: 'f1',
    make: 'Pardini',
    model: 'SP',
    caliber: '.22 LR',
    weaponType: 'pistol',
    isOwn: true,
    serialNumber: null,
    vapenId: null,
    loadSystem: null,
    notes: null,
    roundCount: 0,
    maintenanceIntervalRounds: null,
    roundsSinceMaintenance: 0,
  };
  const license: LicenseExport = {
    id: 'l1',
    firearmId: 'f1',
    licenseNumber: 'TEST-000.000/00-00',
    purpose: null,
    decidedOn: null,
    validUntil: null,
    conditions: null,
    authority: null,
  };

  it('plans create for a firearm and license the target DB has never seen', () => {
    const plan = buildDryRunPlan([group()], emptyIndex, {
      firearms: [firearm],
      licenses: [license],
    });
    expect(plan.firearms).toEqual([{ name: 'Pardini SP', action: 'create' }]);
    expect(plan.licenses).toEqual([{ name: 'TEST-000.000/00-00', action: 'create' }]);
  });

  it('plans reuse when the id is already here, whatever it is called', () => {
    const index: ExistingIndex = { ...emptyIndex, firearmIds: new Set(['f1']) };
    const plan = buildDryRunPlan([group()], index, { firearms: [firearm] });
    expect(plan.firearms).toEqual([{ name: 'Pardini SP', action: 'reuse' }]);
  });

  it('plans reuse when only the name matches — the same firearm, entered twice', () => {
    const index: ExistingIndex = { ...emptyIndex, firearmNames: new Set(['Pardini SP']) };
    const plan = buildDryRunPlan([group()], index, { firearms: [firearm] });
    expect(plan.firearms).toEqual([{ name: 'Pardini SP', action: 'reuse' }]);
  });

  it('plans reuse for a license id already here', () => {
    const index: ExistingIndex = { ...emptyIndex, licenseIds: new Set(['l1']) };
    const plan = buildDryRunPlan([group()], index, { licenses: [license] });
    expect(plan.licenses).toEqual([{ name: 'TEST-000.000/00-00', action: 'reuse' }]);
  });

  it('falls back to the license id when it has no number', () => {
    const plan = buildDryRunPlan([group()], emptyIndex, {
      licenses: [{ ...license, licenseNumber: null }],
    });
    expect(plan.licenses).toEqual([{ name: 'l1', action: 'create' }]);
  });

  it('counts a firearm once when a session also names it as free text', () => {
    // Otherwise the confirmation would offer to create two firearms where the
    // file describes one.
    const plan = buildDryRunPlan([group({ firearm: 'Pardini SP' })], emptyIndex, {
      firearms: [firearm],
    });
    expect(plan.firearms).toEqual([{ name: 'Pardini SP', action: 'create' }]);
  });

  it('counts a repeated firearm and license once each', () => {
    const plan = buildDryRunPlan([group()], emptyIndex, {
      firearms: [firearm, { ...firearm, id: 'f2' }],
      licenses: [license, { ...license, id: 'l2' }],
    });
    expect(plan.firearms).toHaveLength(1);
    expect(plan.licenses).toHaveLength(1);
  });
});
