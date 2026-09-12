// Import browse/review hooks (integration spec §A.1–§A.9), backing the
// /webshooter/import routes. Fetches through the memoized client (§A.11
// caching), classifies through the DB query layer (app/src/db/queries/
// webshooter.ts), writes only on explicit user confirmation — no write
// happens before the review step's confirm button, per §A.1's own
// "Done when" criterion.
import { useCallback, useState } from 'react';
import type {
  Competition,
  ResultRow,
} from '@shotledger/shared/src/integrations/webshooter/api/schemas';

import { db } from '@/db/client';
import {
  classifyResultRow,
  importResultRow,
  resolveDisciplineForImport,
  type ImportCandidate,
} from '@/db/queries/webshooter';
import { getWebshooterClient } from './client';
import { readCache, writeCache } from './refresh-cache';

const LIST_CACHE = 'competitions';

export interface CompetitionListItem extends Competition {
  alreadyImportable: boolean; // false = fält, listed but marked "stöds ej" (§A.9)
}

export function useWebshooterCompetitions() {
  // Hydrated from the last fetch: the listing is the whole season, and a
  // cold start should not re-download it just to show a screen.
  const [competitions, setCompetitions] = useState<CompetitionListItem[]>(
    () => readCache<CompetitionListItem[]>(LIST_CACHE)?.data ?? [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (options: { forceRefresh?: boolean } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const client = getWebshooterClient();
      const list = await client.listCompetitions(options);
      const mapped = list
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((c) => ({
          ...c,
          alreadyImportable: resolveDisciplineForImport(c.results_type) !== null,
        }));
      setCompetitions(mapped);
      writeCache(LIST_CACHE, mapped);
    } catch {
      setError('fetchFailed');
    } finally {
      setLoading(false);
    }
  }, []);

  /** Fetches only when nothing has been fetched before. */
  const loadIfEmpty = useCallback(async () => {
    if (readCache<CompetitionListItem[]>(LIST_CACHE) !== null) return;
    await load();
  }, [load]);

  return { competitions, loading, error, load, loadIfEmpty };
}

export interface ReviewCandidate {
  row: ResultRow;
  candidate: ImportCandidate;
}

export function useWebshooterReview(competitionId: number) {
  const [candidates, setCandidates] = useState<ReviewCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (options: { forceRefresh?: boolean } = {}) => {
      if (!db) return;
      setLoading(true);
      setError(null);
      try {
        const client = getWebshooterClient();
        const [competition, results] = await Promise.all([
          client.getCompetition(competitionId, options),
          client.getResults(competitionId, options),
        ]);
        const info = {
          name: competition.name,
          date: competition.date,
          resultsType: competition.results_type,
        };
        setCandidates(
          results.map((row) => ({ row, candidate: classifyResultRow(db!, row, info) })),
        );
      } catch {
        setError('fetchFailed');
      } finally {
        setLoading(false);
      }
    },
    [competitionId],
  );

  /**
   * Confirms one candidate's import (§A.1: per-row confirm, never bulk
   * "import everything"). `linkToSessionId` set = confirmed heuristic link
   * or a re-import; `applySighterRoundsForFirearmId` = the confirmed §A.7
   * checkbox.
   */
  const confirmImport = useCallback(
    async (
      item: ReviewCandidate,
      options: { linkToSessionId?: string; applySighterRoundsForFirearmId?: string | null } = {},
    ) => {
      if (!db) return null;
      const { disciplineId, programId } = item.candidate;
      if (!disciplineId || !programId) {
        // classifyResultRow already resolved these for every importable
        // verdict (new/exact-duplicate/probable-match) — reaching here
        // means the caller tried to import a not-importable candidate.
        throw new Error('Cannot import a candidate with no resolved discipline/program.');
      }
      const program = { disciplineId, programId };
      const result = importResultRow(
        db,
        item.row,
        { name: item.candidate.competitionName, date: item.candidate.competitionDate },
        { program, ...options },
      );
      return result;
    },
    [],
  );

  return { candidates, loading, error, load, confirmImport };
}
