import { beforeEach, describe, expect, it } from 'vitest';
import { buildProgramSkeleton, getProgram } from '@shotledger/shared';

import { createTestDb } from '../test-db';
import type { Database } from '../types';
import { canChangeMatchFormat, changeMatchFormat } from './match-format';
import { addSeries, listSeriesForSession, updateSeries } from './series';
import { createSession, getSession } from './sessions';
import { addShot } from './shots';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

function newSession(disciplineId: string, programId: string | null) {
  const session = createSession(db, {
    name: 'S',
    type: 'training',
    disciplineId,
    programId,
    startedAt: '2026-01-01T00:00:00.000Z',
  });
  const program = programId ? getProgram(programId)! : null;
  for (const entry of program ? buildProgramSkeleton(program) : []) {
    addSeries(db, {
      sessionId: session.id,
      position: entry.position,
      isSighter: entry.isSighter,
    });
  }
  return session.id;
}

describe('changeMatchFormat', () => {
  it('lays out the skeleton when an empty free session switches to Full Match', () => {
    const id = newSession('spsf-milsnabb', null);
    addSeries(db, { sessionId: id, position: 1 });

    expect(changeMatchFormat(db, id, 'spsf-milsnabb')).toBe(true);

    const rows = listSeriesForSession(db, id);
    expect(getSession(db, id)?.programId).toBe('spsf-milsnabb');
    expect(rows).toHaveLength(buildProgramSkeleton(getProgram('spsf-milsnabb')!).length);
    expect(rows[0]?.isSighter).toBe(1);
    expect(rows.slice(1).every((row) => row.isSighter === 0)).toBe(true);
  });

  it('drops the empty skeleton when Full Match switches to Free Format', () => {
    const id = newSession('spsf-milsnabb', 'spsf-milsnabb');

    expect(changeMatchFormat(db, id, null)).toBe(true);

    expect(getSession(db, id)?.programId).toBeNull();
    expect(listSeriesForSession(db, id)).toHaveLength(0);
  });

  it('switches Precision both ways, which has no skeleton to lay out', () => {
    const id = newSession('spsf-precision', null);

    expect(changeMatchFormat(db, id, 'spsf-precision')).toBe(true);
    expect(getSession(db, id)?.programId).toBe('spsf-precision');
    expect(listSeriesForSession(db, id)).toHaveLength(0);

    expect(changeMatchFormat(db, id, null)).toBe(true);
    expect(getSession(db, id)?.programId).toBeNull();
  });

  it('refuses once a shot is logged, and changes nothing', () => {
    const id = newSession('spsf-milsnabb', 'spsf-milsnabb');
    const first = listSeriesForSession(db, id)[1]!;
    addShot(db, { seriesId: first.id, position: 1, valueTenths: 90 });

    expect(canChangeMatchFormat(db, id)).toBe(false);
    expect(changeMatchFormat(db, id, null)).toBe(false);
    expect(getSession(db, id)?.programId).toBe('spsf-milsnabb');
    expect(listSeriesForSession(db, id).map((row) => row.id)).toContain(first.id);
  });

  it('refuses a Precision session with a final', () => {
    const id = newSession('spsf-precision', 'spsf-precision');
    const final = addSeries(db, { sessionId: id, position: 1, isFinal: true });
    addShot(db, { seriesId: final.id, position: 1, valueTenths: 100 });

    expect(changeMatchFormat(db, id, null)).toBe(false);
    expect(getSession(db, id)?.programId).toBe('spsf-precision');
  });

  it('treats a photo awaiting scoring and an imported total as results', () => {
    const photo = newSession('spsf-precision', null);
    const row = addSeries(db, { sessionId: photo, position: 1 });
    updateSeries(db, row.id, { photoUri: 'file:///target.jpg' });
    expect(canChangeMatchFormat(db, photo)).toBe(false);

    const imported = newSession('spsf-precision', null);
    addSeries(db, {
      sessionId: imported,
      position: 1,
      isTotalOverride: true,
      totalOverrideTenths: 480,
      totalOverrideShotCount: 5,
    });
    expect(canChangeMatchFormat(db, imported)).toBe(false);
  });

  it('rejects an unknown program', () => {
    const id = newSession('spsf-precision', null);
    expect(() => changeMatchFormat(db, id, 'no-such-program')).toThrow(RangeError);
  });
});
