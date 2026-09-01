import { beforeEach, describe, expect, it } from 'vitest';

import { listAmmoLots } from './queries/ammo-lots';
import { listFirearms } from './queries/firearms';
import { latestLicense } from './queries/licenses';
import { listSessions, sumExtraRounds } from './queries/sessions';
import { listTags } from './queries/tags';
import { shots } from './schema';
import { seedDemoData, wipeDemoData } from './seed';
import { createTestDb } from './test-db';
import type { Database } from './types';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe('seedDemoData', () => {
  it('creates 2 firearms, one with a license valid ~18 months out', () => {
    seedDemoData(db);
    const firearms = listFirearms(db);
    expect(firearms).toHaveLength(2);
    const pistol = firearms.find((f) => f.weaponType === 'pistol');
    expect(pistol).toBeDefined();
    const license = latestLicense(db, pistol!.id);
    expect(license).toBeDefined();
    const monthsOut =
      (new Date(license!.validUntil!).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30);
    expect(monthsOut).toBeGreaterThan(12);
    expect(monthsOut).toBeLessThan(24);
  });

  it('creates 2 ammo lots, one factory and one handload', () => {
    seedDemoData(db);
    const lots = listAmmoLots(db);
    expect(lots).toHaveLength(2);
    expect(lots.some((l) => l.isHandload === 0)).toBe(true);
    const handload = lots.find((l) => l.isHandload === 1);
    expect(handload?.powder).toBeTruthy();
    expect(handload?.powderChargeGr).toBeTruthy();
    expect(handload?.colMm).toBeTruthy();
  });

  it('creates ~30 sessions with a mix of training/competition and one final', () => {
    seedDemoData(db);
    const sessions = listSessions(db);
    expect(sessions.length).toBe(30);
    expect(sessions.some((s) => s.type === 'competition')).toBe(true);
    expect(sessions.some((s) => s.type === 'training')).toBe(true);
    expect(sessions.some((s) => s.disciplineId === 'spsf-milsnabb')).toBe(true);
    expect(sessions.some((s) => s.isChampionship === 1)).toBe(true);
  });

  it('creates the KM, Tävling and Träning tags', () => {
    seedDemoData(db);
    expect(
      listTags(db)
        .map((t) => t.name)
        .sort(),
    ).toEqual(['KM', 'Träning', 'Tävling']);
  });

  it('is idempotent: re-running does not duplicate data', () => {
    seedDemoData(db);
    seedDemoData(db);
    expect(listSessions(db)).toHaveLength(30);
    expect(listFirearms(db)).toHaveLength(2);
  });
});

describe('wipeDemoData', () => {
  it('clears sessions, firearms, ammo lots and tags', () => {
    seedDemoData(db);
    wipeDemoData(db);
    expect(listSessions(db)).toHaveLength(0);
    expect(listFirearms(db)).toHaveLength(0);
    expect(listAmmoLots(db)).toHaveLength(0);
    expect(listTags(db)).toHaveLength(0);
  });
});

describe('seedDemoData — X and extra rounds (spec A1 §A1.3 / A2)', () => {
  it('marks some tens as centrumtior and never flags a non-ten', () => {
    seedDemoData(db);
    const shotRows = db.select().from(shots).all();
    const inner = shotRows.filter((row) => row.isInnerTen === 1);
    expect(inner.length).toBeGreaterThan(0);
    expect(inner.every((row) => row.valueTenths === 100)).toBe(true);
    // Ordinary tens exist too — X is not simply "every ten".
    expect(shotRows.some((row) => row.valueTenths === 100 && row.isInnerTen === 0)).toBe(true);
  });

  it('never writes the deprecated is_inner_ten_decimal flag (invariant A-N10)', () => {
    seedDemoData(db);
    expect(db.select().from(shots).all().every((row) => row.isInnerTenDecimal === 0)).toBe(true);
  });

  it('gives some sessions unscored extra rounds', () => {
    seedDemoData(db);
    expect(sumExtraRounds(db)).toBeGreaterThan(0);
    const withExtra = listSessions(db).filter((s) => (s.extraRounds ?? 0) > 0);
    expect(withExtra.length).toBeGreaterThan(0);
    expect(withExtra.length).toBeLessThan(30);
  });
});
