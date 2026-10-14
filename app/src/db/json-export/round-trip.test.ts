// docs/specs/m7-csv-spec.md behavior #21: seed a DB, export, wipe every
// table, import, and assert every score/volume statistic is identical.
import {
  meanTenths,
  scoredSeriesTotalsTenths,
  sessionResults,
  scoredShots,
  volumeShotCount,
  xCount,
  type StatsSeries,
} from '@shotledger/shared';
import { eq, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { createTestDb } from '../test-db';
import { addFirearmGroup } from '../queries/firearm-groups';
import { createAmmoLot } from '../queries/ammo-lots';
import { archiveFirearm, createFirearm, listFirearms } from '../queries/firearms';
import { addLicense, listLicenses } from '../queries/licenses';
import { addSeries, listSeriesForSession } from '../queries/series';
import { createSession, listExternalRefs, sumExtraRounds } from '../queries/sessions';
import { addShot, countVolumeRounds } from '../queries/shots';
import { addSessionTag, getOrCreateTag, listTagsForSession } from '../queries/tags';
import { listAllStatsSeries } from '../queries/stats';
import { sessionVolumeRounds } from '../queries/volume';
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
} from '../schema';
import type { Database } from '../types';
import { buildExportJson } from './build-export';
import { applyImport, dryRunImport } from './apply-import';

function seed(db: Database) {
  const firearm = createFirearm(db, {
    make: 'Pardini',
    model: 'SP',
    weaponType: 'pistol',
    caliber: '.22 LR',
    serialNumber: 'SN-0001',
    vapenId: 'SE-TEST-0001',
    loadSystem: 'halvautomat',
    isOwn: false,
    maintenanceIntervalRounds: 500,
    maintenanceIntervalMonths: 6,
  });
  addFirearmGroup(db, { firearmId: firearm.id, groupId: 'spsf:C' });
  const license = addLicense(db, {
    firearmId: firearm.id,
    licenseNumber: 'TEST-000.000/00-00',
    purpose: 'Målskjutning',
    decidedOn: '2026-01-15',
    validUntil: '2031-01-15',
    authority: 'Polismyndigheten',
  });
  const ammo = createAmmoLot(db, { label: 'SK Standard', caliber: '.22 LR' });

  // Session A: two scored series + a sighter, tagged, firearm/ammo linked.
  const sessionA = createSession(db, {
    name: 'Kvällsträning',
    type: 'training',
    disciplineId: 'precision',
    firearmId: firearm.id,
    ammoLotId: ammo.id,
    startedAt: '2026-08-01T18:00:00.000Z',
    decimalScoring: false,
  });
  const tag = getOrCreateTag(db, 'Träning');
  addSessionTag(db, sessionA.id, tag.id);
  const sighter = addSeries(db, { sessionId: sessionA.id, position: 1, isSighter: true });
  addShot(db, { seriesId: sighter.id, position: 1, valueTenths: 80 });
  const s1 = addSeries(db, { sessionId: sessionA.id, position: 2 });
  addShot(db, { seriesId: s1.id, position: 1, valueTenths: 90 });
  addShot(db, { seriesId: s1.id, position: 2, valueTenths: 100, isInnerTen: true });
  const s2 = addSeries(db, { sessionId: sessionA.id, position: 3 });
  addShot(db, { seriesId: s2.id, position: 1, valueTenths: 85 });

  // Session B: competition, empty series (no shots yet), no firearm/ammo.
  const sessionB = createSession(db, {
    name: 'Tävling',
    type: 'competition',
    disciplineId: 'precision',
    competitionLevel: 'krets',
    isChampionship: false,
    weaponGroup: 'spsf:C',
    shooterClass: '1',
    startedAt: '2026-08-10T10:00:00.000Z',
  });
  addSeries(db, { sessionId: sessionB.id, position: 1 });

  // Session C: extra-rounds-only plinking session, no series at all.
  const sessionC = createSession(db, {
    name: 'Provskjutning',
    type: 'training',
    disciplineId: 'precision',
    startedAt: '2026-08-15T09:00:00.000Z',
  });
  db.update(sessions).set({ extraRounds: 12 }).where(eq(sessions.id, sessionC.id)).run();

  return { firearm, license, ammo, sessionA, sessionB, sessionC };
}

/** Id-agnostic fingerprint of a StatsSeries list — ignores series/session
 * ids and firearm/ammo-lot ids (regenerated on import) but keeps every
 * scoring-relevant field and whether a firearm/ammo lot was linked. */
