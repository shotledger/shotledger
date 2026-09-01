// The Group view's data. Spec: docs/specs/photo-scoring-phase1-spec.md §7.
//
// Only sessions that actually HAVE marks get the view, which is why this
// returns null rather than an empty analysis: every session that predates
// photo scoring would otherwise grow an empty tab.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import type { GroupAnalysis, TargetFaceDefinition } from '@shotledger/shared';
import { analyzeGroup, getDiscipline, getTargetFace } from '@shotledger/shared';

import { db } from '@/db/client';
import { getSession } from '@/db/queries/sessions';
import { type StoredMark, listMarksForSession } from '@/db/queries/shot-marks';

export interface SessionGroup {
  readonly marks: readonly StoredMark[];
  readonly analysis: GroupAnalysis;
  readonly target: TargetFaceDefinition;
}

export function loadSessionGroup(sessionId: string): SessionGroup | null {
  if (!db) return null;

  const marks = listMarksForSession(db, sessionId);
  if (marks.length === 0) return null;

  const session = getSession(db, sessionId);
  const faceId = getDiscipline(session?.disciplineId ?? '')?.targetFace ?? '';
  const target = getTargetFace(faceId);
  // A mark can only have been made against a known face, but a discipline's
  // targetFace could be edited in a later data file — better to hide the view
  // than to plot millimetres against the wrong ring scale.
  if (!target) return null;

  const analysis = analyzeGroup(marks.map((m) => ({ xMm: m.xMm, yMm: m.yMm })));
  if (!analysis) return null;

  return { marks, analysis, target };
}

/**
 * Refetches on focus, exactly as `useSessionDetail` does: returning from the
 * scan screen is the moment a session FIRST gets marks, so a hook that only
 * read once on mount would hide the Group view until the screen was
 * recreated.
 */
export function useSessionGroup(sessionId: string): SessionGroup | null {
  const [group, setGroup] = useState<SessionGroup | null>(() => loadSessionGroup(sessionId));

  const refresh = useCallback(() => setGroup(loadSessionGroup(sessionId)), [sessionId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return group;
}
