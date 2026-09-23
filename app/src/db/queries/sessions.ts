import type { LocationUsage } from '@shotledger/shared';
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, sql } from 'drizzle-orm';

import type { CompetitionLevel } from '../../features/session/labels';
import { sessions } from '../schema';
import type { Database } from '../types';
import { newId, nowIso } from '../util';

export type SessionType = 'training' | 'competition';

/**
 * What the session records — chosen at creation, never mixed (maintainer
 * ruling 2026-09-03). `'series'` logs scored series; `'rounds'` logs a fixed
 * number of fired shots in `extra_rounds` and has no series at all.
 * Orthogonal to `SessionType`: both kinds can be training or competition.
 */
export type SessionKind = 'series' | 'rounds';

export interface CreateSessionInput {
  name: string;
  type: SessionType;
  /** Defaults to `'series'`, matching the column default and every pre-0005 row. */
  kind?: SessionKind;
  disciplineId: string;
  programId?: string | null;
  competitionLevel?: CompetitionLevel | null;
  isChampionship?: boolean;
  competitionName?: string | null;
  weaponGroup?: string | null;
  shooterClass?: string | null;
  eventId?: string | null;
  firearmId?: string | null;
  ammoLotId?: string | null;
  startedAt: string;
  location?: string | null;
  notes?: string | null;
  /** Session-level ten / inner-ten counts. Only for sessions with no shot rows to count — see schema.ts. */
  tenCount?: number | null;
  innerTenCount?: number | null;
  decimalScoring?: boolean;
  /** Vanlig fält or poängfält — how the competition presents the result (D.6.11 p. 95). */
  faltResultMode?: 'falt' | 'poangfalt' | null;
  // Webshooter (integration spec §1/§A) and ShotLog CSV
  // (docs/specs/shotlog-import-spec.md §7) imports — unset for a locally
  // created session (external_source stays NULL).
  externalSource?: 'webshooter' | 'shotlog' | null;
  externalRef?: string | null;
  externalSyncedAt?: string | null;
  webshooterCompetitionId?: string | null;
  officialPlacement?: number | null;
  officialStandardMedal?: 'none' | 'brons' | 'silver' | 'guld' | null;
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
    kind: input.kind ?? 'series',
    disciplineId: input.disciplineId,
    programId: input.programId ?? null,
    competitionLevel: input.competitionLevel ?? null,
    isChampionship: input.isChampionship ? 1 : 0,
    competitionName: input.competitionName ?? null,
    weaponGroup: input.weaponGroup ?? null,
    shooterClass: input.shooterClass ?? null,
    eventId: input.eventId ?? null,
    firearmId: input.firearmId ?? null,
    ammoLotId: input.ammoLotId ?? null,
    startedAt: input.startedAt,
    location: input.location ?? null,
    notes: input.notes ?? null,
    tenCount: input.tenCount ?? null,
    innerTenCount: input.innerTenCount ?? null,
    decimalScoring: input.decimalScoring ? 1 : 0,
    faltResultMode: input.faltResultMode ?? null,
    externalSource: input.externalSource ?? null,
    externalRef: input.externalRef ?? null,
    externalSyncedAt: input.externalSyncedAt ?? null,
    webshooterCompetitionId: input.webshooterCompetitionId ?? null,
    officialPlacement: input.officialPlacement ?? null,
    officialStandardMedal: input.officialStandardMedal ?? null,
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

// `kind` joins `type`/`disciplineId` as immutable after creation: flipping it
// would strand a session's series or its extra_rounds behind a UI that no
// longer shows them (maintainer ruling: "choose at creation").
export type UpdateSessionInput = Partial<
  Omit<CreateSessionInput, 'type' | 'kind' | 'disciplineId'> & {
    name: string;
    /** Unscored extra rounds (A1 §A1.3). Write it via `setSessionExtraRounds`
     * so the firearm round counter moves with it — never directly. */
    extraRounds: number | null;
    /** How the next series is added: ask, or go straight to manual/photo. */
    seriesEntryMode: 'ask' | 'manual' | 'photo';
  }
>;

export function updateSession(db: Database, id: string, patch: UpdateSessionInput) {
  const now = nowIso();
  const values: Record<string, unknown> = { ...patch, updatedAt: now };
  if ('isChampionship' in patch) values.isChampionship = patch.isChampionship ? 1 : 0;
  if ('decimalScoring' in patch) values.decimalScoring = patch.decimalScoring ? 1 : 0;
  if ('faltResultMode' in patch) values.faltResultMode = patch.faltResultMode ?? null;
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

/** All non-deleted sessions' external_ref (§A.2 exact-match input). */
export function listExternalRefs(db: Database): { id: string; externalRef: string | null }[] {
  return db
    .select({ id: sessions.id, externalRef: sessions.externalRef })
    .from(sessions)
    .where(isNull(sessions.deletedAt))
    .all();
}

/**
 * Candidate input for heuristic matching (§A.2): only sessions with no
 * external_ref (pre-feature manual sessions) are eligible, per the
 * reconcile module's own filter — narrowed here too so the caller never
 * has to trust the module to re-filter what this query already promises.
 */
export function listHeuristicMatchCandidates(db: Database): {
  id: string;
  externalRef: string | null;
  date: string;
  eventName: string;
  weaponGroup: string;
}[] {
  return db
    .select({
      id: sessions.id,
      externalRef: sessions.externalRef,
      date: sessions.startedAt,
      eventName: sessions.competitionName,
      weaponGroup: sessions.weaponGroup,
    })
    .from(sessions)
    .where(and(isNull(sessions.deletedAt), isNull(sessions.externalRef)))
    .all()
    .map((row) => ({
      id: row.id,
      externalRef: row.externalRef,
      date: row.date.slice(0, 10),
      eventName: row.eventName ?? '',
      weaponGroup: row.weaponGroup ?? '',
    }));
}

export function softDeleteSession(db: Database, id: string) {
  const now = nowIso();
  db.update(sessions).set({ deletedAt: now, updatedAt: now }).where(eq(sessions.id, id)).run();
}

/**
 * Distinct locations this shooter has used, with usage count and last use —
 * the offline source for the new-session Location autocomplete. Ranking is
 * `rankRecentLocations` in `@shotledger/shared` (pure, tested there); this
 * query only gathers the raw usage.
 */
export function listLocationUsage(db: Database): LocationUsage[] {
  return db
    .select({
      location: sql<string>`trim(${sessions.location})`,
      count: sql<number>`count(*)`,
      lastUsedAt: sql<string>`max(${sessions.startedAt})`,
    })
    .from(sessions)
    .where(and(isNull(sessions.deletedAt), isNotNull(sessions.location), ne(sessions.location, '')))
    .groupBy(sql`lower(trim(${sessions.location}))`)
    .all()
    .filter((row) => row.location !== '');
}

export interface ListSessionsFilter {
  type?: SessionType;
  /** Series-logged vs fixed-shot-count sessions (§3 `sessions.kind`). */
  kind?: SessionKind;
  disciplineId?: string;
  /** ISO date/time, inclusive lower bound on started_at. */
  startedFrom?: string;
  /** ISO date/time, inclusive upper bound on started_at. */
  startedTo?: string;
}

export function listSessions(db: Database, filter: ListSessionsFilter = {}) {
  const conditions = [isNull(sessions.deletedAt)];
  if (filter.type) conditions.push(eq(sessions.type, filter.type));
  if (filter.kind) conditions.push(eq(sessions.kind, filter.kind));
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
