// Integration tests for the Webshooter import write path (integration spec
// §A), through the query layer, against synthetic fixtures only — no live
// API calls, no data from ~/.cache/webshooter, per the hard constraints in
// docs/specs/webshooter-core-spec.md §0 and docs/specs/webshooter-app-spec.md.
import { beforeEach, describe, expect, it } from 'vitest';
import type { ResultRow } from '@shotledger/shared/src/integrations/webshooter';

import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { createSession, getSession, updateSession } from './sessions';
import { listSeriesForSession } from './series';
import { getFirearm, createFirearm } from './firearms';
import { cacheManualClassMapping, classifyResultRow, importResultRow } from './webshooter';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

const COMPETITION = { name: 'KM Precision', date: '2026-05-10', resultsType: 'precision' as const };

function station(
  overrides: Partial<ResultRow['results'][number]> = {},
): ResultRow['results'][number] {
  return {
    id: 1,
    signups_id: 555,
    finals: 0,
    distinguish: 0,
    stations_id: 1,
    figure_hits: 5,
    hits: 5,
    points: 47,
    station_figure_hits: [1, 1, 1, 1, 1],
    deleted_at: null,
    ...overrides,
  };
}

function resultRow(overrides: Partial<ResultRow> = {}): ResultRow {
  return {
    id: 1001,
    competitions_id: 42,
    signups_id: 555,
    placement: 3,
    figure_hits: 35,
    hits: 35,
    points: 329,
    weaponclasses_id: 7,
    std_medal: 'S',
    signup: {
      id: 555,
      competitions_id: 42,
      patrols_id: 9,
      lane: 4,
      weaponclasses_id: 7,
      start_time: '2026-05-10 09:00:00',
      end_time: '2026-05-10 10:00:00',
    },
    weaponclass: {
      id: 7,
      weapongroups_id: 3,
      classname: 'C2',
      championship: 1,
      classname_general: 'C',
    },
    results: [
      station({ stations_id: 1, points: 47 }),
      station({ stations_id: 2, points: 46 }),
      station({ stations_id: 3, points: 48 }),
      station({ stations_id: 4, points: 47 }),
      station({ stations_id: 5, points: 45 }),
      station({ stations_id: 6, points: 47 }),
      station({ stations_id: 7, points: 49 }),
    ],
    results_finals: [],
    results_distinguish: [],
    ...overrides,
  };
}

describe('classifyResultRow', () => {
  it('is a new candidate when no matching session exists', () => {
    const candidate = classifyResultRow(db, resultRow(), COMPETITION);
    expect(candidate.verdict).toEqual({ kind: 'new' });
    expect(candidate.weaponGroup).toBe('spsf:C');
    expect(candidate.shooterClass).toBe('2');
    expect(candidate.disciplineId).toBe('spsf-precision');
  });

  it('is not-importable when the classname cannot be mapped and has no cached override', () => {
    const row = resultRow({
      weaponclass: {
        id: 9,
        weapongroups_id: 1,
        classname: 'OptR',
        championship: 0,
        classname_general: 'A',
      },
    });
    const candidate = classifyResultRow(db, row, COMPETITION);
    expect(candidate.verdict).toEqual({
      kind: 'not-importable',
      reason: 'class-mapping-unresolved',
    });
  });

  it('resolves via a cached manual mapping once one is confirmed (§A.8)', () => {
    const row = resultRow({
      weaponclass: {
        id: 9,
        weapongroups_id: 1,
        classname: 'OptR',
        championship: 0,
        classname_general: 'A',
      },
    });
    cacheManualClassMapping(db, 'OptR', { weaponGroup: 'spsf:A-opt', shooterClass: 'R' });
    const candidate = classifyResultRow(db, row, COMPETITION);
    expect(candidate.verdict).toEqual({ kind: 'new' });
    expect(candidate.weaponGroup).toBe('spsf:A-opt');
  });

  it('is not-importable (field-not-supported) for a fält competition (§A.9)', () => {
    const candidate = classifyResultRow(db, resultRow(), { ...COMPETITION, resultsType: 'field' });
    expect(candidate.verdict).toEqual({ kind: 'not-importable', reason: 'field-not-supported' });
  });

  it('is exact-duplicate when a session already carries this external_ref', () => {
    const row = resultRow();
    importResultRow(db, row, COMPETITION, {
      program: { disciplineId: 'spsf-precision', programId: 'spsf-precision' },
    });
    const candidate = classifyResultRow(db, row, COMPETITION);
    expect(candidate.verdict.kind).toBe('exact-duplicate');
  });

  it('surfaces a probable-match for a same-day, same-name, same-weapon-group manual session (§A.2)', () => {
    createSession(db, {
      name: 'KM Precision (manual entry)',
      type: 'competition',
      disciplineId: 'spsf-precision',
      competitionName: 'KM Precision',
      weaponGroup: 'spsf:C',
      startedAt: '2026-05-10T08:00:00.000Z',
    });
    const candidate = classifyResultRow(db, resultRow(), COMPETITION);
    expect(candidate.verdict.kind).toBe('probable-match');
  });
});

