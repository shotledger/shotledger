import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';

import type { CompetitionLevel } from '../../features/session/labels';
import { sessions } from '../schema';
import type { Database } from '../types';
import { newId, nowIso } from '../util';

export type SessionType = 'training' | 'competition';

export interface CreateSessionInput {
  name: string;
  type: SessionType;
  disciplineId: string;
  programId?: string | null;
  competitionLevel?: CompetitionLevel | null;
  isChampionship?: boolean;
  competitionName?: string | null;
  weaponGroup?: string | null;
  shooterClass?: string | null;
  firearmId?: string | null;
  ammoLotId?: string | null;
  startedAt: string;
  location?: string | null;
  notes?: string | null;
  decimalScoring?: boolean;
}

export function createSession(db: Database, input: CreateSessionInput) {
  const now = nowIso();
  const row = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    name: input.name,
    type: input.type,
    disciplineId: input.disciplineId,
    programId: input.programId ?? null,
    competitionLevel: input.competitionLevel ?? null,
    isChampionship: input.isChampionship ? 1 : 0,
    competitionName: input.competitionName ?? null,
    weaponGroup: input.weaponGroup ?? null,
    shooterClass: input.shooterClass ?? null,
    firearmId: input.firearmId ?? null,
    ammoLotId: input.ammoLotId ?? null,
    startedAt: input.startedAt,
    location: input.location ?? null,
    notes: input.notes ?? null,
    decimalScoring: input.decimalScoring ? 1 : 0,
  };
  db.insert(sessions).values(row).run();
  return row;
}

export function getSession(db: Database, id: string) {
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), isNull(sessions.deletedAt)))
    .get();
}

export type UpdateSessionInput = Partial<
  Omit<CreateSessionInput, 'type' | 'disciplineId'> & {
    name: string;
    /** Unscored extra rounds (A1 §A1.3). Write it via `setSessionExtraRounds`
     * so the firearm round counter moves with it — never directly. */
    extraRounds: number | null;
  }
>;

export function updateSession(db: Database, id: string, patch: UpdateSessionInput) {
  const now = nowIso();
  const values: Record<string, unknown> = { ...patch, updatedAt: now };
  if ('isChampionship' in patch) values.isChampionship = patch.isChampionship ? 1 : 0;
  if ('decimalScoring' in patch) values.decimalScoring = patch.decimalScoring ? 1 : 0;
  db.update(sessions)
    .set(values)
    .where(and(eq(sessions.id, id), isNull(sessions.deletedAt)))
    .run();
  return getSession(db, id);
}

/**
 * Total unscored extra rounds (spec A1 §A1.3) across non-deleted sessions,
 * optionally restricted to a set of session ids (the Stats tab's filter).
 * A volume metric only — never an input to a score statistic.
 */
export function sumExtraRounds(db: Database, sessionIds?: readonly string[]): number {
  if (sessionIds !== undefined && sessionIds.length === 0) return 0;
  const conditions = [isNull(sessions.deletedAt)];
  if (sessionIds !== undefined) conditions.push(inArray(sessions.id, [...sessionIds]));
  const row = db
    .select({ total: sql<number | null>`sum(coalesce(${sessions.extraRounds}, 0))` })
    .from(sessions)
    .where(and(...conditions))
    .get();
  return row?.total ?? 0;
}

export function softDeleteSession(db: Database, id: string) {
  const now = nowIso();
  db.update(sessions).set({ deletedAt: now, updatedAt: now }).where(eq(sessions.id, id)).run();
}

export interface ListSessionsFilter {
  type?: SessionType;
  disciplineId?: string;
  /** ISO date/time, inclusive lower bound on started_at. */
  startedFrom?: string;
  /** ISO date/time, inclusive upper bound on started_at. */
  startedTo?: string;
}

export function listSessions(db: Database, filter: ListSessionsFilter = {}) {
  const conditions = [isNull(sessions.deletedAt)];
  if (filter.type) conditions.push(eq(sessions.type, filter.type));
  if (filter.disciplineId) conditions.push(eq(sessions.disciplineId, filter.disciplineId));
  if (filter.startedFrom) conditions.push(gte(sessions.startedAt, filter.startedFrom));
  if (filter.startedTo) conditions.push(lte(sessions.startedAt, filter.startedTo));
  return db
    .select()
    .from(sessions)
    .where(and(...conditions))
    .orderBy(desc(sessions.startedAt))
    .all();
}
