// A web bulk edit → the changes one push carries
// (docs/specs/web-bulk-edit-spec.md §3.1). Pure: ids, change ids and the
// clock are injected. Each action does, per selected session, what the
// phone's own edit does (B1).
import { disciplineSeriesLength } from '../disciplines';
import { sessionVolume, type VolumeSeries } from '../scoring/volume';
import { PUSH_BATCH_MAX, type ClientChange, type SyncTableName } from '../sync/protocol';
import { TEXT_LIMITS } from '../sync/text-limits';
import type { Payload } from './rows';
import type { EntryDeps } from './session-entry';

export type BulkAction =
  | { kind: 'addTag'; name: string }
  | { kind: 'removeTag'; name: string }
  | { kind: 'setFirearm'; firearmId: string | null }
  | { kind: 'setLocation'; location: string };

/** Freshly pulled rows by id, payloads as the wire carries them. */
export interface BulkContext {
  sessions: ReadonlyMap<string, Payload>;
  tags: ReadonlyMap<string, Payload>;
  sessionTags: ReadonlyMap<string, Payload>;
  firearms: ReadonlyMap<string, Payload>;
  series: ReadonlyMap<string, Payload>;
  shots: ReadonlyMap<string, Payload>;
  faltStations: ReadonlyMap<string, Payload>;
}

export type BulkError =
  | { kind: 'noSessions' }
  | { kind: 'blankTag' }
  | { kind: 'tooLong'; field: 'tag' | 'location'; max: number }
  | { kind: 'unknownFirearm' }
  | { kind: 'nothingToChange' }
  | { kind: 'tooManyChanges'; max: number; needed: number };

export interface BulkSummary {
  /** Selected sessions the edit changes. */
  changed: number;
  /** Selected sessions already as asked (B6). */
  unchanged: number;
  /** Selected sessions no longer live on the server, left out (B5). */
  missing: number;
}

export type BulkResult =
  | {
      ok: true;
      changes: ClientChange[];
      summary: BulkSummary;
      /** A firearm change's counter plan, for a correction after a refusal (R5). */
      counters: CounterPlan | null;
      /** The tag Add Tag links, to check it is still live afterwards (R6). */
      tagId: string | null;
    }
  | { ok: false; errors: BulkError[] };

/** One row to write: a payload, or null for a tombstone. */
interface Write {
  tableName: SyncTableName;
  rowId: string;
  payload: Payload | null;
}

/** What one action writes, and how many live sessions it changed. */
interface Planned {
  writes: Write[];
  changed: number;
  counters?: CounterPlan;
  tagId?: string;
}

/** Present in the pull (server tombstones are dropped) and not soft-deleted. */
const isLive = (row: Payload | undefined): row is Payload =>
  row !== undefined && (row.deleted_at === null || row.deleted_at === undefined);

const liveRows = (rows: ReadonlyMap<string, Payload>): Payload[] =>
  [...rows.values()].filter(isLive);

const edited = (pulled: Payload, column: string, value: unknown, now: string): Payload => ({
  ...pulled,
  [column]: value,
  updated_at: now,
});

function addTag(
  name: string,
  sessions: Payload[],
  context: BulkContext,
  deps: EntryDeps,
  now: string,
): Planned {
  const liveTags = liveRows(context.tags);
  const named = new Set(liveTags.filter((t) => t.name === name).map((t) => t.id as string));
  const tagged = new Set(
    liveRows(context.sessionTags)
      .filter((l) => named.has(l.tag_id as string))
      .map((l) => l.session_id as string),
  );
  const untagged = sessions.filter((s) => !tagged.has(s.id as string));
  // No link to write, no tag to create: a stray tag is not an edit (R13).
  if (untagged.length === 0) return { writes: [], changed: 0 };
  const writes: Write[] = [];
  // The canonical tag: the live one with the smallest id (canonicalTags).
  let tagId = [...named].sort()[0];
  if (tagId === undefined) {
    tagId = deps.newId();
    writes.push({
      tableName: 'tags',
      rowId: tagId,
      payload: { id: tagId, created_at: now, updated_at: now, deleted_at: null, name },
    });
  }
  for (const s of untagged) {
    const id = deps.newId();
    writes.push({
      tableName: 'session_tags',
      rowId: id,
      payload: {
        id,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        session_id: s.id,
        tag_id: tagId,
      },
    });
  }
  return { writes, changed: untagged.length, tagId };
}

/** As removeSessionTag: every live link to any tag of the name, live or not. */
function removeTag(name: string, sessions: Payload[], context: BulkContext): Planned {
  const named = new Set(
    [...context.tags.values()].filter((t) => t.name === name).map((t) => t.id as string),
  );
  const selected = new Set(sessions.map((s) => s.id as string));
  const writes: Write[] = [];
  const touched = new Set<string>();
  for (const l of liveRows(context.sessionTags)) {
    const sessionId = l.session_id as string;
    if (!selected.has(sessionId) || !named.has(l.tag_id as string)) continue;
    touched.add(sessionId);
    writes.push({ tableName: 'session_tags', rowId: l.id as string, payload: null });
  }
  return { writes, changed: touched.size };
}