describe('importResultRow — fresh import', () => {
  it('creates a competition session with override series and the official result (§A.4/§A.5)', () => {
    const { sessionId, created } = importResultRow(db, resultRow(), COMPETITION, {
      program: { disciplineId: 'spsf-precision', programId: 'spsf-precision' },
    });
    expect(created).toBe(true);

    const session = getSession(db, sessionId);
    expect(session?.externalSource).toBe('webshooter');
    expect(session?.externalRef).toBe('webshooter:42:555');
    expect(session?.officialPlacement).toBe(3);
    expect(session?.officialStandardmedalj).toBe('silver');
    expect(session?.weaponGroup).toBe('spsf:C');
    expect(session?.shooterClass).toBe('2');

    const seriesRows = listSeriesForSession(db, sessionId);
    expect(seriesRows).toHaveLength(7);
    expect(seriesRows.every((s) => s.isTotalOverride === 1)).toBe(true);
    expect(seriesRows.every((s) => s.totalOverrideShotCount === 5)).toBe(true);
    expect(seriesRows[0]!.totalOverrideTenths).toBe(470); // 47 points -> 470 tenths
  });

  it('maps results_finals to isFinal series and results_distinguish to a särskjutning note (§A.6)', () => {
    const row = resultRow({
      results_finals: [station({ stations_id: 1, finals: 1, points: 50 })],
      results_distinguish: [station({ stations_id: 1, distinguish: 1, points: 10 })],
    });
    const { sessionId } = importResultRow(db, row, COMPETITION, {
      program: { disciplineId: 'spsf-precision', programId: 'spsf-precision' },
    });
    const seriesRows = listSeriesForSession(db, sessionId);
    const finalSeries = seriesRows.find((s) => s.isFinal === 1);
    const distinguishSeries = seriesRows.find((s) => s.note === 'särskjutning');
    expect(finalSeries?.totalOverrideTenths).toBe(500);
    expect(distinguishSeries?.totalOverrideTenths).toBe(100);
  });

  it('does not adjust extra_rounds by default (§A.7 default unchecked)', () => {
    const firearm = createFirearm(db, { make: 'Test', model: 'Gun' });
    const { sessionId } = importResultRow(db, resultRow(), COMPETITION, {
      program: { disciplineId: 'spsf-precision', programId: 'spsf-precision' },
    });
    expect(getSession(db, sessionId)?.extraRounds ?? null).toBeNull();
    expect(getFirearm(db, firearm.id)?.roundCount).toBe(0);
  });

  it('applies +5 sighter rounds per round when confirmed (§A.7)', () => {
    const firearm = createFirearm(db, { make: 'Test', model: 'Gun' });
    const { sessionId } = importResultRow(db, resultRow(), COMPETITION, {
      program: { disciplineId: 'spsf-precision', programId: 'spsf-precision' },
      applySighterRoundsForFirearmId: firearm.id,
    });
    // No final section -> 1 round -> +5.
    expect(getSession(db, sessionId)?.extraRounds).toBe(5);
  });

  it('assigns the chosen firearm and moves its round counter (§A.7 — a fresh import has no firearmId yet)', () => {
    const firearm = createFirearm(db, { make: 'Test', model: 'Gun' });
    const { sessionId } = importResultRow(db, resultRow(), COMPETITION, {
      program: { disciplineId: 'spsf-precision', programId: 'spsf-precision' },
      applySighterRoundsForFirearmId: firearm.id,
    });
    expect(getSession(db, sessionId)?.firearmId).toBe(firearm.id);
    expect(getFirearm(db, firearm.id)?.roundCount).toBe(5);
  });

  it('never overwrites an already-assigned firearm when applying sighter rounds', () => {
    const original = createFirearm(db, { make: 'Original', model: 'Gun' });
    const other = createFirearm(db, { make: 'Other', model: 'Gun' });
    const first = importResultRow(db, resultRow(), COMPETITION, {
      program: { disciplineId: 'spsf-precision', programId: 'spsf-precision' },
    });
    // Local enrichment before any sighter-rounds confirmation.
    updateSession(db, first.sessionId, { firearmId: original.id });

    importResultRow(db, resultRow(), COMPETITION, {
      program: { disciplineId: 'spsf-precision', programId: 'spsf-precision' },
      linkToSessionId: first.sessionId,
      applySighterRoundsForFirearmId: other.id,
    });
    expect(getSession(db, first.sessionId)?.firearmId).toBe(original.id);
    // The round-count delta still applies, to the ALREADY-linked firearm (never `other`).
    expect(getFirearm(db, original.id)?.roundCount).toBe(5);
    expect(getFirearm(db, other.id)?.roundCount).toBe(0);
  });

  it('applies +10 sighter rounds for a two-round championship (finals present, §A.7)', () => {
    const row = resultRow({ results_finals: [station({ stations_id: 1, finals: 1, points: 50 })] });
    const firearm = createFirearm(db, { make: 'Test', model: 'Gun' });
    const { sessionId } = importResultRow(db, row, COMPETITION, {
      program: { disciplineId: 'spsf-precision', programId: 'spsf-precision' },
      applySighterRoundsForFirearmId: firearm.id,
    });
    expect(getSession(db, sessionId)?.extraRounds).toBe(10);
  });
});

