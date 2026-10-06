// Reads the whole account through /sync/pull from cursor 0 and keeps the
// live rows in memory. The web app never pushes and stores nothing after the
// tab closes (ADR 0013).
import type { PullRequest, PullResponse, SyncTableName } from '@shotledger/shared/src/sync';

/** The tables the Statistics report and the account download read. */
export const WEB_TABLES = [
  'sessions',
  'series',
  'shots',
  'falt_stations',
  'tags',
  'firearms',
  'licenses',
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
): Promise<PulledTables> {
  const tables = Object.fromEntries(WEB_TABLES.map((name) => [name, new Map()])) as PulledTables;
  let cursors: PullRequest['tables'] = WEB_TABLES.map((tableName) => ({ tableName, cursor: 0 }));
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
