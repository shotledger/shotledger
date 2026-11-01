import { addSeries } from '@/db/queries/series';
import { createSession } from '@/db/queries/sessions';
import { addShot } from '@/db/queries/shots';
import type { Database } from '@/db/types';
import { resetTestDb } from '@/test-utils/test-db-client';

import { loadSessionStats } from './use-session-stats';

jest.mock('@/db/client', () => require('@/test-utils/test-db-client').testDbClient);
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));

let db: Database;

beforeEach(() => {
  db = resetTestDb();
});

describe('loadSessionStats', () => {
  it('counts only the series with shots, as the mean does, in a match laid out ahead', () => {
    const session = createSession(db, {
      name: 'Milsnabb',
      type: 'competition',
      disciplineId: 'spsf-milsnabb',
      weaponGroup: 'spsf:A',
      shooterClass: '3',
      firearmId: null,
      ammoLotId: null,
      startedAt: '2026-11-01T09:00:00.000Z',
    });
    // A sighter and twelve scoring series, as Full Match lays them out; only
    // four are shot, and the sighter is not.
    addSeries(db, { sessionId: session.id, position: 1, isSighter: true });
    for (let position = 2; position <= 13; position++) {
      const series = addSeries(db, { sessionId: session.id, position });
      if (position > 5) continue;
      for (let shot = 1; shot <= 5; shot++) {
        addShot(db, { seriesId: series.id, position: shot, valueTenths: shot === 1 ? 70 : 100 });
      }
    }

    const stats = loadSessionStats(session.id);

    expect(stats.seriesCount).toBe(4);
    expect(stats.seriesMeanTenths).toBe(470);
  });
});
