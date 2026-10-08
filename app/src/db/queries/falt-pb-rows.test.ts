import { describe, expect, it } from 'vitest';

import { addStation } from './falt';
import { createSession } from './sessions';
import { listFaltAnalyticsSessions } from './stats';
import { createTestDb } from '../test-db';
import type { Database } from '../types';

import { faltPbRows } from './falt-pb-rows';

function faltSession(db: Database, name: string, startedAt: string) {
  return createSession(db, {
    name,
    type: 'competition',
    disciplineId: 'spsf-falt',
    weaponGroup: 'spsf:C',
    startedAt,
  }).id;
}

describe('faltPbRows (#670)', () => {
  it("carries the best round's possible hits and figure count, scratched and shoot-off left out", () => {
    const db = createTestDb();
    const id = faltSession(db, 'Kretsfält', '2026-05-10T09:00:00.000Z');
    addStation(db, { sessionId: id, position: 1, hits: 6, figuresHit: 3, figureCount: 4 });
    addStation(db, { sessionId: id, position: 2, hits: 5, figuresHit: 4, figureCount: 5 });
    addStation(db, { sessionId: id, position: 3, hits: 4, figuresHit: 2, isScratched: true });
    addStation(db, { sessionId: id, position: 4, hits: 6, figuresHit: 6, isShootOff: true });

    const [row] = faltPbRows(db, listFaltAnalyticsSessions(db));

    expect(row).toMatchObject({
      sessionId: id,
      sessionName: 'Kretsfält',
      stationCount: 2,
      hits: 11,
      hitsPossible: 12,
      figuresHit: 7,
      figureCount: 9,
    });
  });

  it('has no figure count when a scoring station of the best round lacks one', () => {
    const db = createTestDb();
    const id = faltSession(db, 'Klubbfält', '2026-05-10T09:00:00.000Z');
    addStation(db, { sessionId: id, position: 1, hits: 6, figuresHit: 3, figureCount: 4 });
    addStation(db, { sessionId: id, position: 2, hits: 5, figuresHit: 4 });

    const [row] = faltPbRows(db, listFaltAnalyticsSessions(db));

    expect(row).toMatchObject({ hitsPossible: 12, figureCount: null });
  });
});
