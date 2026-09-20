// Glue layer (routine app work, not old-coder scope — see
// docs/specs/json-export-spec.md): builds an ExistingIndex from the DB, calls
// the pure dry-run planner, and — on confirm — applies the plan inside one
// transaction (spec criterion 13).
import { eq, isNull } from 'drizzle-orm';
import {
  buildDryRunPlan,
  firearmDisplayName,
  importSessionsFromJson,
  toImportGroups,
  type DryRunPlan,
  type FirearmExport,
  type ImportError,
  type ImportRecords,
  type LicenseExport,
  type SessionImportGroup,
} from '@shotledger/shared';

import { ammoLots, firearms, licenses, series, sessions, shots, tags } from '../schema';
import type { Database } from '../types';
import { softDeleteSeries } from '../queries/series';
import { listSeriesForSession } from '../queries/series';
import { softDeleteShot, listShotsForSeries } from '../queries/shots';
import { addSessionTag, getOrCreateTag } from '../queries/tags';
import { applyRoundCountDelta } from '../queries/round-count';
import { newId, nowIso } from '../util';

export interface ImportDryRun {
  plan: DryRunPlan;
  errors: ImportError[];
  groups: SessionImportGroup[];
  /** The file's firearms and licenses, to be applied alongside the groups. */
  records: ImportRecords;
}

/** Parses + validates + plans, without touching the DB. */
export function dryRunImport(db: Database, jsonText: string): ImportDryRun {
  const parsed = importSessionsFromJson(jsonText);
  // A file-level failure (not ours, newer, malformed) plans nothing at all —
  // unlike a bad session, which is skipped with the rest still importable.
  if ('code' in parsed) {
    return {
      plan: { sessions: [], firearms: [], licenses: [], ammoLots: [], tags: [] },
      errors: [parsed],
      groups: [],
      records: {},
    };
  }
  const groups = toImportGroups(parsed.sessions);
  const errors = parsed.errors;
  const records: ImportRecords = { firearms: parsed.firearms, licenses: parsed.licenses };

  const sessionIds = new Set(
    db
      .select({ id: sessions.id })
      .from(sessions)
      .where(isNull(sessions.deletedAt))
      .all()
      .map((r) => r.id),
  );
  const firearmRows = db
    .select({ id: firearms.id, make: firearms.make, model: firearms.model })
    .from(firearms)
    .where(isNull(firearms.deletedAt))
    .all();
  const firearmNames = new Set(firearmRows.map(firearmDisplayName));
  const firearmIds = new Set(firearmRows.map((f) => f.id));
  const licenseIds = new Set(
    db
      .select({ id: licenses.id })
      .from(licenses)
      .where(isNull(licenses.deletedAt))
      .all()
      .map((l) => l.id),
  );
  const ammoLotNames = new Set(
    db
      .select({ label: ammoLots.label })
      .from(ammoLots)
      .where(isNull(ammoLots.deletedAt))
      .all()
      .map((a) => a.label),
  );
  const tagNames = new Set(
    db
      .select({ name: tags.name })
      .from(tags)
      .where(isNull(tags.deletedAt))
      .all()
      .map((t) => t.name),
  );

  const plan = buildDryRunPlan(
    groups,
    { sessionIds, firearmIds, licenseIds, firearmNames, ammoLotNames, tagNames },
    records,
  );
  return { plan, errors, groups, records };
}

type CompetitionLevel = 'forening' | 'krets' | 'landsdel' | 'national' | 'riks';
const COMPETITION_LEVELS: readonly CompetitionLevel[] = [
  'forening',
  'krets',
  'landsdel',
  'national',
  'riks',
];

/** Narrows a free-form CSV value to the DB enum, dropping anything else
 * (a hand-edited file could contain garbage; the column has a CHECK). */
function toCompetitionLevel(value: string | null): CompetitionLevel | null {
  return value !== null && (COMPETITION_LEVELS as readonly string[]).includes(value)
    ? (value as CompetitionLevel)
    : null;
}

function splitFirearmName(name: string): { make: string; model: string } {
  const idx = name.indexOf(' ');
  if (idx === -1) return { make: name, model: '' };
  return { make: name.slice(0, idx), model: name.slice(idx + 1) };
}

/**
 * Applies a dry run's groups to the DB inside one transaction. Sessions
 * whose id already exists (non-deleted) are updated in place and their
 * series/shots resynced (old rows tombstoned, new ones created) — see
 * docs/specs/m7-csv-spec.md "Session id handling".
 *
 * The file's own firearms and licenses (issue #314) reconcile on their id and
 * fall back to the firearm's display name; ammo lots and tags, which have no
 * id in the file, still match on exact name or are created. Round counters on
 * a firearm that already exists here are left alone — a file is a record of
 * shooting, not the authority on how many rounds this device has counted.
 *
 * The sessions it creates do move those counters, though (#350). Logging a
 * session in the app adds its shots to the linked firearm's counters, and an
 * import that skipped that step left Rounds Fired and every maintenance
 * interval reading zero for the shooter with the most history — 11,615
 * attributed shots on the real-data pass. A session contributes its real shot
 * rows plus its unscored extra rounds; re-importing the same file moves the
 * counter by the difference rather than by the whole session again, so the
 * operation stays idempotent. A total-override series (Webshooter/ShotLog)
 * has no shot rows and still contributes nothing — the same convention
 * `deleteSeriesAndShots` already backs out on.
 */
