import { uuidv7 } from 'uuidv7';

/** UUIDv7 id for a new row — sortable, sync-friendly (§2). */
export function newId(): string {
  return uuidv7();
}

/** UTC ISO-8601 timestamp for created_at/updated_at columns. */
export function nowIso(): string {
  return new Date().toISOString();
}
