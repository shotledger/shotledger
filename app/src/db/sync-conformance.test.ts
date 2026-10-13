// The phone's writers produce rows the sync server accepts
// (docs/specs/sync-payload-validation-spec.md §2.5). The importers and the
// web builders assert the same in their own tests.
import { describe, expect, it } from 'vitest';

import { applyImport, dryRunImport } from './json-export/apply-import';
import { buildExportJson } from './json-export/build-export';
import { sessions } from './schema';
import { seedDemoData, wipeDemoData } from './seed';
import { unsyncableRows } from './sync-conformance';
import { createTestDb } from './test-db';

describe('rows the phone writes pass the server payload schemas', () => {
  it('every demo-data row', () => {
    const db = createTestDb();
    seedDemoData(db);
    expect(unsyncableRows(db)).toEqual([]);
  });

  it('every row of a JSON-export import, even one whose file names whole seconds', () => {
    const db = createTestDb();
    seedDemoData(db);
    // A file written by another tool: still valid ISO 8601, and `z.iso.datetime()`
    // accepts it, but not `toISOString()`'s shape, which the server requires.
    const json = buildExportJson(db, '1.0.0').replace(
      /("startedAt":\s*"[^"]*T\d{2}:\d{2}:\d{2})\.\d{3}Z"/g,
      '$1Z"',
    );
    expect(json).toMatch(/"startedAt":\s*"[^"]*:\d{2}Z"/);
    wipeDemoData(db);

    const { errors, groups } = dryRunImport(db, json);
    expect(errors).toEqual([]);
    applyImport(db, groups);

    expect(db.select().from(sessions).all().length).toBeGreaterThan(0);
    expect(unsyncableRows(db)).toEqual([]);
  });

  it('reports a row the server would refuse', () => {
    const db = createTestDb();
    seedDemoData(db);
    db.update(sessions).set({ startedAt: '2026-05-04T06:00:00Z' }).run();
    expect(unsyncableRows(db)).toEqual(['sessions:started_at:custom']);
  });
});
