// Dev-only demo fixture (§3, M1). Invoked from the /dev debug route and by
// Maestro flows later — never imported from production screens.
import { addFirearmGroup } from './queries/firearm-groups';
import { addLicense } from './queries/licenses';
import { logMaintenanceEvent } from './queries/maintenance-events';
import { applyRoundCountDelta, setSessionExtraRounds } from './queries/round-count';
import { addSeries } from './queries/series';
import { createSession } from './queries/sessions';
import { addShot } from './queries/shots';
import { createAmmoLot } from './queries/ammo-lots';
import { createFirearm } from './queries/firearms';
import { createSightSetting } from './queries/sight-settings';
import { addSessionTag, getOrCreateTag } from './queries/tags';
import {
  ammoLots,
  firearmGroups,
  firearms,
  licenses,
  maintenanceEvents,
  series,
  sessionTags,
  sessions,
  shots,
  sightSettings,
  tags,
} from './schema';
import type { Database } from './types';

/** Deterministic PRNG (mulberry32) — reproducible demo scores across runs. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

/**
 * Adds one 5-shot precision-style series (values 6-10). About a third of the
 * tens are marked `is_inner_ten` — a centrumtia, i.e. what the `X` key writes
 * since spec Amendment A2; the rest are ordinary tens entered with `10`.
 */
function addPrecisionSeries(
  db: Database,
  sessionId: string,
  position: number,
  rng: () => number,
  opts: { isSighter?: boolean; isFinal?: boolean } = {},
) {
  const s = addSeries(db, { sessionId, position, ...opts });
  for (let i = 0; i < 5; i++) {
    const value = 6 + Math.floor(rng() * 5); // 6..10
    // Only a ten can be a centrumtia.
    const isInnerTen = value === 10 && rng() < 0.3;
    addShot(db, {
      seriesId: s.id,
      position: i + 1,
      valueTenths: value * 10,
      isInnerTen,
    });
  }
  return s;
}

