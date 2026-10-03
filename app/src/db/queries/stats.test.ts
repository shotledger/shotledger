import { beforeEach, describe, expect, it } from 'vitest';

import { addSeries } from './series';
import { createSession } from './sessions';
import { addShot } from './shots';
import { listAllStatsSeries } from './stats';
import { createTestDb } from '../test-db';
import type { Database } from '../types';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe('listAllStatsSeries', () => {
  it('joins session fields onto each of its series, with shots attached', () => {
    const session = createSession(db, {
      name: 'S',
      type: 'training',
      disciplineId: 'spsf-precision',
      weaponGroup: 'spsf:C',
      shooterClass: '2',
      firearmId: null,
      ammoLotId: null,
      startedAt: '2026-01-05T00:00:00.000Z',
    });
    const s1 = addSeries(db, { sessionId: session.id, position: 1, isSighter: true });
    const s2 = addSeries(db, { sessionId: session.id, position: 2 });
    addShot(db, { seriesId: s1.id, position: 1, valueTenths: 90 });
    addShot(db, { seriesId: s2.id, position: 1, valueTenths: 100, isInnerTen: true });
    addShot(db, { seriesId: s2.id, position: 2, valueTenths: 80 });

    const result = listAllStatsSeries(db);
    expect(result).toHaveLength(2);

    const scored = result.find((row) => row.id === s2.id)!;
    expect(scored).toMatchObject({
      sessionId: session.id,
      startedAt: '2026-01-05T00:00:00.000Z',
      disciplineId: 'spsf-precision',
      weaponGroup: 'spsf:C',
      shooterClass: '2',
      isSighter: false,
      isFinal: false,
    });
    expect(scored.shots).toEqual([
      { valueTenths: 100, isInnerTen: true },
      { valueTenths: 80, isInnerTen: false },
    ]);

    const sighter = result.find((row) => row.id === s1.id)!;
    expect(sighter.isSighter).toBe(true);
    expect(sighter.shots).toEqual([{ valueTenths: 90, isInnerTen: false }]);
  });

  it('a series with no shots yet has an empty shots array, not undefined', () => {
    const session = createSession(db, {
      name: 'S',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: '2026-01-01T00:00:00.000Z',
    });
    addSeries(db, { sessionId: session.id, position: 1 });

    expect(listAllStatsSeries(db)[0]!.shots).toEqual([]);
  });

  it('excludes soft-deleted sessions, series, and shots', () => {
    const keptSession = createSession(db, {
      name: 'kept',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: '2026-01-01T00:00:00.000Z',
    });
    const keptSeries = addSeries(db, { sessionId: keptSession.id, position: 1 });
    addShot(db, { seriesId: keptSeries.id, position: 1, valueTenths: 90 });

    expect(listAllStatsSeries(db)).toHaveLength(1);
  });
});

it('tags each series with its program stage, by position', () => {
  const session = createSession(db, {
    name: 'H',
    type: 'competition',
    disciplineId: 'spsf-helmatch',
    programId: 'spsf-helmatch',
    startedAt: '2026-01-05T00:00:00.000Z',
  });
  const ids = [1, 6, 11, 15].map(
    (position) => addSeries(db, { sessionId: session.id, position }).id,
  );
  const stageById = new Map(listAllStatsSeries(db).map((series) => [series.id, series.stage]));
  expect(ids.map((id) => stageById.get(id))).toEqual(['A', 'B', 'C', null]);
});