describe('importResultRow — confirmed heuristic link (§A.2)', () => {
  it('backfills external_ref onto the existing session rather than creating a new one', () => {
    const manual = createSession(db, {
      name: 'KM Precision (manual)',
      type: 'competition',
      disciplineId: 'spsf-precision',
      competitionName: 'KM Precision',
      weaponGroup: 'spsf:C',
      startedAt: '2026-05-10T08:00:00.000Z',
    });
    const { sessionId, created } = importResultRow(db, resultRow(), COMPETITION, {
      program: { disciplineId: 'spsf-precision', programId: 'spsf-precision' },
      linkToSessionId: manual.id,
    });
    expect(created).toBe(false);
    expect(sessionId).toBe(manual.id);
    expect(getSession(db, sessionId)?.externalRef).toBe('webshooter:42:555');
  });
});

describe('importResultRow — re-import field-level merge (§A.3)', () => {
  it('overwrites score fields but never clobbers an existing enrichment value', () => {
    const firearm = createFirearm(db, { make: 'Original', model: 'Firearm' });
    const first = importResultRow(db, resultRow(), COMPETITION, {
      program: { disciplineId: 'spsf-precision', programId: 'spsf-precision' },
    });
    // Local enrichment added after import.
    updateSession(db, first.sessionId, { firearmId: firearm.id, notes: 'My notes' });

    // Upstream correction: placement improves, medal upgrades.
    const corrected = resultRow({ placement: 1, std_medal: null });
    const { sessionId, created } = importResultRow(db, corrected, COMPETITION, {
      program: { disciplineId: 'spsf-precision', programId: 'spsf-precision' },
      linkToSessionId: first.sessionId,
    });

    expect(created).toBe(false);
    expect(sessionId).toBe(first.sessionId);
    const session = getSession(db, sessionId);
    expect(session?.officialPlacement).toBe(1);
    expect(session?.officialStandardmedalj).toBe('none');
    // Enrichment fields untouched.
    expect(session?.firearmId).toBe(firearm.id);
    expect(session?.notes).toBe('My notes');

    // Score-bearing series are replaced wholesale (new totals reflected).
    const seriesRows = listSeriesForSession(db, sessionId);
    expect(seriesRows).toHaveLength(7);
  });

  it('overwrites the competition date on re-import (score-bearing per §A.3)', () => {
    const first = importResultRow(db, resultRow(), COMPETITION, {
      program: { disciplineId: 'spsf-precision', programId: 'spsf-precision' },
    });
    const corrected = { ...COMPETITION, date: '2026-05-11' };
    importResultRow(db, resultRow(), corrected, {
      program: { disciplineId: 'spsf-precision', programId: 'spsf-precision' },
      linkToSessionId: first.sessionId,
    });
    expect(getSession(db, first.sessionId)?.startedAt.slice(0, 10)).toBe('2026-05-11');
  });

  it('never clobbers enrichment fields that were empty and then locally filled between two re-imports', () => {
    const first = importResultRow(db, resultRow(), COMPETITION, {
      program: { disciplineId: 'spsf-precision', programId: 'spsf-precision' },
    });
    expect(getSession(db, first.sessionId)?.notes ?? null).toBeNull();

    const firearm = createFirearm(db, { make: 'Local', model: 'Choice' });
    updateSession(db, first.sessionId, { firearmId: firearm.id });

    importResultRow(db, resultRow(), COMPETITION, {
      program: { disciplineId: 'spsf-precision', programId: 'spsf-precision' },
      linkToSessionId: first.sessionId,
    });
    expect(getSession(db, first.sessionId)?.firearmId).toBe(firearm.id);
  });
});
