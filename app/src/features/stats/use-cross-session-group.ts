// Every photo-scored mark in the filtered period, pooled into one group —
// the cross-session heatmap and the coaching hint behind it (#138).
//
// Pooling is only meaningful within one target face: a mark is in target
// millimeters, and 50 mm on the precision face is a different ring from
// 50 mm on the milsnabb one. So the pool is per discipline and face — a
// program group may shoot another face than its discipline's — and the caller
// gets told which discipline it picked rather than being handed a silent mix.
import {
  analyzeGroup,
  analyzePointsLost,
  coachingHint,
  requireTargetFace,
  seriesTargetFace,
  type CoachingHint,
  type GroupAnalysis,
  type TargetFaceDefinition,
} from '@shotledger/shared';
import { useMemo } from 'react';

import { db } from '@/db/client';
import { listMarksBySession, type SessionMarks } from '@/db/queries/shot-marks';
import { busiestBucket } from '@/features/photo-scoring/face-buckets';
import { localDayOf } from '@/features/dates/local-day';

export interface CrossSessionGroup {
  target: TargetFaceDefinition;
  disciplineId: string;
  sessionCount: number;
  marks: { xMm: number; yMm: number; caliberMm: number }[];
  analysis: GroupAnalysis;
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
  const day = localDayOf(session.startedAt);
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

    // Pool the single busiest discipline and face rather than mixing faces.
    // Picking the most-shot one keeps the answer stable as the period widens.
    const tagged = scoped.flatMap((session) => session.marks.map((mark) => ({ session, mark })));
    const chosen = busiestBucket(tagged, ({ session, mark }) => {
      const face = seriesTargetFace(session.disciplineId, session.programId, mark.seriesPosition);
      return face === undefined ? undefined : `${session.disciplineId} ${face}`;
    });
    if (!chosen) return null;
    const [chosenId, faceId] = chosen.key.split(' ') as [string, string];
    let target: TargetFaceDefinition;
    try {
      target = requireTargetFace(faceId);
    } catch {
      // A discipline naming a face this build does not carry.
      return null;
    }

    const marks = chosen.items.map(({ mark }) => ({
      xMm: mark.xMm,
      yMm: mark.yMm,
      caliberMm: mark.caliberMm,
    }));
    const analysis = analyzeGroup(marks);
    if (!analysis) return null;

    return {
      target,
      disciplineId: chosenId,
      sessionCount: new Set(chosen.items.map(({ session }) => session.sessionId)).size,
      marks,
      analysis,
      hint: coachingHint(analysis, analyzePointsLost(marks, target)),
    };
  }, [from, to, disciplineId]);
}
