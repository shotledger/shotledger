// Import write path for WebShooter results (integration spec §A). Glue
// layer (routine app work, not old-coder scope — the pure reconciliation
// and mapping logic it calls lives in shared/src/integrations/webshooter,
// already under old-coder discipline): classifies a fetched ResultRow
// against existing sessions (exact/heuristic/new), then writes the
// override series + official result on confirm, or merges on re-import.
import {
  buildExternalRef,
  findExactMatch,
  findHeuristicCandidates,
  mapClassname,
  mapOfficialResult,
  mapResultsType,
  mapStationResultsToSeries,
  mergeSessionFields,
  type ClassnameMappingResult,
  type ResultRow,
} from '@shotledger/shared/src/integrations/webshooter';

import type { Database } from '../types';
import { addSeries, listSeriesForSession, softDeleteSeries } from './series';
import {
  createSession,
  getSession,
  listExternalRefs,
  listHeuristicMatchCandidates,
  updateSession,
} from './sessions';
import { getSetting, setSetting } from './settings';
import { setSessionExtraRounds } from './round-count';

// --- §A.8 classname -> weapon_group/shooter_class, with the settings cache ---

function classMappingSettingKey(classname: string): `webshooterClassMapping:${string}` {
  return `webshooterClassMapping:${classname}`;
}

/** A user-confirmed manual mapping for a classname the pattern table can't read (§A.8). */
export function cacheManualClassMapping(
  db: Database,
  classname: string,
  mapping: { weaponGroup: string; shooterClass: string },
): void {
  setSetting(db, classMappingSettingKey(classname), mapping);
}

function lookupCachedClassMapping(
  db: Database,
  classname: string,
): { weaponGroup: string; shooterClass: string } | null {
  return getSetting<{ weaponGroup: string; shooterClass: string } | null>(
    db,
    classMappingSettingKey(classname),
    null,
  );
}

/** Pattern table first, then a previously cached manual mapping (§A.8). Never a guess. */
export function resolveClassMapping(db: Database, classname: string): ClassnameMappingResult {
  const patternResult = mapClassname(classname);
  if (patternResult.ok) return patternResult;
  const cached = lookupCachedClassMapping(db, classname);
  if (cached) return { ok: true, weaponGroup: cached.weaponGroup, shooterClass: cached.shooterClass };
  return patternResult;
}

// --- §A.1/§A.2 candidate classification ---------------------------------------

export type ImportVerdict =
  | { kind: 'new' }
  | { kind: 'exact-duplicate'; sessionId: string }
  | { kind: 'probable-match'; candidates: { id: string; eventName: string; date: string }[] }
  | { kind: 'not-importable'; reason: 'field-not-supported' | 'class-mapping-unresolved' };

export interface ImportCandidate {
  externalRef: string;
  competitionName: string;
  competitionDate: string;
  weaponGroup: string | null;
  shooterClass: string | null;
  disciplineId: string | null;
  programId: string | null;
  verdict: ImportVerdict;
}

/**
 * Classifies one fetched result row against the local DB, per §A.1's
 * per-competition review step: never writes anything, only reports what
 * an import/re-import would do. `competitionName`/`competitionDate` are
 * supplied by the caller (the competition list response, §A.11) since a
 * single ResultRow doesn't carry them.
 */
