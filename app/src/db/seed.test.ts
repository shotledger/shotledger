import {
  isCaliberPreset,
  isLoadSystemCode,
  licenseStatus,
  parseLocalDay,
} from '@shotledger/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { listAmmoLots } from './queries/ammo-lots';
import { listFirearmGroups } from './queries/firearm-groups';
import { listFirearms } from './queries/firearms';
import { latestLicense } from './queries/licenses';
import { listSessions, sumExtraRounds } from './queries/sessions';
import { listTags } from './queries/tags';
import { faltStations, series, shots } from './schema';
import { seedDemoData, wipeDemoData } from './seed';
import { createTestDb } from './test-db';
import type { Database } from './types';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

function firearmByModel(model: string) {
  const firearm = listFirearms(db).find((f) => f.model === model);
  expect(firearm, `no seeded firearm with model ${model}`).toBeDefined();
  return firearm!;
}

/** Shot fields the deterministic PRNG decides — ids and timestamps are not. */
function sortableShot(row: { position: number; valueTenths: number; isInnerTen: number }) {
  return { position: row.position, valueTenths: row.valueTenths, isInnerTen: row.isInnerTen };
}

function groupIds(firearmId: string) {
  return listFirearmGroups(db, firearmId)
    .map((g) => g.groupId)
    .sort();
}

