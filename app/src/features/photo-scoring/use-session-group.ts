// The Group view's data. Spec: docs/specs/photo-scoring-phase1-spec.md §7.
//
// Only sessions that actually HAVE marks get the view, which is why this
// returns null rather than an empty analysis: every session that predates
// photo scoring would otherwise grow an empty tab.
import { useMemo } from 'react';
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

export function useSessionGroup(sessionId: string): SessionGroup | null {
  return useMemo(() => loadSessionGroup(sessionId), [sessionId]);
}