export function classifyResultRow(
  db: Database,
  row: ResultRow,
  competition: {
    name: string;
    date: string;
    resultsType: 'precision' | 'field' | 'military' | 'pointfield' | null;
  },
): ImportCandidate {
  const externalRef = buildExternalRef(row.competitions_id, row.signups_id);
  const classMapping = resolveClassMapping(db, row.weaponclass.classname);
  const program = mapResultsType(competition.resultsType);

  const base = {
    externalRef,
    competitionName: competition.name,
    competitionDate: competition.date,
    weaponGroup: classMapping.ok ? classMapping.weaponGroup : null,
    shooterClass: classMapping.ok ? classMapping.shooterClass : null,
    disciplineId: program?.disciplineId ?? null,
    programId: program?.programId ?? null,
  };

  const exact = findExactMatch(listExternalRefs(db), externalRef);
  if (exact) {
    return { ...base, verdict: { kind: 'exact-duplicate', sessionId: exact.id } };
  }

  // §A.9: fält is listed, never imported — checked before class mapping so
  // the review UI can show "Fält — stöds ej" rather than a spurious mapping
  // prompt for a competition that was never importable to begin with.
  if (!program) {
    return { ...base, verdict: { kind: 'not-importable', reason: 'field-not-supported' } };
  }

  if (!classMapping.ok) {
    return { ...base, verdict: { kind: 'not-importable', reason: 'class-mapping-unresolved' } };
  }

  const heuristic = findHeuristicCandidates(listHeuristicMatchCandidates(db), {
    date: competition.date,
    eventName: competition.name,
    weaponGroup: classMapping.weaponGroup,
  });
  if (heuristic.length > 0) {
    return {
      ...base,
      verdict: {
        kind: 'probable-match',
        candidates: heuristic.map((c) => ({ id: c.id, eventName: c.eventName, date: c.date })),
      },
    };
  }

  return { ...base, verdict: { kind: 'new' } };
}

/**
 * §A.9 scope enforcement: only precision/milsnabb are importable. Takes
 * the competition's `results_type` (from `GET /competitions/{id}`, not on
 * the result row itself) since that is where WebShooter reports it.
 */
export function resolveDisciplineForImport(
  resultsType: 'precision' | 'field' | 'military' | 'pointfield' | null,
): { disciplineId: string; programId: string } | null {
  return mapResultsType(resultsType);
}

// --- §A.3/§A.4/§A.5/§A.6/§A.7 write path ---------------------------------------

export interface ImportResultRowOptions {
  /** From §A.9 — a fält competition is refused, never silently imported. */
  program: { disciplineId: string; programId: string };
  /**
   * Set when confirming a heuristic-match link (§A.2): backfills
   * external_ref onto this existing session instead of creating a new one.
   */
  linkToSessionId?: string;
  /**
   * §A.7: apply the +5-rounds-per-round sighter suggestion to the linked
   * firearm's round counter. Default off — the importer cannot know
   * whether the shooter actually used their sighter allowance.
   */
  applySighterRoundsForFirearmId?: string | null;
  sighterRoundsPerRound?: number;
}

function replaceOverrideSeries(db: Database, sessionId: string, row: ResultRow) {
  // Every existing series on a WebShooter-linked session is override-only
  // (§A.4 — the whole session came from WebShooter); re-import clears and
  // rewrites them wholesale, since there is no per-shot enrichment on an
  // override series to preserve (photoUri is the only per-series
  // enrichment field and is never set on one, §A.3's field list).
  for (const existing of listSeriesForSession(db, sessionId)) {
    softDeleteSeries(db, existing.id);
  }

  const mapped = mapStationResultsToSeries(row, 5); // shotsPerSeries=5, both v1 programs (§A.4)
  mapped.forEach((m, index) => {
    addSeries(db, {
      sessionId,
      position: index + 1,
      isFinal: m.isFinal,
      note: m.note,
      isTotalOverride: true,
      totalOverrideTenths: m.totalOverrideTenths,
      totalOverrideShotCount: m.totalOverrideShotCount,
    });
  });
}

const SIGHTER_ROUNDS_PER_ROUND = 5;

/**
 * Imports (fresh) or re-imports (field-level merge, §A.3) one result row.
 * `linkToSessionId` set = confirmed heuristic link (§A.2) or a re-import of
 * an already-linked session; unset = a brand-new session.
 */
