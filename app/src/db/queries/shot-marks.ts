// Photo-scoring marks: where the user tapped, in target millimetres.
// Spec: docs/specs/photo-scoring-phase1-spec.md §4.
//
// Shots are still written through the existing entry model
// (`saveSeriesShots`), so firearm round counters stay correct and a
// photo-scored series is indistinguishable from a keypad-entered one
// everywhere downstream. This module only adds the geometry beside it.
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { AmmoLotGroupSample, GroupPoint } from '@shotledger/shared';

import { series, sessions, shotMarks, shots } from '../schema';
import type { Database } from '../types';
import { newId, nowIso } from '../util';
import { saveSeriesShots } from './round-count';
import { listShotsForSeries } from './shots';

export interface ShotMarkInput {
  /** Target-mm, origin at the target centre, y increasing DOWNWARD. */
  xMm: number;
  yMm: number;
  /** The disc diameter the mark was scored with. */
  caliberMm: number;
  /** 0–109, as `shots.value_tenths`. Photo scoring is integer-mode only. */
  valueTenths: number;
  /** Centrumtia — the user's own call, never inferred from the tap. */
  isInnerTen: boolean;
}

function assertFiniteMark(mark: ShotMarkInput): void {
  if (!Number.isFinite(mark.xMm) || !Number.isFinite(mark.yMm)) {
    throw new RangeError(`mark coordinates must be finite, got (${mark.xMm}, ${mark.yMm})`);
  }
  if (!(mark.caliberMm > 0)) {
    throw new RangeError(`caliberMm must be > 0, got ${mark.caliberMm}`);
  }
}

/** Soft-deletes every mark attached to the series' current shots. */
function clearSeriesMarks(db: Database, seriesId: string): void {
  const now = nowIso();
  for (const shot of listShotsForSeries(db, seriesId)) {
    db.update(shotMarks)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(shotMarks.shotId, shot.id), isNull(shotMarks.deletedAt)))
      .run();
  }
}

/**
 * Replaces a series' shots AND their marks in one step, keeping the two in
 * lock-step: mark N belongs to the shot written at position N.
 *
 * Order matters — the old marks are cleared while the old shots are still
 * live, because that is the only way to find them.
 */
export function saveSeriesMarks(
  db: Database,
  seriesId: string,
  marks: readonly ShotMarkInput[],
): { shotId: string; markId: string }[] {
  for (const mark of marks) assertFiniteMark(mark);

  clearSeriesMarks(db, seriesId);
  const saved = saveSeriesShots(
    db,
    seriesId,
    marks.map((m) => ({ valueTenths: m.valueTenths, isInnerTen: m.isInnerTen })),
  );

  const now = nowIso();
  return saved.map((shot, index) => {
    // `saved` is built from `marks`, so the index is always in range.
    const mark = marks[index] as ShotMarkInput;
    const row = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      shotId: shot.id,
      xMm: mark.xMm,
      yMm: mark.yMm,
      caliberMm: mark.caliberMm,
    };
    db.insert(shotMarks).values(row).run();
    return { shotId: shot.id, markId: row.id };
  });
}

export interface StoredMark {
  shotId: string;
  position: number;
  xMm: number;
  yMm: number;
  caliberMm: number;
  valueTenths: number;
  isInnerTen: boolean;
}

function selectMarks(db: Database) {
  return db
    .select({
      shotId: shots.id,
      seriesId: shots.seriesId,
      position: shots.position,
      xMm: shotMarks.xMm,
      yMm: shotMarks.yMm,
      caliberMm: shotMarks.caliberMm,
      valueTenths: shots.valueTenths,
      isInnerTen: shots.isInnerTen,
    })
    .from(shotMarks)
    .innerJoin(shots, eq(shotMarks.shotId, shots.id));
}

function toStoredMark(r: {
  shotId: string;
  position: number;
  xMm: number;
  yMm: number;
  caliberMm: number;
  valueTenths: number;
  isInnerTen: number;
}): StoredMark {
  return { ...r, isInnerTen: r.isInnerTen === 1 };
}

export function listMarksForSeries(db: Database, seriesId: string): StoredMark[] {
  return selectMarks(db)
    .where(and(eq(shots.seriesId, seriesId), isNull(shotMarks.deletedAt), isNull(shots.deletedAt)))
    .orderBy(shots.position)
    .all()
    .map(toStoredMark);
}

/**
 * Every mark in a session — the input to the Group view. Sighter series are
 * excluded for the same reason they are excluded from the session total
 * (§6.3): they are volume, never score.
 */
