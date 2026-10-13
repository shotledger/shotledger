// Import write path for Webshooter results (integration spec §A). Glue
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
  mapStationResultsToFaltStations,
  mapStationResultsToSeries,
  mergeSessionFields,
  type ClassnameMappingResult,
  type DisciplineProgramIds,
  type ResultRow,
} from '@shotledger/shared/src/integrations/webshooter';
import { localDayOf, localDayStartIso } from '@shotledger/shared/src/dates';

import type { Database } from '../types';
import { addStation, listStationsForSession, softDeleteStation } from './falt';
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
import { withSessionVolumeDelta } from './volume';

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
  if (cached)
    return { ok: true, weaponGroup: cached.weaponGroup, shooterClass: cached.shooterClass };
  return patternResult;
}

// --- §A.1/§A.2 candidate classification ---------------------------------------

export type ImportVerdict =
  | { kind: 'new' }
  | { kind: 'exact-duplicate'; sessionId: string }
  | { kind: 'probable-match'; candidates: { id: string; eventName: string; date: string }[] }
  | {
      kind: 'not-importable';
      reason: 'results-type-unknown' | 'class-mapping-unresolved' | 'station-data-invalid';
    };

export interface ImportCandidate {
  externalRef: string;
  competitionName: string;
  competitionDate: string;
  weaponGroup: string | null;
  shooterClass: string | null;
  disciplineId: string | null;
  programId: string | null;
  faltResultMode: 'falt' | 'poangfalt' | null;
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
    faltResultMode: program?.faltResultMode ?? null,
  };

  const exact = findExactMatch(listExternalRefs(db), externalRef);
  if (exact) {
    return { ...base, verdict: { kind: 'exact-duplicate', sessionId: exact.id } };
  }

  // Checked before class mapping, so the review UI names the real reason
  // rather than prompting for a class mapping on a row it cannot import.
  if (!program) {
    return { ...base, verdict: { kind: 'not-importable', reason: 'results-type-unknown' } };
  }
  if (program.faltResultMode !== null && !mapStationResultsToFaltStations(row).ok) {
    return { ...base, verdict: { kind: 'not-importable', reason: 'station-data-invalid' } };
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
        candidates: heuristic.map((c) => ({
          id: c.id,
          eventName: c.eventName,
          date: localDayOf(c.startedAt),
        })),
      },
    };
  }

  return { ...base, verdict: { kind: 'new' } };
}

/**
 * What a competition imports as, from its `results_type` (on
 * `GET /competitions/{id}`, not on the result row itself). Null only when
 * Webshooter reports no type.
 */
export function resolveDisciplineForImport(
  resultsType: 'precision' | 'field' | 'military' | 'pointfield' | null,
): DisciplineProgramIds | null {
  return mapResultsType(resultsType);
}

// --- §A.3/§A.4/§A.5/§A.6/§A.7 write path ---------------------------------------

export interface ImportResultRowOptions {
  program: DisciplineProgramIds;
  /**
   * Set when confirming a heuristic-match link (§A.2): backfills
   * external_ref onto this existing session instead of creating a new one.
   */
  linkToSessionId?: string;
  /**
   * The firearm this start was shot with. Assigned only when the session has
   * none yet: a re-import never clobbers a user-entered value (§A.3).
   */
  firearmId?: string | null;
  /**
   * §A.7: add the +5-rounds-per-round sighter suggestion. Default off — the
   * importer cannot know whether the shooter used their sighter allowance.
   */
  addSighterRounds?: boolean;
  sighterRoundsPerRound?: number;
}

