// The tags of a web-entered session, applied to the phone's real schema
// through its real apply path (docs/specs/web-entry-tags-spec.md A1–A3).
import {
  buildSessionEntry,
  newSessionTagRow,
  newTagRow,
  withEntryTags,
  type ChangeRow,
} from '@shotledger/shared';
import { getTableColumns } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';

import { sessionTags, syncOutbox, tags } from '../schema';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { createSession, getSession } from './sessions';
import { applyChangesSync, readRowSync } from './sync-store';
import { addSessionTag, createTag, getOrCreateTag, listTags, listTagsForSession } from './tags';

const NOW = '2026-10-10T08:00:00.000Z';

const columnNames = (table: SQLiteTable) =>
  Object.values(getTableColumns(table))
    .map((column) => column.name)
    .sort();

it('A1 column parity: the tag row builders carry exactly the table columns', () => {
  expect(Object.keys(newTagRow('t', NOW, 'KM')).sort()).toEqual(columnNames(tags));
  expect(Object.keys(newSessionTagRow('l', NOW, 's', 't')).sort()).toEqual(
    columnNames(sessionTags),
  );
});

describe('a tagged web entry applied with applyChangesSync', () => {
  let db: Database;
  let km: string;
  let sessionId: string;

  beforeEach(() => {
    db = createTestDb();
    // Two copies of KM, as two devices create one offline; the first is canonical.
    km = createTag(db, 'KM').id;
    const copy = createTag(db, 'KM').id;
    // What the web pulled: the phone's own tag payloads.
    const pulled = new Map(
      [km, copy].map((id) => [id, readRowSync(db, 'tags', id)!.payload as Record<string, unknown>]),
    );
    db.delete(syncOutbox).run();

    let n = 0;
    const deps = {
      newId: uuidv7,
      newChangeId: () => `00000000-0000-4000-8000-${(n += 1).toString(16).padStart(12, '0')}`,
      now: () => NOW,
    };
    const entry = buildSessionEntry(
      {
        type: 'training',
        disciplineId: 'spsf-precision',
        programId: null,
        startedAt: '2026-10-06T16:00:00.000Z',
        name: 'Web',
        defaultName: 'Training',
        location: '',
        competitionLevel: null,
        isChampionship: false,
        competitionName: '',
        weaponGroup: null,
        shooterClass: null,
        eventId: null,
        firearmId: null,
        ammoLotId: null,
        decimalScoring: false,
        seriesLength: null,
        series: [{ text: '10 9 X 10 9', isSighter: false }],
      },
      { firearms: new Map(), firearmGroups: [], ammoLots: new Map() },
      deps,
    );
    const result = withEntryTags(entry, ['KM', ' Club '], pulled, deps);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    sessionId = result.sessionId;
    const rows: ChangeRow[] = result.changes.map((change, index) => ({
      tableName: change.tableName,
      rowId: change.rowId,
      seq: index + 1,
      payload: change.payload,
      deletedAt: change.deletedAt,
      updatedAt: change.updatedAt,
    }));
    applyChangesSync(db, rows);
  });

  it('A2 the phone reads the session with both tags, each name once, and re-queues nothing', () => {
    expect(getSession(db, sessionId)).toMatchObject({ name: 'Web', deletedAt: null });
    // In link order: the order the names were added on the web.
    expect(listTagsForSession(db, sessionId).map((tag) => [tag.id === km, tag.name])).toEqual([
      [true, 'KM'],
      [false, 'Club'],
    ]);
    expect(listTags(db).map((tag) => tag.name)).toEqual(['Club', 'KM']);
    expect(db.select().from(syncOutbox).all()).toHaveLength(0);
  });

  it("A3 the phone's getOrCreateTag + addSessionTag link the very tags the web linked", () => {
    const webLinks = db
      .select()
      .from(sessionTags)
      .all()
      .filter((link) => link.sessionId === sessionId)
      .map((link) => link.tagId);
    const phoneSession = createSession(db, {
      name: 'Phone',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: '2026-10-06T17:00:00.000Z',
    }).id;
    const phoneLinks = ['KM', 'Club'].map((name) => {
      const tag = getOrCreateTag(db, name);
      addSessionTag(db, phoneSession, tag.id);
      return tag.id;
    });
    expect(webLinks).toEqual(phoneLinks);
    // The phone created no tag of its own: the web's Club is the one it found.
    expect(db.select().from(tags).all()).toHaveLength(3);
    expect(listTagsForSession(db, phoneSession).map((tag) => tag.name)).toEqual(['KM', 'Club']);
  });
});
