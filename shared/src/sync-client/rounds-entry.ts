// A rounds-only web entry → the changes one push carries
// (docs/specs/web-rounds-final-spec.md C1, C2). Pure: ids, change ids and the
// clock are injected. The session fields follow buildSessionEntry's rules;
// the rounds are the phone's setSessionExtraRounds: stored in extra_rounds,
// and the firearm's counters move by them.
import { requireDiscipline } from '../disciplines';
import type { ClientChange, SyncTableName } from '../sync/protocol';
import { TEXT_LIMITS } from '../sync/text-limits';
import { newSessionRow, withRoundsAdded, type Payload } from './rows';
import {
  blankToNull,
  checkLength,
  startedAtError,
  weaponGroupFor,
  type EntryContext,
  type EntryDeps,
  type EntryError,
  type EntryResult,
  type SessionEntryDraft,
} from './session-entry';

export type RoundsEntryDraft = Omit<
  SessionEntryDraft,
  'programId' | 'decimalScoring' | 'seriesLength' | 'series'
> & {
  /** As typed in Rounds Fired. */
  roundsFired: string;
};

/** No session fires more (QA #747): a larger count is a typo that would skew Statistics. */
export const MAX_ROUNDS_FIRED = 10_000;

/**
 * Blank is no count, as on the phone; whole digits up to MAX_ROUNDS_FIRED
 * are the count. Anything else is refused, on the phone too (spec C4).
 */
export function parseRoundsFired(
  text: string,
): { ok: true; rounds: number | null } | { ok: false } {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, rounds: null };
  const rounds = Number(trimmed);
  return /^\d+$/.test(trimmed) && rounds <= MAX_ROUNDS_FIRED ? { ok: true, rounds } : { ok: false };
}

export function buildRoundsEntry(
  draft: RoundsEntryDraft,
  context: EntryContext,
  deps: EntryDeps,
): EntryResult {
  requireDiscipline(draft.disciplineId);

  const errors: EntryError[] = [];
  const parsed = parseRoundsFired(draft.roundsFired);
  if (!parsed.ok) errors.push({ kind: 'invalidRounds' });

  const isCompetition = draft.type === 'competition';
  const name = draft.name.trim() === '' ? draft.defaultName : draft.name.trim();
  const competitionName = isCompetition ? blankToNull(draft.competitionName) : null;
  const location = blankToNull(draft.location);
  checkLength(errors, 'name', name, TEXT_LIMITS.sessions.name);
  checkLength(errors, 'competitionName', competitionName, TEXT_LIMITS.sessions.competition_name);
  checkLength(errors, 'location', location, TEXT_LIMITS.sessions.location);

  let pulledFirearm: Payload | undefined;
  if (draft.firearmId !== null) {
    pulledFirearm = context.firearms.get(draft.firearmId);
    if (pulledFirearm === undefined) errors.push({ kind: 'unknownFirearm' });
  }
  if (draft.ammoLotId !== null && !context.ammoLots.has(draft.ammoLotId)) {
    errors.push({ kind: 'unknownAmmoLot' });
  }
  const now = deps.now();
  const startedAt = startedAtError(draft.startedAt, now);
  if (startedAt) errors.push(startedAt);
  if (!parsed.ok || errors.length > 0) return { ok: false, errors };

  const changes: ClientChange[] = [];
  const add = (tableName: SyncTableName, payload: Payload) =>
    changes.push({
      clientChangeId: deps.newChangeId(),
      tableName,
      rowId: payload.id as string,
      payload,
      deletedAt: null,
      updatedAt: now,
    });

  // A rounds session's volume is its extra rounds alone (sessionVolume).
  const firearmRow = pulledFirearm ? withRoundsAdded(pulledFirearm, parsed.rounds ?? 0, now) : null;
  if (firearmRow) add('firearms', firearmRow);

  const sessionId = deps.newId();
  add(
    'sessions',
    newSessionRow(sessionId, now, {
      name,
      type: draft.type,
      kind: 'rounds',
      disciplineId: draft.disciplineId,
      programId: null,
      competitionLevel: isCompetition ? draft.competitionLevel : null,
      isChampionship: isCompetition && draft.isChampionship,
      competitionName,
      weaponGroup: weaponGroupFor(draft, context),
      shooterClass: isCompetition ? draft.shooterClass : null,
      eventId: isCompetition ? draft.eventId : null,
      firearmId: draft.firearmId,
      ammoLotId: draft.ammoLotId,
      startedAt: draft.startedAt,
      location,
      decimalScoring: false,
      seriesLength: null,
      extraRounds: parsed.rounds,
    }),
  );
  // A rounds-only session has no series, so no photo (web-entry-photo-spec C6).
  return { ok: true, sessionId, changes, photos: [] };
}
