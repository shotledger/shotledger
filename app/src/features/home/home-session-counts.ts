// Home header counts (maintainer, 2026-09-03): "show not only logged shots
// but also number of competitions and sessions". Pure over the already-loaded
// session list so use-home-data.ts doesn't need a second DB query.
export interface HomeSessionCounts {
  sessionCount: number;
  competitionCount: number;
}

export function countSessionsByType(
  sessions: readonly { type: 'training' | 'competition' }[],
): HomeSessionCounts {
  return {
    sessionCount: sessions.length,
    competitionCount: sessions.filter((session) => session.type === 'competition').length,
  };
}