function seriesFingerprint(list: readonly StatsSeries[]) {
  return list
    .map((s) => ({
      startedAt: s.startedAt,
      disciplineId: s.disciplineId,
      weaponGroup: s.weaponGroup,
      shooterClass: s.shooterClass,
      hasFirearm: s.firearmId !== null,
      hasAmmoLot: s.ammoLotId !== null,
      isSighter: s.isSighter,
      isFinal: s.isFinal,
      shots: s.shots.map((sh) => [sh.valueTenths, sh.isInnerTen]),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function snapshot(db: Database) {
  const seriesList = listAllStatsSeries(db);
  const shots = scoredShots(seriesList);
  return {
    fingerprint: seriesFingerprint(seriesList),
    mean: meanTenths(shots),
    xCount: xCount(shots),
    volume: volumeShotCount(seriesList),
    volumeRounds: countVolumeRounds(db),
    extraRounds: sumExtraRounds(db),
    sessionTags: db
      .select()
      .from(sessions)
      .where(eq(sessions.deletedAt, sessions.deletedAt)) // no-op, keeps import tidy
      .all()
      .map((s) => ({
        name: s.name,
        tags: listTagsForSession(db, s.id)
          .map((t) => t.name)
          .sort(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function wipeEverything(db: Database) {
  for (const table of [
    shots,
    series,
    sessionTags,
    sessions,
    licenses,
    firearmGroups,
    maintenanceEvents,
    ammoLots,
    firearms,
    tags,
  ]) {
    db.delete(table).run();
  }
}

describe('CSV export -> wipe -> import round trip', () => {
  it('reproduces identical stats and volume metrics', () => {
    const db = createTestDb();
    seed(db);

    const before = snapshot(db);
    const json = buildExportJson(db, '1.0.0');

    wipeEverything(db);
    expect(listAllStatsSeries(db)).toEqual([]);

    const { plan, errors, groups } = dryRunImport(db, json);
    expect(errors).toEqual([]);
    expect(plan.sessions).toHaveLength(3);
    expect(plan.sessions.every((s) => s.action === 'create')).toBe(true);
    applyImport(db, groups);

    const after = snapshot(db);
    expect(after).toEqual(before);
  });

  it('matches an existing session id as update instead of duplicating it', () => {
    const db = createTestDb();
    const { sessionA } = seed(db);
    const json = buildExportJson(db, '1.0.0');

    // Don't wipe — re-import into the same (populated) DB.
    const { plan, errors, groups } = dryRunImport(db, json);
    expect(errors).toEqual([]);
    const sessionAPlan = plan.sessions.find((s) => s.sessionId === sessionA.id);
    expect(sessionAPlan?.action).toBe('update');

    const before = snapshot(db);
    applyImport(db, groups);
    // Re-importing the same export onto itself must not create duplicate
    // sessions/series/shots — session count stays at 3, stats unchanged.
    const sessionCount = db.select().from(sessions).all().length;
    expect(sessionCount).toBe(3);
    expect(snapshot(db)).toEqual(before);
  });
});

describe('firearms and licenses cross with the sessions (#314)', () => {
  it('rebuilds them field for field in an emptied database', () => {
    const db = createTestDb();
    const { firearm, license } = seed(db);
    const json = buildExportJson(db, '1.0.0');

    wipeEverything(db);
    const { plan, errors, groups, records } = dryRunImport(db, json);
    expect(errors).toEqual([]);
    expect(plan.firearms).toEqual([{ name: 'Pardini SP', action: 'create' }]);
    expect(plan.licenses).toEqual([{ name: 'TEST-000.000/00-00', action: 'create' }]);
    applyImport(db, groups, records);

    const [restored] = listFirearms(db);
    expect(restored).toMatchObject({
      id: firearm.id,
      make: 'Pardini',
      model: 'SP',
      caliber: '.22 LR',
      weaponType: 'pistol',
      isOwn: false,
      serialNumber: 'SN-0001',
      vapenId: 'SE-TEST-0001',
      loadSystem: 'halvautomat',
      maintenanceIntervalRounds: 500,
      archivedAt: null,
      maintenanceIntervalMonths: 6,
    });
    expect(listLicenses(db, firearm.id)).toMatchObject([
      {
        id: license.id,
        licenseNumber: 'TEST-000.000/00-00',
        purpose: 'Målskjutning',
        decidedOn: '2026-01-15',
        validUntil: '2031-01-15',
        authority: 'Polismyndigheten',
      },
    ]);
  });

  it('keeps an archived firearm archived, with its sessions (#799)', () => {
    const db = createTestDb();
    const { firearm, sessionA } = seed(db);
    const archivedAt = archiveFirearm(db, firearm.id)!.archivedAt;
    const json = buildExportJson(db, '1.0.0');

    wipeEverything(db);
    const { groups, records } = dryRunImport(db, json);
    applyImport(db, groups, records);

    expect(listFirearms(db)[0]?.archivedAt).toBe(archivedAt);
    const imported = db.select().from(sessions).where(eq(sessions.id, sessionA.id)).get();
    expect(imported?.firearmId).toBe(firearm.id);
  });

  it('links the session to the firearm the file names by id', () => {
    const db = createTestDb();
    const { firearm, sessionA } = seed(db);
    const json = buildExportJson(db, '1.0.0');

    wipeEverything(db);
    const { groups, records } = dryRunImport(db, json);
    applyImport(db, groups, records);

    const imported = db.select().from(sessions).where(eq(sessions.id, sessionA.id)).get();
    expect(imported?.firearmId).toBe(firearm.id);
  });

  it('re-importing onto itself reuses both rather than duplicating them', () => {
    const db = createTestDb();
    const { firearm } = seed(db);
    const json = buildExportJson(db, '1.0.0');

    const { plan, groups, records } = dryRunImport(db, json);
    expect(plan.firearms).toEqual([{ name: 'Pardini SP', action: 'reuse' }]);
    expect(plan.licenses).toEqual([{ name: 'TEST-000.000/00-00', action: 'reuse' }]);
    applyImport(db, groups, records);

    expect(listFirearms(db)).toHaveLength(1);
    expect(listLicenses(db, firearm.id)).toHaveLength(1);
  });

  it('drops a license whose firearm the file does not carry', () => {
    // The row has nowhere to hang: licenses.firearm_id is NOT NULL and a
    // foreign key, so a guessed target would be worse than no row at all.
    const db = createTestDb();
    seed(db);
    const json = buildExportJson(db, '1.0.0');
    const envelope = JSON.parse(json) as { firearms: unknown[] };
    envelope.firearms = [];

    wipeEverything(db);
    const { groups, records } = dryRunImport(db, JSON.stringify(envelope));
    applyImport(db, groups, records);

    expect(db.select().from(licenses).all()).toEqual([]);
    // The session still finds its firearm by name — the fallback the string
    // field exists for.
    expect(listFirearms(db).map((f) => f.make)).toEqual(['Pardini']);
  });
});

it('keeps the shots per series chosen at creation across export and import', () => {
  const db = createTestDb();
  createSession(db, {
    name: 'Fempass',
    type: 'training',
    disciplineId: 'generic-rings',
    startedAt: '2026-09-01T18:00:00.000Z',
    seriesLength: 5,
  });
  const json = buildExportJson(db, '1.0.0');

  wipeEverything(db);
  const { errors, groups } = dryRunImport(db, json);
  expect(errors).toEqual([]);
  applyImport(db, groups);

  expect(
    db
      .select()
      .from(sessions)
      .all()
      .map((s) => s.seriesLength),
  ).toEqual([5]);
});

describe('a series saved as a total only (#563)', () => {
  function seedTotalOnly(db: Database) {
    const firearm = createFirearm(db, { make: 'Walther', model: 'GSP' });
    const session = createSession(db, {
      name: 'Webshooter-resultat',
      type: 'competition',
      disciplineId: 'precision',
      firearmId: firearm.id,
      startedAt: '2026-08-20T09:00:00.000Z',
    });
    // Webshooter gives a shot count with the total; ShotLog gives none.
    addSeries(db, {
      sessionId: session.id,
      position: 1,
      isTotalOverride: true,
      totalOverrideTenths: 470,
      totalOverrideShotCount: 5,
    });
    addSeries(db, {
      sessionId: session.id,
      position: 2,
      isTotalOverride: true,
      totalOverrideTenths: 450,
      totalOverrideShotCount: null,
    });
    return { firearm, session };
  }

  function totals(db: Database, sessionId: string) {
    const rows = listSeriesForSession(db, sessionId).map((s) => ({
      isSighter: s.isSighter === 1,
      isFinal: s.isFinal === 1,
      shots: [],
      totalOverride: { tenths: s.totalOverrideTenths!, shotCount: s.totalOverrideShotCount ?? 0 },
    }));
    return {
      seriesTotals: rows.map((s) => s.totalOverride.tenths),
      sessionTotal: sessionResults(rows).totalTenths,
      // ShotLog's series has no shot count, so statistics leave it out.
      statsSeriesTotals: scoredSeriesTotalsTenths(listAllStatsSeries(db)),
      volume: sessionVolumeRounds(db, sessionId),
    };
  }

  it('keeps its total and its volume across export, wipe and import', () => {
    const db = createTestDb();
    const { session } = seedTotalOnly(db);
    const before = totals(db, session.id);
    expect(before).toEqual({
      seriesTotals: [470, 450],
      sessionTotal: 920,
      statsSeriesTotals: [470],
      volume: 10,
    });

    const json = buildExportJson(db, '1.0.0');
    wipeEverything(db);
    const { plan, errors, groups, records } = dryRunImport(db, json);
    expect(errors).toEqual([]);
    expect(plan.sessions[0]?.shotCount).toBe(10);
    applyImport(db, groups, records);

    expect(totals(db, session.id)).toEqual(before);
    expect(db.select().from(series).all()).toMatchObject([
      { isTotalOverride: 1, totalOverrideTenths: 470, totalOverrideShotCount: 5 },
      { isTotalOverride: 1, totalOverrideTenths: 450, totalOverrideShotCount: null },
    ]);
  });

  it('re-importing onto itself leaves the firearm counter where it was', () => {
    const db = createTestDb();
    const { firearm } = seedTotalOnly(db);
    db.update(firearms).set({ roundCount: 10 }).where(eq(firearms.id, firearm.id)).run();
    const json = buildExportJson(db, '1.0.0');

    const { groups, records } = dryRunImport(db, json);
    applyImport(db, groups, records);

    expect(listFirearms(db)[0]?.roundCount).toBe(10);
  });
});

describe('kind, ten counts and external refs survive export, wipe and import (#756)', () => {
  function seedImported(db: Database) {
    const rounds = createSession(db, {
      name: 'Inskjutning',
      type: 'training',
      kind: 'rounds',
      disciplineId: 'precision',
      startedAt: '2026-08-21T09:00:00.000Z',
    });
    db.update(sessions).set({ extraRounds: 40 }).where(eq(sessions.id, rounds.id)).run();
    const shotlog = createSession(db, {
      name: 'ShotLog-resultat',
      type: 'training',
      disciplineId: 'precision',
      startedAt: '2026-08-22T09:00:00.000Z',
      externalSource: 'shotlog',
      externalRef: '00000000deadbeef',
    });
    addSeries(db, {
      sessionId: shotlog.id,
      position: 1,
      isTotalOverride: true,
      totalOverrideTenths: 4500,
      totalOverrideShotCount: null,
    });
    const webshooter = createSession(db, {
      name: 'Webshooter-tävling',
      type: 'competition',
      disciplineId: 'precision',
      startedAt: '2026-08-23T09:00:00.000Z',
      externalSource: 'webshooter',
      externalRef: '100:200',
      officialPlacement: 2,
      officialStandardMedal: 'guld',
    });
    return { rounds, shotlog, webshooter };
  }

  const columns = (db: Database) =>
    db
      .select({
        id: sessions.id,
        kind: sessions.kind,
        extraRounds: sessions.extraRounds,
        externalSource: sessions.externalSource,
        externalRef: sessions.externalRef,
        officialPlacement: sessions.officialPlacement,
        officialStandardMedal: sessions.officialStandardMedal,
      })
      .from(sessions)
      .orderBy(sessions.startedAt)
      .all();

  it('writes each column back as it was', () => {
    const db = createTestDb();
    seedImported(db);
    const before = columns(db);
    const json = buildExportJson(db, '1.0.0');

    wipeEverything(db);
    const { errors, groups, records } = dryRunImport(db, json);
    expect(errors).toEqual([]);
    applyImport(db, groups, records);

    expect(columns(db)).toEqual(before);
    expect(before.map((s) => s.kind)).toEqual(['rounds', 'series', 'series']);
  });

  it('S5 keeps a shoot-off series flagged', () => {
    const db = createTestDb();
    const { webshooter } = seedImported(db);
    addSeries(db, {
      sessionId: webshooter.id,
      position: 1,
      isShootOff: true,
      isTotalOverride: true,
      totalOverrideTenths: 480,
      totalOverrideShotCount: 5,
    });
    const json = buildExportJson(db, '1.0.0');

    wipeEverything(db);
    const { groups, records } = dryRunImport(db, json);
    applyImport(db, groups, records);

    const imported = db.select().from(series).where(isNull(series.deletedAt)).all();
    expect(imported.filter((s) => s.isShootOff === 1).map((s) => s.totalOverrideTenths)).toEqual([
      480,
    ]);
  });

  it('leaves the refs where a later WebShooter or ShotLog import looks for them', () => {
    const db = createTestDb();
    const { shotlog, webshooter } = seedImported(db);
    const json = buildExportJson(db, '1.0.0');

    wipeEverything(db);
    const { groups, records } = dryRunImport(db, json);
    applyImport(db, groups, records);

    expect(listExternalRefs(db).filter((r) => r.externalRef !== null)).toEqual([
      { id: shotlog.id, externalSource: 'shotlog', externalRef: '00000000deadbeef' },
      { id: webshooter.id, externalSource: 'webshooter', externalRef: '100:200' },
    ]);
  });
});
