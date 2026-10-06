import { beforeEach, describe, expect, it } from 'vitest';

import type { AssistEntry } from '@/features/photo-scoring/assist-log';

import { createTestDb } from '../test-db';
import type { Database } from '../types';
import {
  ASSIST_LOG_KEY,
  ASSIST_LOG_LIMIT,
  appendAssistEntry,
  clearAssistLog,
  getAssistLog,
} from './assist-log';
import { setSetting } from './settings';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

function entry(at: string): AssistEntry {
  return {
    at,
    faceId: 'spsf-precision',
    lock: 'auto',
    flags: {},
    seriesLength: 5,
    caliberMm: 5.6,
    outcome: 'ran',
    timingsMs: { lock: 1, suggest: 2, marking: 3 },
    counts: { suggested: 0, filled: 0, kept: 0, nudged: 0, deleted: 0, deletedFilled: 0, added: 0 },
    suggestions: [],
    marks: [],
  };
}

describe('assist log', () => {
  it('starts empty, appends in order and clears', () => {
    expect(getAssistLog(db)).toEqual([]);
    appendAssistEntry(db, entry('1'));
    appendAssistEntry(db, entry('2'));
    expect(getAssistLog(db).map((e) => e.at)).toEqual(['1', '2']);
    clearAssistLog(db);
    expect(getAssistLog(db)).toEqual([]);
  });

  it('drops the oldest entries past the limit', () => {
    setSetting(
      db,
      ASSIST_LOG_KEY,
      Array.from({ length: ASSIST_LOG_LIMIT }, (_, i) => entry(String(i))),
    );
    appendAssistEntry(db, entry('new'));
    const log = getAssistLog(db);
    expect(log).toHaveLength(ASSIST_LOG_LIMIT);
    expect(log[0]?.at).toBe('1');
    expect(log[log.length - 1]?.at).toBe('new');
  });

  it('reads a malformed value as empty', () => {
    setSetting(db, ASSIST_LOG_KEY, { not: 'an array' });
    expect(getAssistLog(db)).toEqual([]);
  });
});