export function listMarksForSession(db: Database, sessionId: string): StoredMark[] {
  return selectMarks(db)
    .innerJoin(series, eq(shots.seriesId, series.id))
    .where(
      and(
        eq(series.sessionId, sessionId),
        eq(series.isSighter, 0),
        isNull(shotMarks.deletedAt),
        isNull(shots.deletedAt),
        isNull(series.deletedAt),
      ),
    )
    .orderBy(series.position, shots.position)
    .all()
    .map(toStoredMark);
}

/** True when a session has any mark at all — the Group view is hidden otherwise. */
export function sessionHasMarks(db: Database, sessionId: string): boolean {
  return listMarksForSession(db, sessionId).length > 0;
}

/**
 * Every photo-scored series' marks, grouped per series and tagged with the
 * session's ammo lot — the group half of the lot comparison. Sighters are
 * excluded for the same reason as everywhere else; a series whose session
 * has no lot cannot say anything about a lot and is dropped.
 */
export function listGroupSamplesByAmmoLot(db: Database): AmmoLotGroupSample[] {
  const rows = db
    .select({
      seriesId: shots.seriesId,
      ammoLotId: sessions.ammoLotId,
      xMm: shotMarks.xMm,
      yMm: shotMarks.yMm,
    })
    .from(shotMarks)
    .innerJoin(shots, eq(shotMarks.shotId, shots.id))
    .innerJoin(series, eq(shots.seriesId, series.id))
    .innerJoin(sessions, eq(series.sessionId, sessions.id))
    .where(
      and(
        eq(series.isSighter, 0),
        isNotNull(sessions.ammoLotId),
        isNull(shotMarks.deletedAt),
        isNull(shots.deletedAt),
        isNull(series.deletedAt),
        isNull(sessions.deletedAt),
      ),
    )
    .orderBy(series.position, shots.position)
    .all();

  const bySeries = new Map<string, { ammoLotId: string; points: GroupPoint[] }>();
  for (const row of rows) {
    // `isNotNull` above already excluded the null lots; the column type
    // cannot express that.
    const ammoLotId = row.ammoLotId as string;
    const sample = bySeries.get(row.seriesId) ?? { ammoLotId, points: [] };
    sample.points.push({ xMm: row.xMm, yMm: row.yMm });
    bySeries.set(row.seriesId, sample);
  }

  return [...bySeries.entries()].map(([seriesId, sample]) => ({ seriesId, ...sample }));
}

export interface SessionMarks {
  sessionId: string;
  startedAt: string;
  disciplineId: string;
  marks: StoredMark[];
}

/**
 * Marks across every session, for the cross-session heatmap.
 *
 * Grouped by session rather than returned flat, because the caller has to
 * filter by period and discipline — and because a group analysis is only
 * meaningful per target face. Sighters are excluded for the same reason
 * `listMarksForSession` excludes them: volume, never score.
 */
export function listMarksBySession(db: Database): SessionMarks[] {
  // Its own select rather than `selectMarks`: that one is shared with the
  // per-series and per-session queries, which do not join `sessions`, and
  // adding session columns there would compile but fail at runtime.
  const rows = db
    .select({
      shotId: shots.id,
      position: shots.position,
      xMm: shotMarks.xMm,
      yMm: shotMarks.yMm,
      caliberMm: shotMarks.caliberMm,
      valueTenths: shots.valueTenths,
      isInnerTen: shots.isInnerTen,
      sessionId: sessions.id,
      startedAt: sessions.startedAt,
      disciplineId: sessions.disciplineId,
    })
    .from(shotMarks)
    .innerJoin(shots, eq(shotMarks.shotId, shots.id))
    .innerJoin(series, eq(shots.seriesId, series.id))
    .innerJoin(sessions, eq(series.sessionId, sessions.id))
    .where(
      and(
        eq(series.isSighter, 0),
        isNull(shotMarks.deletedAt),
        isNull(shots.deletedAt),
        isNull(series.deletedAt),
        isNull(sessions.deletedAt),
      ),
    )
    .orderBy(sessions.startedAt, series.position, shots.position)
    .all();

  const bySession = new Map<string, SessionMarks>();
  for (const row of rows as (typeof rows)[number][]) {
    const key = row.sessionId;
    const existing = bySession.get(key);
    const mark = toStoredMark(row);
    if (existing) existing.marks.push(mark);
    else
      bySession.set(key, {
        sessionId: key,
        startedAt: row.startedAt,
        disciplineId: row.disciplineId,
        marks: [mark],
      });
  }
  return [...bySession.values()];
}