const countBy = (rows: Payload[], key: string): Map<unknown, number> => {
  const counts = new Map<unknown, number>();
  for (const row of rows) counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
  return counts;
};

/**
 * Each session's rounds by the one volume rule, as the phone's
 * sessionVolumeRounds. The tables are indexed once, so a season of sessions
 * stays linear in its shots.
 */
function volumeIndex(context: BulkContext): (session: Payload) => number {
  const shotsBySeries = countBy(liveRows(context.shots), 'series_id');
  const stationsBySession = countBy(liveRows(context.faltStations), 'session_id');
  const seriesBySession = new Map<unknown, VolumeSeries[]>();
  for (const s of liveRows(context.series)) {
    const bucket = seriesBySession.get(s.session_id) ?? [];
    bucket.push({
      shotCount: shotsBySeries.get(s.id) ?? 0,
      totalOnly: s.is_total_override === 1,
      overrideShotCount: (s.total_override_shot_count as number | null | undefined) ?? null,
    });
    seriesBySession.set(s.session_id, bucket);
  }
  return (session) =>
    sessionVolume({
      series: seriesBySession.get(session.id) ?? [],
      extraRounds: (session.extra_rounds as number | null | undefined) ?? null,
      stationCount: stationsBySession.get(session.id) ?? 0,
      seriesLength: disciplineSeriesLength(session.discipline_id as string),
    });
}

const counter = (value: unknown): number => (typeof value === 'number' ? value : 0);

/**
 * What a firearm change does to the counters (B2), kept with the request so a
 * refused session's share can be taken back afterwards (R5).
 */
export interface CounterPlan {
  /** One per moved session; `from`/`to` are null when that firearm is not live. */
  moves: { sessionId: string; rounds: number; from: string | null; to: string | null }[];
  /** Each touched firearm's pulled [round_count, rounds_since_maintenance]. */
  original: Record<string, [number, number]>;
}

/**
 * The counters after the given moves, for every firearm they touch with a
 * non-zero sum. In one action a firearm is only a source or only the target,
 * so one floor over the sum equals the phone's floor per session.
 */
export function countersAfter(
  plan: CounterPlan,
  moves: CounterPlan['moves'] = plan.moves,
): Map<string, [number, number]> {
  const delta = new Map<string, number>();
  const add = (firearmId: string | null, rounds: number) => {
    if (firearmId !== null) delta.set(firearmId, (delta.get(firearmId) ?? 0) + rounds);
  };
  for (const move of moves) {
    add(move.from, -move.rounds);
    add(move.to, move.rounds);
  }
  const result = new Map<string, [number, number]>();
  for (const [firearmId, rounds] of delta) {
    if (rounds === 0) continue;
    const [total, since] = plan.original[firearmId]!;
    result.set(firearmId, [Math.max(0, total + rounds), Math.max(0, since + rounds)]);
  }
  return result;
}

const withCounters = (pulled: Payload, [total, since]: [number, number], now: string) => ({
  ...pulled,
  round_count: total,
  rounds_since_maintenance: since,
  updated_at: now,
});

/** As updateSession with a new firearmId: the session's rounds move with it (B2). */
function setFirearm(
  target: string | null,
  sessions: Payload[],
  context: BulkContext,
  now: string,
): Planned & { counters: CounterPlan } {
  const roundsOf = volumeIndex(context);
  const counters: CounterPlan = { moves: [], original: {} };
  // A firearm that is no longer live is not moved, as applyRoundCountDelta.
  const liveFirearm = (firearmId: string | null): string | null => {
    const row = firearmId === null ? undefined : context.firearms.get(firearmId);
    if (!isLive(row)) return null;
    counters.original[firearmId!] = [
      counter(row.round_count),
      counter(row.rounds_since_maintenance),
    ];
    return firearmId;
  };
  const sessionWrites: Write[] = [];
  for (const s of sessions) {
    const before = (s.firearm_id as string | null | undefined) ?? null;
    if (before === target) continue;
    sessionWrites.push({
      tableName: 'sessions',
      rowId: s.id as string,
      payload: edited(s, 'firearm_id', target, now),
    });
    counters.moves.push({
      sessionId: s.id as string,
      rounds: roundsOf(s),
      from: liveFirearm(before),
      to: liveFirearm(target),
    });
  }
  const firearmWrites: Write[] = [...countersAfter(counters)].map(([firearmId, values]) => ({
    tableName: 'firearms',
    rowId: firearmId,
    payload: withCounters(context.firearms.get(firearmId)!, values, now),
  }));
  return { writes: [...firearmWrites, ...sessionWrites], changed: sessionWrites.length, counters };
}

