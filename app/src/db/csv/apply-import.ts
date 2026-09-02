// Glue layer (routine app work, not old-coder scope — see
// docs/specs/m7-csv-spec.md "Scope"): builds an ExistingIndex from the DB,
// calls the pure shared/csv dry-run planner, and — on confirm — applies the
// plan inside one transaction.
import { eq, isNull } from 'drizzle-orm';
import {
  buildDryRunPlan,
  groupRowsIntoSessions,
  parseImportCsv,
  type DryRunPlan,
  type RowError,
  type SessionImportGroup,
} from '@shotledger/shared';

import { ammoLots, firearms, series, sessions, shots, tags } from '../schema';
import type { Database } from '../types';
import { softDeleteSeries } from '../queries/series';
import { listSeriesForSession } from '../queries/series';
import { softDeleteShot, listShotsForSeries } from '../queries/shots';
import { addSessionTag, getOrCreateTag } from '../queries/tags';
import { newId, nowIso } from '../util';

export interface ImportDryRun {
  plan: DryRunPlan;
  errors: RowError[];
  groups: SessionImportGroup[];
}

/** Parses + validates + plans, without touching the DB. */
export function dryRunImport(db: Database, csvText: string): ImportDryRun {
  const { entries, errors: parseErrors } = parseImportCsv(csvText);
  const { groups, errors: groupErrors } = groupRowsIntoSessions(entries);
  const errors = [...parseErrors, ...groupErrors];

  const sessionIds = new Set(
    db
      .select({ id: sessions.id })
      .from(sessions)
      .where(isNull(sessions.deletedAt))
      .all()
      .map((r) => r.id),
  );
  const firearmNames = new Set(
    db
      .select({ make: firearms.make, model: firearms.model })
      .from(firearms)
      .where(isNull(firearms.deletedAt))
      .all()
      .map((f) => `${f.make} ${f.model}`),
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

  const plan = buildDryRunPlan(groups, { sessionIds, firearmNames, ammoLotNames, tagNames });
  return { plan, errors, groups };
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
 * docs/specs/m7-csv-spec.md "Session id handling". Firearms/ammo lots/tags
 * are matched by exact name or created. Does not touch firearm round
 * counters (known limitation — CSV import is a data-recovery/merge path,
 * not score entry).
 */
export function applyImport(db: Database, groups: readonly SessionImportGroup[]): void {
  db.transaction((tx) => {
    const firearmIdByName = new Map<string, string>();
    const ammoLotIdByName = new Map<string, string>();
    const tagIdByName = new Map<string, string>();

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

    for (const group of groups) {
      const firearmId = resolveFirearmId(group.firearm);
      const ammoLotId = resolveAmmoLotId(group.ammoLot);
      const now = nowIso();

      // A row with this id existing at all — deleted or not — means the id is
      // taken in this DB, so it's an update (and revives a tombstoned row)
      // rather than a fresh insert, which would violate the PK.
      const existing = tx
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.id, group.sessionId))
        .get();
      const isUpdate = existing != null;

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
  });
}
