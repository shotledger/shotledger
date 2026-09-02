// ShotLog CSV import — write path (docs/specs/shotlog-import-spec.md §7).
// Glue layer (routine app work): every decision — parsing, classification,
// dedup, suggestions — is made by the pure `shared/src/shotlog` module, which
// carries the old-coder gauntlet. This file only turns an approved plan row
// into rows in the database.
import { isNull } from 'drizzle-orm';
import type { ShotlogExistingSession, ShotlogPlanRow } from '@shotledger/shared';

import { sessions } from '../schema';
import type { Database } from '../types';
import { addSeries } from './series';
import { createSession } from './sessions';
import { addSessionTag, getOrCreateTag } from './tags';

/** Duplicate-detection input for `buildShotlogImportPlan` (spec §6). */
export function listShotlogDedupCandidates(db: Database): ShotlogExistingSession[] {
  return db
    .select({
      id: sessions.id,
      name: sessions.name,
      startedAt: sessions.startedAt,
      disciplineId: sessions.disciplineId,
      weaponGroup: sessions.weaponGroup,
      externalRef: sessions.externalRef,
    })
    .from(sessions)
    .where(isNull(sessions.deletedAt))
    .all();
}

/** Statuses that can never be written, whatever the UI's selection says. */
const IMPORTABLE_STATUSES = new Set(['new', 'empty', 'probable-duplicate']);

export function isShotlogRowImportable(row: ShotlogPlanRow): boolean {
  return IMPORTABLE_STATUSES.has(row.status) && row.suggestion.disciplineId !== null;
}

/**
 * Writes one plan row: a session plus exactly ONE total-override series
 * (spec §7). ShotLog exports no per-shot detail and no shot count, so
 * `totalOverrideShotCount` stays NULL — the stats layer's WS1 branches
 * already handle a total-only series.
 */
export function importShotlogRow(db: Database, row: ShotlogPlanRow): string {
  const { suggestion } = row;
  if (suggestion.disciplineId === null) {
    throw new Error(`ShotLog row ${row.line} has no discipline — refusing to guess one.`);
  }

  const session = createSession(db, {
    name: row.name === '' ? row.datetime.slice(0, 10) : row.name,
    type: suggestion.sessionType,
    disciplineId: suggestion.disciplineId,
    competitionName: suggestion.competitionName,
    weaponGroup: suggestion.weaponGroup,
    shooterClass: suggestion.shooterClass,
    firearmId: suggestion.firearmId,
    startedAt: row.datetime,
    notes: suggestion.note === '' ? null : suggestion.note,
    externalSource: 'shotlog',
    externalRef: row.ref,
    externalSyncedAt: new Date().toISOString(),
  });

  addSeries(db, {
    sessionId: session.id,
    position: 1,
    isTotalOverride: true,
    totalOverrideTenths: suggestion.totalTenths,
    totalOverrideShotCount: null,
  });

  for (const tagName of suggestion.tags) {
    addSessionTag(db, session.id, getOrCreateTag(db, tagName).id);
  }

  return session.id;
}

export interface ShotlogImportOutcome {
  created: string[];
  skipped: number;
}

/**
 * Imports every selected, importable row. The importability check is
 * re-applied here rather than trusted from the UI, per the spec's invariant:
 * an error / in-file duplicate / already-imported row can never be written.
 */
export function importShotlogRows(
  db: Database,
  rows: readonly ShotlogPlanRow[],
): ShotlogImportOutcome {
  const created: string[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (!row.selected || !isShotlogRowImportable(row)) {
      if (row.selected) skipped += 1;
      continue;
    }
    created.push(importShotlogRow(db, row));
  }
  return { created, skipped };
}
