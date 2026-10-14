import { describe, expect, it } from 'vitest';

import { newSeriesRow, newSessionRow, newShotRow, withRoundsAdded, withRoundsMoved } from './rows';

const NOW = '2026-10-07T10:00:00.000Z';

describe('new rows', () => {
  it('R1 a session row carries every column with the app defaults', () => {
    const row = newSessionRow('s1', NOW, {
      name: 'Training — 7 Oct 2026',
      type: 'competition',
      disciplineId: 'spsf-precision',
      programId: 'spsf-precision-standard',
      competitionLevel: 'krets',
      isChampionship: true,
      competitionName: 'KM',
      weaponGroup: 'spsf:C',
      shooterClass: '2',
      eventId: null,
      firearmId: 'f1',
      ammoLotId: 'a1',
      startedAt: '2026-10-06T08:30:00.000Z',
      location: 'Range',
      decimalScoring: true,
      seriesLength: 6,
    });
    expect(row).toEqual({
      id: 's1',
      created_at: NOW,
      updated_at: NOW,
      deleted_at: null,
      name: 'Training — 7 Oct 2026',
      type: 'competition',
      kind: 'series',
      series_entry_mode: 'ask',
      discipline_id: 'spsf-precision',
      program_id: 'spsf-precision-standard',
      competition_level: 'krets',
      is_championship: 1,
      competition_name: 'KM',
      weapon_group: 'spsf:C',
      shooter_class: '2',
      event_id: null,
      firearm_id: 'f1',
      ammo_lot_id: 'a1',
      started_at: '2026-10-06T08:30:00.000Z',
      location: 'Range',
      notes: null,
      ten_count: null,
      inner_ten_count: null,
      decimal_scoring: 1,
      series_length: 6,
      falt_result_mode: null,
      extra_rounds: null,
      external_source: null,
      external_ref: null,
      official_placement: null,
      official_standardmedalj: null,
    });
    const plain = newSessionRow('s2', NOW, {
      name: 'n',
      type: 'training',
      disciplineId: 'generic-rings',
      programId: null,
      competitionLevel: null,
      isChampionship: false,
      competitionName: null,
      weaponGroup: null,
      shooterClass: null,
      eventId: 'e1',
      firearmId: null,
      ammoLotId: null,
      startedAt: NOW,
      location: null,
      decimalScoring: false,
      seriesLength: null,
    });
    expect(plain).toMatchObject({ is_championship: 0, decimal_scoring: 0, event_id: 'e1' });
  });

  it('R2 a series row carries every column with the app defaults', () => {
    expect(newSeriesRow('r1', NOW, { sessionId: 's1', position: 2, isSighter: true })).toEqual({
      id: 'r1',
      created_at: NOW,
      updated_at: NOW,
      deleted_at: null,
      session_id: 's1',
      position: 2,
      is_sighter: 1,
      is_final: 0,
      photo_uri: null,
      photo_geometry: null,
      is_total_override: 0,
      total_override_tenths: null,
      total_override_shot_count: null,
      is_shoot_off: 0,
    });
    expect(
      newSeriesRow('r2', NOW, { sessionId: 's1', position: 1, isSighter: false }),
    ).toMatchObject({ is_sighter: 0 });
  });

  it('R3 a shot row; a value outside 0..109 throws RangeError', () => {
    expect(
      newShotRow('h1', NOW, { seriesId: 'r1', position: 3, valueTenths: 104, isInnerTen: true }),
    ).toEqual({
      id: 'h1',
      created_at: NOW,
      updated_at: NOW,
      deleted_at: null,
      series_id: 'r1',
      position: 3,
      value_tenths: 104,
      is_inner_ten: 1,
    });
    const at = (valueTenths: number) => () =>
      newShotRow('h', NOW, { seriesId: 'r', position: 1, valueTenths, isInnerTen: false });
    expect(at(0)()).toMatchObject({ value_tenths: 0, is_inner_ten: 0 });
    expect(at(109)()).toMatchObject({ value_tenths: 109 });
    expect(at(-1)).toThrow(/value_tenths must be an integer 0..109/);
    expect(at(110)).toThrow(RangeError);
    expect(at(9.5)).toThrow(RangeError);
  });
});

