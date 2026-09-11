import { describe, expect, it } from 'vitest';

import type { SessionImportGroup } from './import';
import { buildDryRunPlan, type ExistingIndex } from './plan';

const emptyIndex: ExistingIndex = {
  sessionIds: new Set(),
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
    firearm: null,
    ammoLot: null,
    startedAt: '2026-08-01T18:00:00.000Z',
    location: null,
    notes: null,
    decimalScoring: false,
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
          firearm: null,
          ammoLot: null,
          startedAt: '2026-01-01T00:00:00.000Z',
          location: null,
          notes: null,
          decimalScoring: false,
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
      firearm: null,
      ammoLot: null,
      startedAt: '2026-01-01T00:00:00.000Z',
      location: null,
      notes: null,
      decimalScoring: false,
      extraRounds: null,
      tags: ['KM', 'Nytt'],
      series: [],
    };
    const plan = buildDryRunPlan([group], {
      sessionIds: new Set(),
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
      firearm: null,
      ammoLot: null,
      startedAt: '2026-01-01T00:00:00.000Z',
      location: null,
      notes: null,
      decimalScoring: false,
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
        firearmNames: new Set(),
        ammoLotNames: new Set(),
        tagNames: new Set(),
      },
    );

    expect(plan.tags).toEqual([{ name: 'KM', action: 'create' }]);
  });
});
