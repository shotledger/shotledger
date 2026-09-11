// Reading an export back. Spec §3.2, criteria C8–C13 and property P22.
//
// Two levels of strictness, deliberately different:
//  * The ENVELOPE is all-or-nothing. A file that is not ours, or is from a
//    newer app, is refused outright — importing the half of a newer format we
//    happen to understand is the silent-data-loss mode this guards.
//  * A SESSION is rejected on its own. One corrupt session in a file of fifty
//    must not cost the other forty-nine, which is what the CSV layer did per
//    row and what a user with a hand-edited file needs.
import {
  envelopeSchema,
  JSON_EXPORT_VERSION,
  sessionExportSchema,
  type ImportError,
  type SeriesExport,
  type SessionExport,
} from './types';

export interface ImportResult {
  sessions: SessionExport[];
  /** Sessions that were skipped, with why. Empty on a clean file. */
  errors: ImportError[];
}

/**
 * Parses an export. Returns an `ImportError` when the FILE is unusable, or an
 * `ImportResult` — possibly with per-session errors — when it is.
 *
 * Total by construction (P22): every throw site is inside the try, and zod
 * reports rather than throws through `safeParse`.
 */
export function importSessionsFromJson(text: string): ImportResult | ImportError {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    // `String(error)` rather than a narrowing branch: JSON.parse only ever
    // throws SyntaxError, so the non-Error arm was unreachable and would have
    // sat uncovered forever pretending to be a guarded case.
    return { code: 'malformed-json', message: String(error) };
  }

  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) {
    return {
      code: 'not-a-shotledger-file',
      message: 'This file is not a ShotLedger export.',
    };
  }

  if (envelope.data.formatVersion > JSON_EXPORT_VERSION) {
    return {
      code: 'newer-format-version',
      message: `This file was written by a newer version of the app (format ${envelope.data.formatVersion}).`,
    };
  }

  const sessions: SessionExport[] = [];
  const errors: ImportError[] = [];

  envelope.data.sessions.forEach((candidate, sessionIndex) => {
    const parsed = sessionExportSchema.safeParse(candidate);
    if (parsed.success) {
      sessions.push(parsed.data);
      return;
    }
    errors.push({
      code: 'invalid-session',
      sessionIndex,
      message: parsed.error.issues.map((issue) => issue.path.join('.') || 'session').join(', '),
    });
  });

  return { sessions, errors };
}

/**
 * The plan layer's view of a session. Identical to `SessionExport` except for
 * the id's name, which is why it is an alias rather than a second shape: the
 * dry-run reconciliation predates this module (it came from the CSV layer with
 * its tests) and is not format-specific, so its vocabulary is preserved rather
 * than renamed through it.
 */
export type SeriesImportGroup = SeriesExport;

export interface SessionImportGroup extends Omit<SessionExport, 'id'> {
  sessionId: string;
}

/** Imported sessions in the shape `buildDryRunPlan` expects. */
export function toImportGroups(sessions: readonly SessionExport[]): SessionImportGroup[] {
  return sessions.map(({ id, ...rest }) => ({ sessionId: id, ...rest }));
}