describe('seedDemoData', () => {
  it('creates the 4 demo firearms', () => {
    seedDemoData(db);
    expect(listFirearms(db).map((f) => `${f.make} ${f.model}`)).toEqual([
      'CZ Tactical Sport 2 Orange',
      'Feinwerkbau AW93',
      'Feinwerkbau P8X',
      'Manurhin MR73 Sport',
    ]);
    // Demo data speaks the closed vocabularies, not free text: a canonical
    // caliber and a language-neutral load-system code.
    const firearms = listFirearms(db);
    expect(firearms.every((f) => f.caliber === null || isCaliberPreset(f.caliber))).toBe(true);
    expect(firearms.every((f) => f.loadSystem === null || isLoadSystemCode(f.loadSystem))).toBe(
      true,
    );
  });

  it('registers each firearm in the vapengrupper it may actually be used in', () => {
    seedDemoData(db);
    expect(groupIds(firearmByModel('AW93').id)).toEqual(['spsf:C']);
    expect(groupIds(firearmByModel('Tactical Sport 2 Orange').id)).toEqual(['spsf:A']);
    // R is "Ej tillämplig" in precision (SHB F.4.4) — the revolver is B there.
    expect(groupIds(firearmByModel('MR73 Sport').id)).toEqual(['spsf:B', 'spsf:R']);
    expect(groupIds(firearmByModel('P8X').id)).toEqual(['generic:airgun']);
  });

  it('licenses every cartridge firearm; the ~10 J airgun needs none', () => {
    seedDemoData(db);
    for (const model of ['AW93', 'Tactical Sport 2 Orange', 'MR73 Sport']) {
      expect(latestLicense(db, firearmByModel(model).id), model).toBeDefined();
    }
    expect(latestLicense(db, firearmByModel('P8X').id)).toBeUndefined();
  });

  it('stores license dates as the bare YYYY-MM-DD real licenses carry', () => {
    seedDemoData(db);
    for (const model of ['AW93', 'Tactical Sport 2 Orange', 'MR73 Sport']) {
      const license = latestLicense(db, firearmByModel(model).id)!;
      for (const value of [license.decidedOn, license.validUntil]) {
        expect(parseLocalDay(value!), `${model}: ${value}`).not.toBeNull();
      }
      expect(licenseStatus(license.validUntil), model).toBe('valid');
    }
  });

  it('exercises vapengrupp C, which only a .22 LR gun may enter', () => {
    seedDemoData(db);
    const c = listSessions(db).filter((s) => s.weaponGroup === 'spsf:C');
    expect(c.length).toBeGreaterThan(0);
    for (const session of c) {
      expect(session.firearmId).toBe(firearmByModel('AW93').id);
    }
  });

  it('never seeds anything that could pass for a real license or serial', () => {
    seedDemoData(db);
    for (const firearm of listFirearms(db)) {
      const license = latestLicense(db, firearm.id);
      for (const value of [firearm.serialNumber, firearm.vapenId, license?.licenseNumber]) {
        if (value != null) expect(value, value).toMatch(/^DEMO-/u);
      }
    }
    for (const lot of listAmmoLots(db)) {
      if (lot.lotNumber != null) expect(lot.lotNumber).toMatch(/^DEMO-/u);
    }
  });

  it('creates the 5 ammo lots, 3 factory and 2 handload', () => {
    seedDemoData(db);
    const lots = listAmmoLots(db);
    expect(lots.map((l) => l.label).sort()).toEqual(
      [
        '.38 Spl handload',
        '9 mm handload',
        'Fiocchi 9 mm',
        'SK Pistol Match',
        'SK Pistol Match Special',
      ].sort(),
    );
    // The label is the lot's name only: the load is read from the recipe
    // columns, so a label that repeats it would render the recipe twice.
    for (const lot of lots) {
      expect(lot.label, lot.label).not.toContain('/');
      expect(lot.label, lot.label).not.toMatch(/\bgr\b/u);
    }
    expect(lots.filter((l) => l.isHandload === 0)).toHaveLength(3);
    const handloads = lots.filter((l) => l.isHandload === 1);
    expect(handloads).toHaveLength(2);
    for (const handload of handloads) {
      expect(handload.powder, handload.label).toBeTruthy();
      expect(handload.powderChargeGr, handload.label).toBeTruthy();
      expect(handload.bulletMake, handload.label).toBe('H&N');
      expect(handload.bulletWeightGr, handload.label).toBeTruthy();
      // Load data the maintainer did not supply stays NULL — never invented.
      expect(handload.primer, handload.label).toBeNull();
      expect(handload.brass, handload.label).toBeNull();
      expect(handload.colMm, handload.label).toBeNull();
    }
    expect(lots.every((l) => l.caliber === null || isCaliberPreset(l.caliber))).toBe(true);
  });

  it('creates ~30 sessions with a mix of training/competition and one final', () => {
    seedDemoData(db);
    const sessions = listSessions(db);
    // 30 ring sessions, the four fält rounds, two helmatch and one figurskjutning.
    expect(sessions.length).toBe(37);
    expect(sessions.filter((s) => s.disciplineId === 'spsf-helmatch')).toHaveLength(2);
    expect(sessions.some((s) => s.type === 'competition')).toBe(true);
    expect(sessions.some((s) => s.type === 'training')).toBe(true);
    expect(sessions.some((s) => s.disciplineId === 'spsf-milsnabb')).toBe(true);
    expect(sessions.some((s) => s.isChampionship === 1)).toBe(true);
  });

  it('gives the championship a shoot-off after its final (#727)', () => {
    seedDemoData(db);
    const championship = listSessions(db).find((s) => s.isChampionship === 1)!;
    const rows = db.select().from(series).all();
    const own = rows.filter((row) => row.sessionId === championship.id);
    expect(own.filter((row) => row.isShootOff === 1).map((row) => row.position)).toEqual([13]);
    expect(rows.filter((row) => row.isShootOff === 1)).toHaveLength(1);
  });

  it('exercises every firearm and every ammo lot', () => {
    seedDemoData(db);
    const sessions = listSessions(db);
    for (const firearm of listFirearms(db)) {
      expect(
        sessions.some((s) => s.firearmId === firearm.id),
        firearm.model,
      ).toBe(true);
    }
    for (const lot of listAmmoLots(db)) {
      expect(
        sessions.some((s) => s.ammoLotId === lot.id),
        lot.label,
      ).toBe(true);
    }
  });

  it("every session's vapengrupp is one its firearm is registered in", () => {
    seedDemoData(db);
    for (const session of listSessions(db)) {
      expect(session.firearmId).toBeTruthy();
      expect(groupIds(session.firearmId!), session.name).toContain(session.weaponGroup);
    }
  });

  it('milsnabb is only ever logged with a gun that can shoot it (never C, never air)', () => {
    seedDemoData(db);
    const milsnabb = listSessions(db).filter((s) => s.disciplineId === 'spsf-milsnabb');
    expect(milsnabb.length).toBeGreaterThan(0);
    for (const session of milsnabb) {
      expect(['spsf:A', 'spsf:C', 'spsf:R']).toContain(session.weaponGroup);
    }
  });

  it('air-pistol sessions are freeform and carry no klass or ammo lot', () => {
    seedDemoData(db);
    const airgun = listSessions(db).filter((s) => s.weaponGroup === 'generic:airgun');
    expect(airgun.length).toBeGreaterThan(0);
    for (const session of airgun) {
      expect(session.disciplineId).toBe('generic-rings');
      expect(session.programId).toBeNull(); // generic-rings has no program
      expect(session.shooterClass).toBeNull(); // generic disciplines have no klass
      expect(session.ammoLotId).toBeNull();
      expect([firearmByModel('AW93').id, firearmByModel('P8X').id]).toContain(session.firearmId);
    }
  });

  it('is reproducible: two seeds of a fresh db produce identical scores', () => {
    seedDemoData(db);
    const first = db.select().from(shots).all().map(sortableShot);
    const other = createTestDb();
    seedDemoData(other);
    expect(other.select().from(shots).all().map(sortableShot)).toEqual(first);
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
    expect(listSessions(db)).toHaveLength(37);
    expect(listFirearms(db)).toHaveLength(4);
    expect(listAmmoLots(db)).toHaveLength(5);
    expect(listFirearmGroups(db, firearmByModel('MR73 Sport').id)).toHaveLength(2);
  });
});

describe('seedDemoData — fält', () => {
  it('seeds four fält rounds whose stations each show a case', () => {
    seedDemoData(db);
    const falt = listSessions(db).filter((s) => s.disciplineId === 'spsf-falt');
    expect(falt.map((s) => s.name).sort()).toEqual([
      'Fält-KM',
      'Kretsfält',
      'Kretsfält vår',
      'Poängfält',
    ]);
    const stations = db.select().from(faltStations).all();
    expect(stations).toHaveLength(8 + 10 + 8 + 9);
    expect(stations.filter((s) => s.isScratched === 1)).toHaveLength(2);
    expect(stations.filter((s) => s.isShootOff === 1)).toHaveLength(1);
    expect(stations.filter((s) => s.points !== null)).toHaveLength(2);
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
    expect(db.select().from(faltStations).all()).toHaveLength(0);
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

  it('gives some sessions unscored extra rounds', () => {
    seedDemoData(db);
    expect(sumExtraRounds(db)).toBeGreaterThan(0);
    const withExtra = listSessions(db).filter((s) => (s.extraRounds ?? 0) > 0);
    expect(withExtra.length).toBeGreaterThan(0);
    expect(withExtra.length).toBeLessThan(30);
  });
});
