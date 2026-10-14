// What a new session starts on: the discipline and firearm of the shooter's
// most recent session (#822, finding "Long forms": "discipline and firearm
// preselected from last time"). Shared by the phone's New Session form and
// the web's Enter Series page, so both preselect the same thing from the
// same sessions. Pure: the caller passes its live sessions and says which
// firearms a picker may offer.
import { disciplinesForRegulations, getDiscipline } from './index';

/** One live (not deleted) session, as either surface reads it. */
export interface PastSession {
  disciplineId: string;
  firearmId: string | null;
  /** ISO-8601; the latest one wins. */
  startedAt: string;
}

export interface LastSessionDefaults {
  /**
   * The first enabled regelverk, in the order given, that offers the
   * discipline; null with `disciplineId`.
   */
  regulationId: string | null;
  /** Null when the last session's discipline is not offered any more. */
  disciplineId: string | null;
  /** Null when the last session had none, or its firearm is not pickable. */
  firearmId: string | null;
}

export interface LastSessionOptions {
  /** The enabled regelverk ids, in the order the form lists them. */
  regulationIds: readonly string[];
  /** Whether a firearm picker offers this id (live and not archived). */
  isFirearmPickable: (firearmId: string) => boolean;
}

/** The most recent session by `startedAt`; ties keep the first given. */
export function mostRecentSession<T extends PastSession>(sessions: Iterable<T>): T | null {
  let latest: T | null = null;
  for (const session of sessions) {
    if (latest === null || session.startedAt > latest.startedAt) latest = session;
  }
  return latest;
}

/**
 * The defaults the last session gives a new one, or null when there is no
 * session at all (the form then keeps its own first-run defaults). Every
 * kind of session counts — series, rounds, fält, imported — because the
 * question is "what did I shoot last", not how it was logged. Each field
 * falls back on its own: a discipline no longer offered still lets the
 * firearm through, and an archived firearm still lets the discipline through.
 */
export function lastSessionDefaults(
  sessions: Iterable<PastSession>,
  options: LastSessionOptions,
): LastSessionDefaults | null {
  const last = mostRecentSession(sessions);
  if (last === null) return null;

  const known = getDiscipline(last.disciplineId) !== undefined;
  const regulationId = known
    ? (options.regulationIds.find((id) =>
        disciplinesForRegulations([id]).some((d) => d.id === last.disciplineId),
      ) ?? null)
    : null;

  return {
    regulationId,
    disciplineId: regulationId === null ? null : last.disciplineId,
    firearmId:
      last.firearmId !== null && options.isFirearmPickable(last.firearmId) ? last.firearmId : null,
  };
}