describe('withRoundsAdded', () => {
  const pulled = {
    id: 'f1',
    make: 'Pardini',
    round_count: 100,
    updated_at: '2026-01-01T00:00:00.000Z',
    a_column_from_a_newer_build: 'kept',
  };

  it('R4 adds n to the round counter (#727 M4: nothing else), sets updated_at and keeps unknown keys', () => {
    expect(withRoundsAdded(pulled, 10, NOW)).toEqual({
      ...pulled,
      round_count: 110,
      updated_at: NOW,
    });
    // The pulled payload is not mutated.
    expect(pulled.round_count).toBe(100);
  });

  it('R4 a missing counter counts from zero', () => {
    expect(withRoundsAdded({ id: 'f2' }, 3, NOW)).toEqual({
      id: 'f2',
      round_count: 3,
      updated_at: NOW,
    });
  });

  it('R5 withRoundsAdded with n = 0 returns null (no firearm row pushed)', () => {
    expect(withRoundsAdded(pulled, 0, NOW)).toBeNull();
    expect(() => withRoundsAdded(pulled, -1, NOW)).toThrow(/non-negative integer, got -1/);
    expect(() => withRoundsAdded(pulled, 1.5, NOW)).toThrow(RangeError);
  });
});

describe('withRoundsMoved (docs/specs/web-session-edit-spec.md E4)', () => {
  const pulled = {
    id: 'f1',
    round_count: 10,
    updated_at: '2026-01-01T00:00:00.000Z',
    a_column_from_a_newer_build: 'kept',
  };

  it('K11 moves the round counter by a signed delta, floored at 0 (#727 M4: nothing else), keeping unknown keys', () => {
    expect(withRoundsMoved(pulled, 5, NOW)).toEqual({
      ...pulled,
      round_count: 15,
      updated_at: NOW,
    });
    expect(withRoundsMoved(pulled, -4, NOW)).toEqual({
      ...pulled,
      round_count: 6,
      updated_at: NOW,
    });
    expect(withRoundsMoved({ id: 'f2' }, -2, NOW)).toEqual({
      id: 'f2',
      round_count: 0,
      updated_at: NOW,
    });
  });

  it('K11 a move of 0 is null; a fractional move is refused', () => {
    expect(withRoundsMoved(pulled, 0, NOW)).toBeNull();
    expect(() => withRoundsMoved(pulled, 0.5, NOW)).toThrow(/must be an integer, got 0.5/);
  });
});

describe('rounds-only and final rows (docs/specs/web-rounds-final-spec.md)', () => {
  const fields = {
    name: 'n',
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
    ammoLotId: null,
    startedAt: NOW,
    location: null,
    decimalScoring: false,
    seriesLength: null,
  };

  it("K1 a session row takes kind and extra_rounds; absent, they default to 'series' and null", () => {
    expect(newSessionRow('s', NOW, { ...fields, kind: 'rounds', extraRounds: 60 })).toMatchObject({
      kind: 'rounds',
      extra_rounds: 60,
    });
    expect(newSessionRow('s', NOW, { ...fields, extraRounds: 0 })).toMatchObject({
      kind: 'series',
      extra_rounds: 0,
    });
    expect(newSessionRow('s', NOW, fields)).toMatchObject({ kind: 'series', extra_rounds: null });
  });

  it('K2 a series row takes is_final; absent, it is 0', () => {
    const base = { sessionId: 's', position: 3, isSighter: false };
    expect(newSeriesRow('r', NOW, { ...base, isFinal: true })).toMatchObject({ is_final: 1 });
    expect(newSeriesRow('r', NOW, { ...base, isFinal: false })).toMatchObject({ is_final: 0 });
    expect(newSeriesRow('r', NOW, base)).toMatchObject({ is_final: 0 });
  });
});