export function applyImport(
  db: Database,
  groups: readonly SessionImportGroup[],
  records: ImportRecords = {},
): void {
  db.transaction((tx) => {
    const firearmIdByName = new Map<string, string>();
    const firearmIdByFileId = new Map<string, string>();
    const ammoLotIdByName = new Map<string, string>();
    const tagIdByName = new Map<string, string>();

    /** A firearm the file carries: its id wins, then its display name, then
     *  it is inserted keeping the file's id so a re-import is idempotent. */
    const upsertFirearm = (firearm: FirearmExport): string => {
      const name = firearmDisplayName(firearm);
      const now = nowIso();
      const descriptive = {
        make: firearm.make,
        model: firearm.model,
        caliber: firearm.caliber,
        weaponType: firearm.weaponType,
        isOwn: firearm.isOwn,
        serialNumber: firearm.serialNumber,
        vapenId: firearm.vapenId,
        loadSystem: firearm.loadSystem,
        notes: firearm.notes,
        maintenanceIntervalRounds: firearm.maintenanceIntervalRounds,
      };

      // Any row with this id — tombstoned or not — means the id is taken, so
      // this is an update (reviving it) rather than an insert that would
      // violate the primary key. Same rule as a session.
      const byId = tx
        .select({ id: firearms.id })
        .from(firearms)
        .where(eq(firearms.id, firearm.id))
        .get();
      if (byId) {
        tx.update(firearms)
          .set({ ...descriptive, deletedAt: null, updatedAt: now })
          .where(eq(firearms.id, firearm.id))
          .run();
        return firearm.id;
      }

      const byName = tx
        .select({ id: firearms.id, make: firearms.make, model: firearms.model })
        .from(firearms)
        .where(isNull(firearms.deletedAt))
        .all()
        .find((f) => firearmDisplayName(f) === name);
      if (byName) return byName.id;

      tx.insert(firearms)
        .values({
          id: firearm.id,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          ...descriptive,
          roundCount: firearm.roundCount,
          roundsSinceMaintenance: firearm.roundsSinceMaintenance,
        })
        .run();
      return firearm.id;
    };

    /** A license names its firearm; one naming a firearm the file does not
     *  carry has no row to hang off and is dropped rather than guessed at. */
    const upsertLicense = (license: LicenseExport): void => {
      const firearmId = firearmIdByFileId.get(license.firearmId);
      if (!firearmId) return;
      const now = nowIso();
      const values = {
        firearmId,
        licenseNumber: license.licenseNumber,
        purpose: license.purpose,
        decidedOn: license.decidedOn,
        validUntil: license.validUntil,
        conditions: license.conditions,
        authority: license.authority,
      };
      const existing = tx
        .select({ id: licenses.id })
        .from(licenses)
        .where(eq(licenses.id, license.id))
        .get();
      if (existing) {
        tx.update(licenses)
          .set({ ...values, deletedAt: null, updatedAt: now })
          .where(eq(licenses.id, license.id))
          .run();
        return;
      }
      tx.insert(licenses)
        .values({ id: license.id, createdAt: now, updatedAt: now, deletedAt: null, ...values })
        .run();
    };

    for (const firearm of records.firearms ?? []) {
      const localId = upsertFirearm(firearm);
      firearmIdByFileId.set(firearm.id, localId);
      // So a session that names this firearm as free text resolves to the
      // same row instead of creating a second one beside it.
      firearmIdByName.set(firearmDisplayName(firearm), localId);
    }
    for (const license of records.licenses ?? []) upsertLicense(license);

    const resolveFirearmId = (name: string | null): string | null => {
      if (!name) return null;
      const cached = firearmIdByName.get(name);
      if (cached) return cached;
      const existing = tx
        .select({ id: firearms.id, make: firearms.make, model: firearms.model })
        .from(firearms)
        .where(isNull(firearms.deletedAt))
        .all()
        .find((f) => `${f.make} ${f.model}` === name);
      if (existing) {
        firearmIdByName.set(name, existing.id);
        return existing.id;
      }
      const { make, model } = splitFirearmName(name);
      const now = nowIso();
      const id = newId();
      tx.insert(firearms)
        .values({
          id,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          make,
          model,
          roundCount: 0,
          roundsSinceMaintenance: 0,
        })
        .run();
      firearmIdByName.set(name, id);
      return id;
    };

    const resolveAmmoLotId = (name: string | null): string | null => {
      if (!name) return null;
      const cached = ammoLotIdByName.get(name);
      if (cached) return cached;
      const existing = tx
        .select({ id: ammoLots.id, label: ammoLots.label })
        .from(ammoLots)
        .where(isNull(ammoLots.deletedAt))
        .all()
        .find((a) => a.label === name);
      if (existing) {
        ammoLotIdByName.set(name, existing.id);
        return existing.id;
      }
      const now = nowIso();
      const id = newId();
      tx.insert(ammoLots)
        .values({ id, createdAt: now, updatedAt: now, deletedAt: null, label: name })
        .run();
      ammoLotIdByName.set(name, id);
      return id;
    };

    const resolveTagId = (name: string): string => {
      const cached = tagIdByName.get(name);
      if (cached) return cached;
      const tag = getOrCreateTag(tx, name);
      tagIdByName.set(name, tag.id);
      return tag.id;
    };

    /** Net round-counter movement per firearm, applied once at the end. */
    const roundDeltaByFirearm = new Map<string, number>();
    const addRounds = (firearmId: string, delta: number) => {
      roundDeltaByFirearm.set(firearmId, (roundDeltaByFirearm.get(firearmId) ?? 0) + delta);
    };

    for (const group of groups) {
      // The id is the precise reference; the name is the fallback for a file
      // whose firearms array does not carry it (or has none at all).
      const firearmId =
        (group.firearmId ? firearmIdByFileId.get(group.firearmId) : undefined) ??
        resolveFirearmId(group.firearm);
      const ammoLotId = resolveAmmoLotId(group.ammoLot);
      const now = nowIso();

      // A row with this id existing at all — deleted or not — means the id is
      // taken in this DB, so it's an update (and revives a tombstoned row)
      // rather than a fresh insert, which would violate the PK.
      const existing = tx
        .select({
          id: sessions.id,
          deletedAt: sessions.deletedAt,
          firearmId: sessions.firearmId,
          extraRounds: sessions.extraRounds,
        })
        .from(sessions)
        .where(eq(sessions.id, group.sessionId))
        .get();
      const isUpdate = existing != null;

      // What this session already contributes to a firearm's counters, so the
      // import moves them by the difference. A tombstoned row contributes
      // nothing: `deleteSessionAndSeries` backed it out when it was deleted.
      if (existing != null && existing.deletedAt === null && existing.firearmId) {
        const before = listSeriesForSession(tx, group.sessionId).reduce(
          (sum, row) => sum + listShotsForSeries(tx, row.id).length,
          existing.extraRounds ?? 0,
        );
        addRounds(existing.firearmId, -before);
      }
      if (firearmId) {
        const after = group.series.reduce(
          (sum, row) => sum + row.shots.length,
          group.extraRounds ?? 0,
        );
        addRounds(firearmId, after);
      }

      const sessionValues = {
        name: group.name,
        type: group.type,
        disciplineId: group.disciplineId,
        programId: group.programId,
        competitionLevel: toCompetitionLevel(group.competitionLevel),
        isChampionship: group.isChampionship ? 1 : 0,
        competitionName: group.competitionName,
        weaponGroup: group.weaponGroup,
        shooterClass: group.shooterClass,
        eventId: group.eventId,
        firearmId,
        ammoLotId,
        startedAt: group.startedAt,
        location: group.location,
        notes: group.notes,
        decimalScoring: group.decimalScoring ? 1 : 0,
        extraRounds: group.extraRounds,
        updatedAt: now,
      };

      if (isUpdate) {
        tx.update(sessions)
          .set({ ...sessionValues, deletedAt: null })
          .where(eq(sessions.id, group.sessionId))
          .run();
        for (const s of listSeriesForSession(tx, group.sessionId)) {
          for (const shot of listShotsForSeries(tx, s.id)) softDeleteShot(tx, shot.id);
          softDeleteSeries(tx, s.id);
        }
      } else {
        tx.insert(sessions)
          .values({ id: group.sessionId, createdAt: now, deletedAt: null, ...sessionValues })
          .run();
      }

      for (const s of group.series) {
        const seriesId = newId();
        tx.insert(series)
          .values({
            id: seriesId,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            sessionId: group.sessionId,
            position: s.position,
            isSighter: s.isSighter ? 1 : 0,
            isFinal: s.isFinal ? 1 : 0,
            photoUri: null,
          })
          .run();
        for (const shot of s.shots) {
          tx.insert(shots)
            .values({
              id: newId(),
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
              seriesId,
              position: shot.position,
              valueTenths: shot.valueTenths,
              isInnerTen: shot.isInnerTen ? 1 : 0,
              isInnerTenDecimal: 0,
            })
            .run();
        }
      }

      for (const tagName of group.tags) {
        addSessionTag(tx, group.sessionId, resolveTagId(tagName));
      }
    }

    for (const [firearmId, delta] of roundDeltaByFirearm) {
      if (delta !== 0) applyRoundCountDelta(tx, firearmId, delta);
    }
  });
}
