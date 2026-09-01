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
  const pistol = createFirearm(db, {
    make: 'Pardini',
    model: 'K22',
    caliber: '.22 LR',
    weaponType: 'pistol',
    vapenId: 'SE1234567',
    loadSystem: 'Enkelskott',
    notes: 'C-klass precisionspistol',
    maintenanceIntervalRounds: 1000,
  });
  addFirearmGroup(db, { firearmId: pistol.id, groupId: 'spsf:C', isDefaultForGroup: true });
  logMaintenanceEvent(db, {
    firearmId: pistol.id,
    performedAt: isoDaysAgo(120),
    kind: 'Rengöring',
    notes: 'Grundlig rengöring efter tävlingssäsong',
  });
  addLicense(db, {
    firearmId: pistol.id,
    licenseNumber: 'A123.456/2024-01',
    purpose: 'Målskjutning',
    decidedOn: isoDaysAgo(180),
    validUntil: isoDaysFromNow(548), // ~18 months out
    authority: 'Polismyndigheten',
  });

  const airgun = createFirearm(db, {
    make: 'Steyr',
    model: 'LP10',
    caliber: '4.5 mm',
    weaponType: 'airgun',
  });
  addFirearmGroup(db, { firearmId: airgun.id, groupId: 'generic:airgun', isDefaultForGroup: true });

  // --- Ammo lots ------------------------------------------------------
  const factoryLot = createAmmoLot(db, {
    label: 'SK Standard Plus',
    caliber: '.22 LR',
    quantity: 500,
    purchasedOn: isoDaysAgo(150),
    isHandload: false,
    brand: 'SK',
    product: 'Standard Plus',
    lotNumber: 'L2024-08',
  });
  const handloadLot = createAmmoLot(db, {
    label: '.32 S&W Long wadcutter',
    caliber: '.32 S&W Long',
    quantity: 200,
    purchasedOn: isoDaysAgo(90),
    isHandload: true,
    bulletMake: 'Hi-Tek',
    bulletModel: 'WC',
    bulletWeightGr: 98,
    powder: 'Vihtavuori N320',
    powderChargeGr: 1.8,
    primer: 'CCI 500',
    brass: 'Starline',
    colMm: 31.75,
  });

  // --- Tags -------------------------------------------------------------
  const kmTag = getOrCreateTag(db, 'KM');
  const tavlingTag = getOrCreateTag(db, 'Tävling');
  const traningTag = getOrCreateTag(db, 'Träning');

  // --- Sessions (~30 over 6 months) --------------------------------------
  const sessionCount = 30;
  for (let i = 0; i < sessionCount; i++) {
    const daysAgo = Math.round((sessionCount - 1 - i) * (180 / (sessionCount - 1)));
    const isMilsnabb = i % 9 === 4; // a couple of milsnabb sessions
    const isChampionshipFinal = i === sessionCount - 3; // one session with a final
    const isCompetition = isChampionshipFinal || i % 5 === 0;
    const disciplineId = isMilsnabb ? 'spsf-milsnabb' : 'spsf-precision';
    const programId = isMilsnabb ? 'spsf-milsnabb' : 'spsf-precision';

    const session = createSession(db, {
      name: isChampionshipFinal
        ? 'KM Precision C'
        : `${isCompetition ? 'Tävling' : 'Träning'} ${isMilsnabb ? 'Militär snabbmatch' : 'Precision'}`,
      type: isCompetition ? 'competition' : 'training',
      disciplineId,
      programId,
      competitionLevel: isCompetition ? 'forening' : null,
      isChampionship: isChampionshipFinal,
      competitionName: isChampionshipFinal ? 'Klubbmästerskap' : null,
      weaponGroup: 'spsf:C',
      shooterClass: '2',
      firearmId: pistol.id,
      ammoLotId: i % 2 === 0 ? factoryLot.id : handloadLot.id,
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
      applyRoundCountDelta(db, pistol.id, 13 * 5);
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
      applyRoundCountDelta(db, pistol.id, 12 * 5);
      setSessionExtraRounds(db, session.id, 10);
      continue;
    }

    // freeform precision training/competition: a sighter + 4-6 scored series
    addPrecisionSeries(db, session.id, 1, rng, { isSighter: true });
    const scoredCount = 4 + Math.floor(rng() * 3);
    for (let p = 2; p <= scoredCount + 1; p++) addPrecisionSeries(db, session.id, p, rng);
    applyRoundCountDelta(db, pistol.id, (scoredCount + 1) * 5);
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
  db.delete(firearms).run();
  db.delete(ammoLots).run();
  db.delete(tags).run();
}