export function seedDemoData(db: Database) {
  wipeDemoData(db);
  const rng = mulberry32(0x53504446); // 'SPDF'

  // --- Firearms -----------------------------------------------------
  // Vapengrupper follow SHB 2026 F.4 pp. 169-172 (precision) and D.4.4 p. 86 /
  // J.4 (R, fält and milsnabb only). Every licence number, serial and vapen-id
  // below is a DEMO- placeholder — nothing here may resemble a real licence.

  // Luftpistol: airguns sit outside the SPSF vapengrupper entirely (F.4 covers
  // cartridge handguns), so the generic group is the only one that fits.
  const airPistol = createFirearm(db, {
    make: 'Feinwerkbau',
    model: 'AW93',
    caliber: '4.5 mm',
    weaponType: 'airgun',
    serialNumber: 'DEMO-AW93-0001',
    loadSystem: 'Enkelskott',
    notes: 'Luftpistol 10 m',
  });
  addFirearmGroup(db, {
    firearmId: airPistol.id,
    groupId: 'generic:airgun',
    isDefaultForGroup: true,
  });
  createSightSetting(db, {
    firearmId: airPistol.id,
    label: 'Mitt-mitt',
    elevationClicks: -3,
    windageClicks: 1,
    makeActive: true,
  });

  // Grovkalibrig halvautomat: vapengrupp A (7,6-11,4 mm, 420-600 J, ≤1400 g,
  // pipa ≤153 mm — F.4.1). Maintainer's own classification.
  const sportPistol = createFirearm(db, {
    make: 'CZ',
    model: 'Tactical Sport 2 Orange',
    caliber: '9×19 mm',
    weaponType: 'pistol',
    vapenId: 'DEMO-VID-0002',
    serialNumber: 'DEMO-TS2O-0002',
    loadSystem: 'Halvautomat',
    maintenanceIntervalRounds: 1500,
  });
  addFirearmGroup(db, { firearmId: sportPistol.id, groupId: 'spsf:A', isDefaultForGroup: true });
  logMaintenanceEvent(db, {
    firearmId: sportPistol.id,
    performedAt: isoDaysAgo(60),
    kind: 'Rengöring',
    notes: 'Grundlig rengöring efter tävlingssäsong',
  });
  addLicense(db, {
    firearmId: sportPistol.id,
    licenseNumber: 'DEMO-2024-0002',
    purpose: 'Målskjutning',
    decidedOn: isoDaysAgo(200),
    validUntil: isoDaysFromNow(900), // ~30 months out
    authority: 'Polismyndigheten',
  });
  createSightSetting(db, {
    firearmId: sportPistol.id,
    label: 'Mitt-mitt',
    elevationClicks: 2,
    windageClicks: 0,
    makeActive: true,
  });

  // Grovkalibrig revolver: R in fält/milsnabb (D.4.4, J.4), but F.4.4 marks R
  // "Ej tillämplig" in precision — there it is grupp B like any other
  // grovkalibrigt enhandsvapen.
  const revolver = createFirearm(db, {
    make: 'Manurhin',
    model: 'MR73 Sport',
    caliber: '.357 Magnum',
    weaponType: 'revolver',
    vapenId: 'DEMO-VID-0003',
    serialNumber: 'DEMO-MR73-0003',
    loadSystem: 'Revolver',
    notes: 'Skjuts med .38 Special',
    maintenanceIntervalRounds: 1000,
  });
  addFirearmGroup(db, { firearmId: revolver.id, groupId: 'spsf:R', isDefaultForGroup: true });
  addFirearmGroup(db, { firearmId: revolver.id, groupId: 'spsf:B' });
  logMaintenanceEvent(db, {
    firearmId: revolver.id,
    performedAt: isoDaysAgo(150),
    kind: 'Service',
    notes: 'Kontroll av trumspel',
  });
  addLicense(db, {
    firearmId: revolver.id,
    licenseNumber: 'DEMO-2024-0003',
    purpose: 'Målskjutning',
    decidedOn: isoDaysAgo(1600),
    validUntil: isoDaysFromNow(270), // ~9 months out — exercises "expires soon"
    authority: 'Polismyndigheten',
  });
  createSightSetting(db, {
    firearmId: revolver.id,
    label: 'Mitt-mitt',
    elevationClicks: 6,
    windageClicks: -1,
    makeActive: true,
  });

  // Fripistol i .22 LR: vapengrupp C is ".22 LR only" (F.4.6).
  const freePistol = createFirearm(db, {
    make: 'Feinwerkbau',
    model: 'P8X',
    caliber: '.22 LR',
    weaponType: 'pistol',
    vapenId: 'DEMO-VID-0004',
    serialNumber: 'DEMO-P8X-0004',
    loadSystem: 'Enkelskott',
    notes: 'Fripistol',
    maintenanceIntervalRounds: 1000,
  });
  addFirearmGroup(db, { firearmId: freePistol.id, groupId: 'spsf:C', isDefaultForGroup: true });
  logMaintenanceEvent(db, {
    firearmId: freePistol.id,
    performedAt: isoDaysAgo(120),
    kind: 'Rengöring',
    notes: 'Pipa och slutstycke',
  });
  addLicense(db, {
    firearmId: freePistol.id,
    licenseNumber: 'DEMO-2024-0004',
    purpose: 'Målskjutning',
    decidedOn: isoDaysAgo(180),
    validUntil: isoDaysFromNow(548), // ~18 months out
    authority: 'Polismyndigheten',
  });
  createSightSetting(db, {
    firearmId: freePistol.id,
    label: 'Mitt-mitt',
    elevationClicks: 4,
    windageClicks: -2,
    makeActive: true,
  });
  createSightSetting(db, {
    firearmId: freePistol.id,
    label: 'Boll',
    elevationClicks: 10,
    windageClicks: -2,
  });

  // --- Ammo lots ------------------------------------------------------
  // Only what is actually known is filled in: no invented primer, brass or COL
  // on the handloads.
  const skPistolMatch = createAmmoLot(db, {
    label: 'SK Pistol Match',
    caliber: '.22 LR',
    quantity: 500,
    purchasedOn: isoDaysAgo(150),
    isHandload: false,
    brand: 'SK',
    product: 'Pistol Match',
    lotNumber: 'DEMO-LOT-01',
  });
  const skPistolMatchSpecial = createAmmoLot(db, {
    label: 'SK Pistol Match Special',
    caliber: '.22 LR',
    quantity: 500,
    purchasedOn: isoDaysAgo(60),
    isHandload: false,
    brand: 'SK',
    product: 'Pistol Match Special',
    lotNumber: 'DEMO-LOT-02',
  });
  const nineMmHandload = createAmmoLot(db, {
    label: '9 mm HN HP 124 gr / N320 4.1 gr',
    caliber: '9×19 mm',
    quantity: 400,
    isHandload: true,
    bulletMake: 'H&N',
    bulletModel: 'Hollow Point',
    bulletWeightGr: 124,
    powder: 'Vihtavuori N320',
    powderChargeGr: 4.1,
  });
  const wadcutterHandload = createAmmoLot(db, {
    label: '.38 Spl HN Wadcutter 125 gr / N310 3.1 gr',
    caliber: '.38 Special',
    quantity: 300,
    isHandload: true,
    bulletMake: 'H&N',
    bulletModel: 'Wadcutter',
    bulletWeightGr: 125,
    powder: 'Vihtavuori N310',
    powderChargeGr: 3.1,
  });
  const fiocchiNineMm = createAmmoLot(db, {
    label: 'Fiocchi 9 mm 115 gr',
    caliber: '9×19 mm',
    quantity: 500,
    purchasedOn: isoDaysAgo(90),
    isHandload: false,
    brand: 'Fiocchi',
    bulletWeightGr: 115,
    lotNumber: 'DEMO-LOT-03',
  });

  // --- Session setups: gun + vapengrupp + the ammo it chambers -----------
  // `milsnabbGroup: null` means the gun cannot shoot militär snabbmatch at all
  // (enkelskott, or an airgun); `lots: [null]` means it burns no tracked ammo.
  const setups = [
    {
      firearm: freePistol,
      disciplineId: 'spsf-precision' as const,
      precisionGroup: 'spsf:C',
      milsnabbGroup: null,
      shooterClass: '2' as string | null,
      lots: [skPistolMatch.id, skPistolMatchSpecial.id] as (string | null)[],
      label: 'Precision',
    },
    {
      firearm: sportPistol,
      disciplineId: 'spsf-precision' as const,
      precisionGroup: 'spsf:A',
      milsnabbGroup: 'spsf:A',
      shooterClass: '2' as string | null,
      lots: [nineMmHandload.id, fiocchiNineMm.id] as (string | null)[],
      label: 'Precision',
    },
    {
      firearm: revolver,
      disciplineId: 'spsf-precision' as const,
      precisionGroup: 'spsf:B',
      milsnabbGroup: 'spsf:R',
      shooterClass: '2' as string | null,
      lots: [wadcutterHandload.id] as (string | null)[],
      label: 'Precision',
    },
    {
      firearm: airPistol,
      disciplineId: 'generic-rings' as const,
      precisionGroup: 'generic:airgun',
      milsnabbGroup: null,
      shooterClass: null as string | null, // generic disciplines have no klass
      lots: [null] as (string | null)[],
      label: 'Luftpistol',
    },
  ];

  // --- Tags -------------------------------------------------------------
  const kmTag = getOrCreateTag(db, 'KM');
  const tavlingTag = getOrCreateTag(db, 'Tävling');
  const traningTag = getOrCreateTag(db, 'Träning');

  // --- Sessions (~30 over 6 months) --------------------------------------
  // Sessions rotate through `setups`, so every gun and every ammo lot is
  // exercised and the session's vapengrupp always matches the gun actually
  // used. The championship index is chosen to land on the C gun.
  const sessionCount = 30;
  for (let i = 0; i < sessionCount; i++) {
    const daysAgo = Math.round((sessionCount - 1 - i) * (180 / (sessionCount - 1)));
    const setup = setups[i % setups.length]!;
    const isMilsnabb = setup.milsnabbGroup !== null && i % 9 === 4;
    const isChampionshipFinal = i === sessionCount - 2; // one session with a final
    const isCompetition = isChampionshipFinal || i % 5 === 0;
    const disciplineId = isMilsnabb ? 'spsf-milsnabb' : setup.disciplineId;
    // 'generic-rings' has no predefined program — freeform training (§6.3).
    const programId = disciplineId === 'generic-rings' ? null : disciplineId;
    const firearm = setup.firearm;
    const lotId = setup.lots[Math.floor(i / setups.length) % setup.lots.length]!;

    const session = createSession(db, {
      name: isChampionshipFinal
        ? 'KM Precision C'
        : `${isCompetition ? 'Tävling' : 'Träning'} ${isMilsnabb ? 'Militär snabbmatch' : setup.label}`,
      type: isCompetition ? 'competition' : 'training',
      disciplineId,
      programId,
      competitionLevel: isCompetition ? 'forening' : null,
      isChampionship: isChampionshipFinal,
      competitionName: isChampionshipFinal ? 'Klubbmästerskap' : null,
      weaponGroup: isMilsnabb ? setup.milsnabbGroup : setup.precisionGroup,
      shooterClass: setup.shooterClass,
      firearmId: firearm.id,
      ammoLotId: lotId,
      startedAt: isoDaysAgo(daysAgo),
      location: 'Klubbens bana',
    });

    if (isCompetition) {
      addSessionTag(db, session.id, tavlingTag.id);
      if (isChampionshipFinal) addSessionTag(db, session.id, kmTag.id);
    } else {
      addSessionTag(db, session.id, traningTag.id);
    }

    if (isMilsnabb) {
      // fixed structure: 1 provserie + 12 scored series, 5 shots each
      addPrecisionSeries(db, session.id, 1, rng, { isSighter: true });
      for (let p = 2; p <= 13; p++) addPrecisionSeries(db, session.id, p, rng);
      // round counter (§4 M4): every shot including sighters, firearm-linked only
      applyRoundCountDelta(db, firearm.id, 13 * 5);
      // A few sessions carry unscored extra rounds (fouling/function checks):
      // volume only, never score (§A1.3).
      if (i % 3 === 0) setSessionExtraRounds(db, session.id, 5 + Math.floor(rng() * 10));
      continue;
    }

    if (isChampionshipFinal) {
      // championship precision: 1 sighter + 7 scored (grundomgång) + final
      // (own sighter + 3 scored) — §6.3
      addPrecisionSeries(db, session.id, 1, rng, { isSighter: true });
      for (let p = 2; p <= 8; p++) addPrecisionSeries(db, session.id, p, rng);
      addPrecisionSeries(db, session.id, 9, rng, { isSighter: true, isFinal: true });
      for (let p = 10; p <= 12; p++) addPrecisionSeries(db, session.id, p, rng, { isFinal: true });
      applyRoundCountDelta(db, firearm.id, 12 * 5);
      setSessionExtraRounds(db, session.id, 10);
      continue;
    }

    // freeform precision training/competition: a sighter + 4-6 scored series
    addPrecisionSeries(db, session.id, 1, rng, { isSighter: true });
    const scoredCount = 4 + Math.floor(rng() * 3);
    for (let p = 2; p <= scoredCount + 1; p++) addPrecisionSeries(db, session.id, p, rng);
    applyRoundCountDelta(db, firearm.id, (scoredCount + 1) * 5);
    if (i % 3 === 0) setSessionExtraRounds(db, session.id, 5 + Math.floor(rng() * 10));
  }
}

/** Deletes all demo data (hard delete — this is fixture data, not user data). */
export function wipeDemoData(db: Database) {
  db.delete(shots).run();
  db.delete(series).run();
  db.delete(sessionTags).run();
  db.delete(sessions).run();
  db.delete(licenses).run();
  db.delete(firearmGroups).run();
  db.delete(maintenanceEvents).run();
  db.delete(sightSettings).run();
  db.delete(firearms).run();
  db.delete(ammoLots).run();
  db.delete(tags).run();
}
