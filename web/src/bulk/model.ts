// The Bulk Edit page's list, filter and selection
// (docs/specs/web-bulk-edit-spec.md §3.2, B9). Pure over the pulled tables.
import { localDayOf } from '@shotledger/shared/src/dates';
import type { BulkContext } from '@shotledger/shared/src/sync-client/bulk-edit';
import { tagNamesBySession } from '@shotledger/shared/src/tags/canonical';

import type { PulledTables } from '../pull';
import { tagRecords } from '../stats-inputs';

export interface BulkRow {
  id: string;
  startedAt: string;
  /** The local calendar day, YYYY-MM-DD. */
  day: string;
  name: string;
  disciplineId: string;
  location: string | null;
  firearmId: string | null;
  firearm: string | null;
  tags: string[];
}

export interface BulkFilter {
  /** Local days, YYYY-MM-DD, inclusive; '' for open. */
  from: string;
  to: string;
  search: string;
}

export const NO_FILTER: BulkFilter = { from: '', to: '', search: '' };

type Payload = Record<string, unknown>;

const isLive = (row: Payload) => row.deleted_at === null || row.deleted_at === undefined;

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export const firearmLabel = (row: Payload) => `${String(row.make)} ${String(row.model)}`;

/** Every live session, newest first. */
export function bulkRows(tables: PulledTables): BulkRow[] {
  const { tags, links } = tagRecords(tables);
  const tagNames = tagNamesBySession(tags, links);
  const rows: BulkRow[] = [];
  for (const row of tables.sessions.values()) {
    if (!isLive(row)) continue;
    const id = String(row.id);
    const startedAt = String(row.started_at);
    const firearmId = text(row.firearm_id);
    const firearm = firearmId === null ? undefined : tables.firearms.get(firearmId);
    rows.push({
      id,
      startedAt,
      day: localDayOf(startedAt),
      name: String(row.name),
      disciplineId: String(row.discipline_id),
      location: text(row.location),
      firearmId,
      firearm: firearm && isLive(firearm) ? firearmLabel(firearm) : null,
      tags: tagNames.get(id) ?? [],
    });
  }
  // Ids are unique, so the key orders every pair: newest first, then larger id.
  const key = (row: BulkRow) => `${row.startedAt}\u0000${row.id}`;
  return rows.sort((a, b) => (key(a) < key(b) ? 1 : -1));
}

export function filterRows(rows: readonly BulkRow[], filter: BulkFilter): BulkRow[] {
  const needle = filter.search.trim().toLowerCase();
  // An open From ('') sorts before every day; an empty needle matches every text.
  return rows.filter((row) => {
    if (row.day < filter.from) return false;
    if (filter.to !== '' && row.day > filter.to) return false;
    return [row.name, row.location, ...row.tags].some(
      (value) => value !== null && value.toLowerCase().includes(needle),
    );
  });
}

/** What an action changes: the selected sessions that are shown (B9). */
export function targetIds(selected: ReadonlySet<string>, shown: readonly BulkRow[]): string[] {
  return shown.filter((row) => selected.has(row.id)).map((row) => row.id);
}

/** The tag names on the given sessions, once each, sorted. */
export function tagNamesOn(rows: readonly BulkRow[], ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  const names = new Set<string>();
  for (const row of rows) if (wanted.has(row.id)) for (const name of row.tags) names.add(name);
  return [...names].sort();
}

/** The pulled tables as the builder takes them. */
export function bulkContext(tables: PulledTables): BulkContext {
  return {
    sessions: tables.sessions,
    tags: tables.tags,
    sessionTags: tables.session_tags,
    firearms: tables.firearms,
    series: tables.series,
    shots: tables.shots,
    faltStations: tables.falt_stations,
  };
}
