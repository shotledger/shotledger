// Every photo-scored mark in the filtered period, pooled into one group —
// the cross-session heatmap and the coaching hint behind it (#138).
//
// Pooling is only meaningful within one target face: a mark is in target
// millimetres, and 50 mm on the precision face is a different ring from
// 50 mm on the milsnabb one. So the pool is per discipline, and the caller
// gets told which discipline it picked rather than being handed a silent mix.
import {
  analyzeGroup,
  analyzePointsLost,
  buildHeatmap,
  coachingHint,
  getDiscipline,
  requireTargetFace,
  type CoachingHint,
  type GroupAnalysis,
  type Heatmap,
  type TargetFaceDefinition,
} from '@shotledger/shared';
import { useMemo } from 'react';

import { db } from '@/db/client';
import { listMarksBySession, type SessionMarks } from '@/db/queries/shot-marks';

export interface CrossSessionGroup {
  target: TargetFaceDefinition;
  disciplineId: string;
  sessionCount: number;
  marks: { xMm: number; yMm: number; caliberMm: number }[];
  analysis: GroupAnalysis;
  heatmap: Heatmap | null;
  hint: CoachingHint | null;
}

/** Inside the period, and inside the chosen discipline if one is set. */
function inScope(
  session: SessionMarks,
  from: string | null,
  to: string | null,
  disciplineId: string | null,
): boolean {
  if (disciplineId !== null && session.disciplineId !== disciplineId) return false;
  const day = session.startedAt.slice(0, 10);
  if (from !== null && day < from) return false;
  if (to !== null && day > to) return false;
  return true;
}

export function useCrossSessionGroup(
  from: string | null,
  to: string | null,
  disciplineId: string | null,
): CrossSessionGroup | null {
  return useMemo(() => {
    if (!db) return null;
    const scoped = listMarksBySession(db).filter((session) =>
      inScope(session, from, to, disciplineId),
    );
    if (scoped.length === 0) return null;

    // Pool the single busiest discipline rather than mixing faces. Picking
    // the most-shot one keeps the answer stable as the period widens.
    const byDiscipline = new Map<string, SessionMarks[]>();
    for (const session of scoped) {
      const bucket = byDiscipline.get(session.disciplineId);
      if (bucket) bucket.push(session);
      else byDiscipline.set(session.disciplineId, [session]);
    }
    const [chosenId, sessions] = [...byDiscipline.entries()].sort(
      (a, b) =>
        b[1].reduce((n, s) => n + s.marks.length, 0) - a[1].reduce((n, s) => n + s.marks.length, 0),
    )[0]!;

    const faceId = getDiscipline(chosenId)?.targetFace;
    if (!faceId) return null;
    let target: TargetFaceDefinition;
    try {
      target = requireTargetFace(faceId);
    } catch {
      // A discipline naming a face this build does not carry.
      return null;
    }

    const marks = sessions.flatMap((session) =>
      session.marks.map((mark) => ({
        xMm: mark.xMm,
        yMm: mark.yMm,
        caliberMm: mark.caliberMm,
      })),
    );
    const analysis = analyzeGroup(marks);
    if (!analysis) return null;

    const extentMm = target.rings[target.rings.length - 1]?.diameterMm ?? 0;
    return {
      target,
      disciplineId: chosenId,
      sessionCount: sessions.length,
      marks,
      analysis,
      heatmap: extentMm > 0 ? buildHeatmap(marks, extentMm) : null,
      hint: coachingHint(analysis, analyzePointsLost(marks, target)),
    };
  }, [from, to, disciplineId]);
}
