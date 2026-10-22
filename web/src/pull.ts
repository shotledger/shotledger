// Reads the account through /sync/pull from cursor 0 and keeps the live rows
// in memory; nothing is stored after the tab closes (ARCHITECTURE.md § Web app). Writes go
// through entry/ (ARCHITECTURE.md § Web app).
import type { PullRequest, PullResponse, SyncTableName } from '@shotledger/shared/src/sync';

/** The tables the pages read: Statistics, the account download (which carries
 *  the maintenance log, #727 M6), Enter Series, the Firearms pages (#796). */
export const WEB_TABLES = [
  'sessions',
  'series',
  'shots',
  'falt_stations',
  'tags',
  'firearms',
  'firearm_groups',
  'firearm_calibers',
  'licenses',
  'maintenance_events',
  'sight_settings',
  'ammo_lots',
  'session_tags',
  'settings',
] as const satisfies readonly SyncTableName[];

export type WebTable = (typeof WEB_TABLES)[number];

/** Each table's live rows by id, payload as the wire carries it (snake_case). */
export type PulledTables = Record<WebTable, Map<string, Record<string, unknown>>>;

export interface PullTransport {
  pull(request: PullRequest): Promise<PullResponse>;
}

export async function pullAll(
  transport: PullTransport,
  protocolVersion: number,
  onProgress?: (rowsSoFar: number) => void,
  /** A subset to pull; the other tables come back empty. */
  only: readonly WebTable[] = WEB_TABLES,
): Promise<PulledTables> {
  const tables = Object.fromEntries(WEB_TABLES.map((name) => [name, new Map()])) as PulledTables;
  let cursors: PullRequest['tables'] = only.map((tableName) => ({ tableName, cursor: 0 }));
  let rows = 0;

  while (cursors.length > 0) {
    const response = await transport.pull({ protocolVersion, tables: cursors });
    for (const change of response.changes) {
      const table = tables[change.tableName as WebTable] as
        Map<string, Record<string, unknown>> | undefined;
      if (!table) continue;
      if (change.deletedAt !== null || change.payload === null) {
        table.delete(change.rowId);
      } else {
        table.set(change.rowId, change.payload as Record<string, unknown>);
      }
    }
    rows += response.changes.length;
    onProgress?.(rows);
    cursors = response.nextCursors
      .filter((next) => next.hasMore)
      .map(({ tableName, cursor }) => ({ tableName, cursor }));
  }
  return tables;
}
