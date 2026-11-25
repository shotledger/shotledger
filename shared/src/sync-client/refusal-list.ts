// What Account & Sync lists for each refused change
// (docs/specs/sync-discard-refused-spec.md §2.2). Pure: both clients pass
// their own lookup, the phone its local DB and the web its pulled tables.
import { firearmDisplayName } from '../json-export/plan';
import { familyKind, ownerOf, type RowRef } from '../sync/family';
import type { RefusalEntry, SyncTableName } from '../sync/protocol';

/** A row's columns by DB name, deleted rows included; undefined when not held. */
export type RowLookup = (ref: RowRef) => Record<string, unknown> | undefined;

export type BadRowContext =
  | { kind: 'session'; name: string | null; startedAt: string | null }
  | { kind: 'firearm'; label: string };

export interface BadRow {
  tableName: SyncTableName;
  rowId: string;
  /** How many waiting rows name it as their blocker. */
  waiting: number;
  /** The lookup found the bad row itself. */
  held: boolean;
  /** Its family's root; the row itself when it is one; null when unknown. */
  root: RowRef | null;
  context: BadRowContext | null;
  /** `member`: a session-family row under its root; `root`: a session or a
   *  firearm; `other`: anything else. Picks the confirm's second line. */
  role: 'member' | 'root' | 'other';
}

const ROOTS: ReadonlySet<SyncTableName> = new Set(['sessions', 'firearms']);

const sameRow = (a: RowRef, b: RowRef) => a.tableName === b.tableName && a.rowId === b.rowId;

function roleOf(tableName: SyncTableName): BadRow['role'] {
  if (ROOTS.has(tableName)) return 'root';
  return familyKind(tableName) === 'session' ? 'member' : 'other';
}

/** Walks ownership edges up to a root; null when a row on the way is not held. */
function rootOf(ref: RowRef, row: Record<string, unknown> | undefined, lookup: RowLookup) {
  let at = ref;
  let atRow = row;
  while (!ROOTS.has(at.tableName)) {
    const owner = ownerOf(at.tableName, atRow);
    if (owner === null) return null;
    at = owner;
    atRow = lookup(owner);
    if (atRow === undefined) return null;
  }
  return at;
}

function contextOf(root: RowRef, row: Record<string, unknown> | undefined): BadRowContext | null {
  if (row === undefined) return null;
  if (root.tableName === 'firearms') {
    return { kind: 'firearm', label: firearmDisplayName(row as { make: string; model: string }) };
  }
  const name = typeof row.name === 'string' && row.name.trim() !== '' ? row.name : null;
  // The row was refused, so its date may not be one; the title then goes without.
  const startedAt =
    typeof row.started_at === 'string' && !Number.isNaN(Date.parse(row.started_at))
      ? row.started_at
      : null;
  return { kind: 'session', name, startedAt };
}

export function badRows(refusals: readonly RefusalEntry[], lookup: RowLookup): BadRow[] {
  return refusals
    .filter((entry) => entry.reason === 'invalid_payload')
    .map((entry) => {
      const ref: RowRef = { tableName: entry.tableName, rowId: entry.rowId };
      const row = lookup(ref);
      // A table with no family has no ownership edge, so no root.
      const root = rootOf(ref, row, lookup);
      return {
        tableName: ref.tableName,
        rowId: ref.rowId,
        waiting: refusals.filter((w) => w.blocker !== null && sameRow(w.blocker, ref)).length,
        held: row !== undefined,
        root,
        context: root === null ? null : contextOf(root, sameRow(root, ref) ? row : lookup(root)),
        role: roleOf(ref.tableName),
      };
    });
}

/**
 * The row's title on both clients: its kind, then its family's name. `kind`
 * is the translated `account.refusal.kind.<table>`; `date` formats a date.
 */
export function badRowTitle(row: BadRow, kind: string, date: (iso: string) => string): string {
  const context = row.context;
  if (context === null) return kind;
  if (context.kind === 'firearm') return `${kind} · ${context.label}`;
  const parts = [context.name, context.startedAt === null ? null : date(context.startedAt)];
  const label = parts.filter((part): part is string => part !== null).join(', ');
  return label === '' ? kind : `${kind} · ${label}`;
}

/** The confirm's paragraphs (spec §2.3): the body, then what becomes of the
 *  rest of the family. Each client maps a part to its own literal i18n key. */
export type ConfirmPart = 'body' | 'member' | 'root';

export function confirmParts(role: BadRow['role']): ConfirmPart[] {
  return role === 'other' ? ['body'] : ['body', role];
}
