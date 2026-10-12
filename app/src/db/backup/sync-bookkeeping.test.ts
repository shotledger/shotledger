// docs/specs/backup-sync-bookkeeping-spec.md B7: the export path, rehearsed with
// better-sqlite3 because export-bundle.ts itself needs expo-sqlite.
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';

import { createFirearm } from '../queries/firearms';
import { enqueuePhotoTask } from '../queries/photo-queue';
import { createSession } from '../queries/sessions';
import { createSyncStore, resetSyncBookkeeping, SYNC_TABLES } from '../queries/sync-store';
import * as schema from '../schema';
import { photoQueue, syncControl, syncOutbox, syncState } from '../schema';
import { createTestDb } from '../test-db';
import type { Database as Db } from '../types';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function bookkeeping(db: Db) {
  return {
    outbox: db.select().from(syncOutbox).all(),
    state: db.select().from(syncState).all(),
    control: db.select().from(syncControl).all(),
    photos: db.select().from(photoQueue).all(),
  };
}

function userRows(db: Db) {
  return Object.fromEntries(
    Object.entries(SYNC_TABLES).map(([name, table]) => [name, db.select().from(table).all()]),
  );
}

it('B7 a VACUUM INTO copy is reset while the live database keeps its bookkeeping', async () => {
  const live = createTestDb();
  const firearm = createFirearm(live, { make: 'Pardini', model: 'SP' });
  createSession(live, {
    name: 'S',
    type: 'training',
    disciplineId: 'spsf-precision',
    firearmId: firearm.id,
    startedAt: '2026-10-01T10:00:00.000Z',
  });
  await createSyncStore(live).setCursor('sessions', 12);
  enqueuePhotoTask(live, 'upload', 'photo-1', 'file:///device/photo-1.jpg');
  live.update(syncControl).set({ lastRev: 7 }).where(eq(syncControl.id, 0)).run();
  const liveBefore = bookkeeping(live);
  expect(liveBefore.outbox.length).toBeGreaterThan(0);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-757-'));
  dirs.push(dir);
  const copyPath = path.join(dir, 'copy.sqlite3');
  live.$client.prepare('VACUUM INTO ?').run(copyPath);
  const copySqlite = new Database(copyPath);
  try {
    const copy = drizzle(copySqlite, { schema });

    resetSyncBookkeeping(copy);

    expect(bookkeeping(copy)).toEqual({
      outbox: [],
      state: [],
      control: [{ id: 0, applying: 0, lastRev: 0 }],
      photos: [],
    });
    expect(bookkeeping(live)).toEqual(liveBefore);
    expect(userRows(copy)).toEqual(userRows(live));
  } finally {
    copySqlite.close();
  }
});
