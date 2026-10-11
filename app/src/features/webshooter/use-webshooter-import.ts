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

import { cardNumbersMatch } from '@shotledger/shared/src/integrations/webshooter/identity';

import { db } from '@/db/client';
import { getSetting } from '@/db/queries/settings';
import {
  classifyResultRow,
  importResultRow,
  resolveDisciplineForImport,
  type ImportCandidate,
} from '@/db/queries/webshooter';
import { getWebshooterClient, loadTokenCache } from './client';

export interface CompetitionListItem extends Competition {
  alreadyImportable: boolean; // false = fält, listed but marked "stöds ej" (§A.9)
}

export function useWebshooterCompetitions() {
  const [competitions, setCompetitions] = useState<CompetitionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (options: { forceRefresh?: boolean } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const client = getWebshooterClient();
      const list = await client.listCompetitions(options);
      setCompetitions(
        list
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((c) => ({
            ...c,
            alreadyImportable: resolveDisciplineForImport(c.results_type) !== null,
          })),
      );
    } catch {
      setError('fetchFailed');
    } finally {
      setLoading(false);
    }
  }, []);

  return { competitions, loading, error, load };
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
      setLoading(true);
      setError(null);
      try {
        await loadTokenCache();
        const cardNumber = getSetting<string | null>(db, 'webshooterCardNumber', null);
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
        // The results list every shooter in the competition; only the
        // shooter's own starts are theirs to import (§A.10).
        const mine = results.filter((row) =>
          cardNumbersMatch(row.signup?.user?.shooting_card_number ?? null, cardNumber),
        );
        setCandidates(mine.map((row) => ({ row, candidate: classifyResultRow(db, row, info) })));
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
   * or a re-import; `firearmId` = the firearm the start was shot with;
   * `addSighterRounds` = the confirmed §A.7 toggle.
   */
  const confirmImport = useCallback(
    async (
      item: ReviewCandidate,
      options: {
        linkToSessionId?: string;
        firearmId?: string | null;
        addSighterRounds?: boolean;
      } = {},
    ) => {
      const { disciplineId, programId, faltResultMode } = item.candidate;
      if (!disciplineId) {
        // classifyResultRow already resolved this for every importable
        // verdict (new/exact-duplicate/probable-match) — reaching here
        // means the caller tried to import a not-importable candidate.
        throw new Error('Cannot import a candidate with no resolved discipline.');
      }
      const program = { disciplineId, programId, faltResultMode };
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
