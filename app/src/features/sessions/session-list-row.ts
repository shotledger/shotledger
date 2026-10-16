// One row of the full sessions list (#317). Extends the Home row with the
// fields the list can filter on — Home never needed them because it only ever
// showed ten sessions and offered no filter.
import type { StatsSeries } from '@shotledger/shared';

import { buildHomeSessionRow, type HomeSessionRow } from '@/features/home/home-session-row';

export interface SessionListRow extends HomeSessionRow {
  disciplineId: string;
  /** `null` where no firearm was recorded — common in imported history. */
  firearmId: string | null;
}

export function buildSessionListRow(
  session: {
    id: string;
    name: string;
    type: 'training' | 'competition';
    startedAt: string;
    disciplineId: string;
    firearmId?: string | null;
    extraRounds?: number | null;
  },
  sessionSeries: readonly StatsSeries[],
  tags: readonly string[] = [],
  falt: HomeSessionRow['falt'] = null,
): SessionListRow {
  return {
    ...buildHomeSessionRow(session, sessionSeries, tags, falt),
    disciplineId: session.disciplineId,
    firearmId: session.firearmId ?? null,
  };
}
