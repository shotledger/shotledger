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
  { ok: true; changes: ClientChange[]; summary: BulkSummary } | { ok: false; errors: BulkError[] };

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
  const tagged = new Set(
    liveRows(context.sessionTags)
      .filter((l) => named.has(l.tag_id as string))
      .map((l) => l.session_id as string),
  );
  let changed = 0;
  for (const s of sessions) {
    if (tagged.has(s.id as string)) continue;
    changed += 1;
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
  return { writes, changed };
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

/** The session's rounds by the one volume rule, as the phone's sessionVolumeRounds. */
function roundsOf(session: Payload, context: BulkContext): number {
  const series: VolumeSeries[] = [];
  for (const s of liveRows(context.series)) {
    if (s.session_id !== session.id) continue;
    series.push({
      shotCount: liveRows(context.shots).filter((h) => h.series_id === s.id).length,
      totalOnly: s.is_total_override === 1,
      overrideShotCount: (s.total_override_shot_count as number | null | undefined) ?? null,
    });
  }
  return sessionVolume({
    series,
    extraRounds: (session.extra_rounds as number | null | undefined) ?? null,
    stationCount: liveRows(context.faltStations).filter((st) => st.session_id === session.id)
      .length,
    seriesLength: disciplineSeriesLength(session.discipline_id as string),
  });
}

const counter = (value: unknown): number => (typeof value === 'number' ? value : 0);

/** As updateSession with a new firearmId: the session's rounds move with it (B2). */
function setFirearm(
  target: string | null,
  sessions: Payload[],
  context: BulkContext,
  now: string,
): Planned {
  // A firearm that is no longer live is not moved, as applyRoundCountDelta.
  const live = new Set<string | null>(liveRows(context.firearms).map((f) => f.id as string));
  const delta = new Map<string, number>();
  const move = (firearmId: string | null, rounds: number) => {
    if (!live.has(firearmId)) return;
    delta.set(firearmId!, (delta.get(firearmId!) ?? 0) + rounds);
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
    const rounds = roundsOf(s, context);
    move(before, -rounds);
    move(target, rounds);
  }
  const firearmWrites: Write[] = [];
  for (const [firearmId, rounds] of delta) {
    if (rounds === 0) continue;
    const pulled = context.firearms.get(firearmId)!;
    firearmWrites.push({
      tableName: 'firearms',
      rowId: firearmId,
      payload: {
        ...pulled,
        round_count: Math.max(0, counter(pulled.round_count) + rounds),
        rounds_since_maintenance: Math.max(0, counter(pulled.rounds_since_maintenance) + rounds),
        updated_at: now,
      },
    });
  }
  return { writes: [...firearmWrites, ...sessionWrites], changed: sessionWrites.length };
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
  const { writes, changed } = plan(action, sessions, context, deps, now);
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
  };
}