export function importResultRow(
  db: Database,
  row: ResultRow,
  competition: { name: string; date: string },
  options: ImportResultRowOptions,
): { sessionId: string; created: boolean } {
  const externalRef = buildExternalRef(row.competitions_id, row.signups_id);
  const classMapping = resolveClassMapping(db, row.weaponclass.classname);
  if (!classMapping.ok) {
    throw new Error(`Unresolved WebShooter classname '${row.weaponclass.classname}': ${classMapping.reason}`);
  }
  const official = mapOfficialResult(row);

  const linkTarget = options.linkToSessionId ? getSession(db, options.linkToSessionId) : null;

  let sessionId: string;
  let created: boolean;

  if (linkTarget) {
    const { merged } = mergeSessionFields(
      {
        officialPlacement: linkTarget.officialPlacement,
        officialStandardmedalj: linkTarget.officialStandardmedalj,
        competitionName: linkTarget.competitionName,
        firearmId: linkTarget.firearmId,
        ammoLotId: linkTarget.ammoLotId,
        notes: linkTarget.notes,
      },
      {
        officialPlacement: official.officialPlacement,
        officialStandardmedalj: official.officialStandardmedalj,
        competitionName: competition.name,
      },
    );
    updateSession(db, linkTarget.id, {
      externalSource: 'webshooter',
      externalRef,
      externalSyncedAt: new Date().toISOString(),
      webshooterCompetitionId: String(row.competitions_id),
      officialPlacement: merged.officialPlacement as number | null,
      officialStandardmedalj: merged.officialStandardmedalj as
        | 'none'
        | 'brons'
        | 'silver'
        | 'guld'
        | null,
      competitionName: merged.competitionName as string,
      weaponGroup: classMapping.weaponGroup,
      shooterClass: classMapping.shooterClass,
      // disciplineId/programId/type are intentionally not in
      // UpdateSessionInput's field set — re-import never changes them.
    });
    sessionId = linkTarget.id;
    created = false;
  } else {
    const createdSession = createSession(db, {
      name: competition.name,
      type: 'competition',
      disciplineId: options.program.disciplineId,
      programId: options.program.programId,
      competitionName: competition.name,
      weaponGroup: classMapping.weaponGroup,
      shooterClass: classMapping.shooterClass,
      startedAt: new Date(competition.date).toISOString(),
      externalSource: 'webshooter',
      externalRef,
      externalSyncedAt: new Date().toISOString(),
      webshooterCompetitionId: String(row.competitions_id),
      officialPlacement: official.officialPlacement,
      officialStandardmedalj: official.officialStandardmedalj,
    });
    sessionId = createdSession.id;
    created = true;
  }

  replaceOverrideSeries(db, sessionId, row);

  if (options.applySighterRoundsForFirearmId) {
    const session = getSession(db, sessionId);
    // setSessionExtraRounds only moves a firearm's round counters when the
    // session already carries a firearmId (round-count.ts's own contract) —
    // a WebShooter import never sets one (WebShooter has no concept of
    // firearm), so the chosen firearm is assigned here, as an enrichment
    // field: never overwriting one the user already picked (§A.3's
    // "never clobber a user-entered value" rule extends to this write too).
    if (session && !session.firearmId) {
      updateSession(db, sessionId, { firearmId: options.applySighterRoundsForFirearmId });
    }
    const roundsCount = countDistinctRounds(row);
    const currentExtra = session?.extraRounds ?? 0;
    setSessionExtraRounds(
      db,
      sessionId,
      currentExtra + (options.sighterRoundsPerRound ?? SIGHTER_ROUNDS_PER_ROUND) * roundsCount,
    );
  }

  return { sessionId, created };
}

/**
 * Number of "rounds" (championship two-round format, §A.7) implied by a
 * result row: 1 unless a final section is present, in which case the main
 * round and the final each count — matches §A.7's "one per round for
 * championship two-round format".
 */
function countDistinctRounds(row: ResultRow): number {
  return row.results_finals.length > 0 ? 2 : 1;
}