function replaceOverrideSeries(db: Database, sessionId: string, row: ResultRow) {
  // Every existing series on a Webshooter-linked session is override-only
  // (§A.4 — the whole session came from Webshooter); re-import clears and
  // rewrites them wholesale, since there is no per-shot enrichment on an
  // override series to preserve (photoUri is the only per-series
  // enrichment field and is never set on one, §A.3's field list).
  // A total-only series' shots are volume like any other (#512), so a linked
  // firearm's counters move by the new series' counts minus the old ones.
  withSessionVolumeDelta(db, sessionId, () => {
    for (const existing of listSeriesForSession(db, sessionId)) {
      softDeleteSeries(db, existing.id);
    }

    const mapped = mapStationResultsToSeries(row, 5); // shotsPerSeries=5, both v1 programs (§A.4)
    mapped.forEach((m, index) => {
      addSeries(db, {
        sessionId,
        position: index + 1,
        isFinal: m.isFinal,
        isShootOff: m.isShootOff,
        isTotalOverride: true,
        totalOverrideTenths: m.totalOverrideTenths,
        totalOverrideShotCount: m.totalOverrideShotCount,
      });
    });
  });
}

/** A fält session's stations, rewritten wholesale on re-import like override series. */
function replaceFaltStations(db: Database, sessionId: string, row: ResultRow) {
  const mapped = mapStationResultsToFaltStations(row);
  if (!mapped.ok) {
    throw new Error(`Webshooter station data cannot be imported: ${mapped.reason}`);
  }
  for (const existing of listStationsForSession(db, sessionId)) {
    softDeleteStation(db, existing.id);
  }
  for (const station of mapped.stations) {
    addStation(db, { sessionId, ...station });
  }
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
    throw new Error(
      `Unresolved Webshooter classname '${row.weaponclass.classname}': ${classMapping.reason}`,
    );
  }
  const official = mapOfficialResult(row);

  const linkTarget = options.linkToSessionId ? getSession(db, options.linkToSessionId) : null;

  let sessionId: string;
  let created: boolean;

  if (linkTarget) {
    const { merged } = mergeSessionFields(
      {
        officialPlacement: linkTarget.officialPlacement,
        officialStandardMedal: linkTarget.officialStandardMedal,
        competitionName: linkTarget.competitionName,
        firearmId: linkTarget.firearmId,
        ammoLotId: linkTarget.ammoLotId,
        notes: linkTarget.notes,
      },
      {
        officialPlacement: official.officialPlacement,
        officialStandardMedal: official.officialStandardMedal,
        competitionName: competition.name,
      },
    );
    updateSession(db, linkTarget.id, {
      externalSource: 'webshooter',
      externalRef,
      officialPlacement: merged.officialPlacement as number | null,
      officialStandardMedal: merged.officialStandardMedal as
        'none' | 'brons' | 'silver' | 'guld' | null,
      competitionName: merged.competitionName as string,
      // §A.3's SCORE_BEARING_FIELDS includes competitionDate — the
      // session's startedAt is that field's DB column, always overwritten
      // on re-import (a Webshooter date correction, however rare).
      startedAt: localDayStartIso(competition.date),
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
      faltResultMode: options.program.faltResultMode,
      competitionName: competition.name,
      weaponGroup: classMapping.weaponGroup,
      shooterClass: classMapping.shooterClass,
      startedAt: localDayStartIso(competition.date),
      externalSource: 'webshooter',
      externalRef,
      officialPlacement: official.officialPlacement,
      officialStandardMedal: official.officialStandardMedal,
    });
    sessionId = createdSession.id;
    created = true;
  }

  if (options.program.faltResultMode !== null) {
    replaceFaltStations(db, sessionId, row);
  } else {
    replaceOverrideSeries(db, sessionId, row);
  }

  // Assigning the firearm also moves the rounds already written above onto
  // it (#512).
  if (options.firearmId && !getSession(db, sessionId)?.firearmId) {
    updateSession(db, sessionId, { firearmId: options.firearmId });
  }

  if (options.addSighterRounds) {
    const currentExtra = getSession(db, sessionId)?.extraRounds ?? 0;
    setSessionExtraRounds(
      db,
      sessionId,
      currentExtra +
        (options.sighterRoundsPerRound ?? SIGHTER_ROUNDS_PER_ROUND) * countDistinctRounds(row),
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
