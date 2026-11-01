import { addSeries, softDeleteSeries } from '@/db/queries/series';
import { createSession } from '@/db/queries/sessions';
import { resetTestDb } from '@/test-utils/test-db-client';

import { loadSessionDetail } from './use-session-detail';

jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));

function milsnabbFullMatch() {
  const db = resetTestDb();
  const session = createSession(db, {
    name: 'M',
    type: 'competition',
    disciplineId: 'spsf-milsnabb',
    programId: 'spsf-milsnabb',
    startedAt: '2026-11-01T09:00:00.000Z',
  });
  const rows = Array.from({ length: 13 }, (_, i) =>
    addSeries(db, { sessionId: session.id, position: i + 1, isSighter: i === 0 }),
  );
  return { db, session, rows };
}

describe('loadSessionDetail series numbers (#922)', () => {
  it('numbers the match series 1..12 under a laid-out sighter, times by layout slot', () => {
    const { session } = milsnabbFullMatch();
    const detail = loadSessionDetail(session.id);
    expect(detail.seriesRows.map((row) => row.number)).toEqual([
      null,
      ...Array.from({ length: 12 }, (_, i) => i + 1),
    ]);
    expect(detail.seriesRows.map((row) => row.timeLimitSeconds)).toEqual([
      10, 10, 10, 10, 10, 8, 8, 8, 8, 6, 6, 6, 6,
    ]);
  });

  it('reads Series 1..12 once the sighter is deleted, each keeping its time', () => {
    const { db, session, rows } = milsnabbFullMatch();
    softDeleteSeries(db, rows[0]!.id);
    const detail = loadSessionDetail(session.id);
    expect(detail.seriesRows.map((row) => row.number)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
    expect(detail.seriesRows.map((row) => row.timeLimitSeconds)).toEqual([
      10, 10, 10, 10, 8, 8, 8, 8, 6, 6, 6, 6,
    ]);
  });

  it('closes the gap a deleted match series leaves', () => {
    const { db, session, rows } = milsnabbFullMatch();
    softDeleteSeries(db, rows[3]!.id);
    const detail = loadSessionDetail(session.id);
    expect(detail.seriesRows.map((row) => row.number)).toEqual([
      null,
      ...Array.from({ length: 11 }, (_, i) => i + 1),
    ]);
  });
});
