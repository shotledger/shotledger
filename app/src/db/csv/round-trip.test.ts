// docs/specs/m7-csv-spec.md behavior #21: seed a DB, export, wipe every
// table, import, and assert every score/volume statistic is identical.
import {
  meanTenths,
  scoredShots,
  volumeShotCount,
  xCount,
  type StatsSeries,
} from '@shotledger/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { createTestDb } from '../test-db';
import { addFirearmGroup } from '../queries/firearm-groups';
import { createAmmoLot } from '../queries/ammo-lots';
import { createFirearm } from '../queries/firearms';
import { addSeries } from '../queries/series';
import { createSession, sumExtraRounds } from '../queries/sessions';
import { addShot, countVolumeRounds } from '../queries/shots';
import { addSessionTag, getOrCreateTag, listTagsForSession } from '../queries/tags';
import { listAllStatsSeries } from '../queries/stats';
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
import { buildExportCsv } from './build-export';
import { applyImport, dryRunImport } from './apply-import';

function seed(db: Database) {
  const firearm = createFirearm(db, { make: 'Pardini', model: 'SP', weaponType: 'pistol' });
  addFirearmGroup(db, { firearmId: firearm.id, groupId: 'spsf:C' });
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

  return { firearm, ammo, sessionA, sessionB, sessionC };
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
    const csv = buildExportCsv(db);

    wipeEverything(db);
    expect(listAllStatsSeries(db)).toEqual([]);

    const { plan, errors, groups } = dryRunImport(db, csv);
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
    const csv = buildExportCsv(db);

    // Don't wipe — re-import into the same (populated) DB.
    const { plan, errors, groups } = dryRunImport(db, csv);
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