/**
 * After a push in which the server refused some moved sessions: the firearm
 * rows that take their share back out of the counters (R5). Each touched
 * firearm is rebuilt from its fresh pull, moved by the difference between
 * the counters without the refused sessions and the counters the push wrote,
 * so a change another device made in between survives. A firearm whose own
 * row was refused, or that is no longer live, is left alone. Empty when
 * nothing needs taking back.
 */
export function buildCounterCorrection(
  plan: CounterPlan,
  refused: { sessions: ReadonlySet<string>; firearms: ReadonlySet<string> },
  freshFirearms: ReadonlyMap<string, Payload>,
  deps: Pick<EntryDeps, 'newChangeId' | 'now'>,
): ClientChange[] {
  const written = countersAfter(plan);
  const landed = countersAfter(
    plan,
    plan.moves.filter((move) => !refused.sessions.has(move.sessionId)),
  );
  const now = deps.now();
  const changes: ClientChange[] = [];
  for (const [firearmId, [total, since]] of written) {
    const fresh = freshFirearms.get(firearmId);
    if (refused.firearms.has(firearmId) || !isLive(fresh)) continue;
    const [wantTotal, wantSince] = landed.get(firearmId) ?? plan.original[firearmId]!;
    if (wantTotal === total && wantSince === since) continue;
    const values: [number, number] = [
      Math.max(0, counter(fresh.round_count) + wantTotal - total),
      Math.max(0, counter(fresh.rounds_since_maintenance) + wantSince - since),
    ];
    changes.push({
      clientChangeId: deps.newChangeId(),
      tableName: 'firearms',
      rowId: firearmId,
      payload: withCounters(fresh, values, now),
      deletedAt: null,
      updatedAt: now,
    });
  }
  return changes;
}

function setLocation(location: string | null, sessions: Payload[], now: string): Planned {
  const writes: Write[] = sessions
    .filter((s) => ((s.location as string | null | undefined) ?? null) !== location)
    .map((s) => ({
      tableName: 'sessions',
      rowId: s.id as string,
      payload: edited(s, 'location', location, now),
    }));
  return { writes, changed: writes.length };
}

/** The action's own input errors, before any session is read. */
function validate(action: BulkAction, context: BulkContext): BulkError | null {
  switch (action.kind) {
    case 'addTag':
    case 'removeTag': {
      const name = action.name.trim();
      if (name === '') return { kind: 'blankTag' };
      const max = TEXT_LIMITS.tags.name;
      return name.length > max ? { kind: 'tooLong', field: 'tag', max } : null;
    }
    case 'setFirearm':
      return action.firearmId !== null && !isLive(context.firearms.get(action.firearmId))
        ? { kind: 'unknownFirearm' }
        : null;
    case 'setLocation': {
      const max = TEXT_LIMITS.sessions.location;
      return action.location.trim().length > max
        ? { kind: 'tooLong', field: 'location', max }
        : null;
    }
  }
}

function plan(
  action: BulkAction,
  sessions: Payload[],
  context: BulkContext,
  deps: EntryDeps,
  now: string,
): Planned {
  switch (action.kind) {
    case 'addTag':
      return addTag(action.name.trim(), sessions, context, deps, now);
    case 'removeTag':
      return removeTag(action.name.trim(), sessions, context);
    case 'setFirearm':
      return setFirearm(action.firearmId, sessions, context, now);
    case 'setLocation':
      return setLocation(action.location.trim() || null, sessions, now);
  }
}

export function buildBulkEdit(
  action: BulkAction,
  sessionIds: readonly string[],
  context: BulkContext,
  deps: EntryDeps,
): BulkResult {
  const ids = [...new Set(sessionIds)];
  if (ids.length === 0) return { ok: false, errors: [{ kind: 'noSessions' }] };
  const invalid = validate(action, context);
  if (invalid !== null) return { ok: false, errors: [invalid] };

  const sessions = ids.map((id) => context.sessions.get(id)).filter(isLive);
  const now = deps.now();
  const { writes, changed, counters, tagId } = plan(action, sessions, context, deps, now);
  if (writes.length === 0) return { ok: false, errors: [{ kind: 'nothingToChange' }] };
  if (writes.length > PUSH_BATCH_MAX) {
    return {
      ok: false,
      errors: [{ kind: 'tooManyChanges', max: PUSH_BATCH_MAX, needed: writes.length }],
    };
  }

  // Each plan writes parents first, so `writes` is already in APPLY_ORDER (K16).
  const changes: ClientChange[] = writes.map((write) => ({
    clientChangeId: deps.newChangeId(),
    tableName: write.tableName,
    rowId: write.rowId,
    payload: write.payload,
    deletedAt: write.payload === null ? now : null,
    updatedAt: now,
  }));
  return {
    ok: true,
    changes,
    summary: {
      changed,
      unchanged: sessions.length - changed,
      missing: ids.length - sessions.length,
    },
    counters: counters ?? null,
    tagId: tagId ?? null,
  };
}
