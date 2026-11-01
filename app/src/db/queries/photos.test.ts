import { beforeEach, describe, expect, it } from 'vitest';

import { listSeriesPhotos } from './photos';
import { addSeries, softDeleteSeries } from './series';
import { createSession } from './sessions';
import { createTestDb } from '../test-db';
import type { Database } from '../types';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe('listSeriesPhotos', () => {
  it('numbers each photo by its series order, not its stored position (#922)', () => {
    const session = createSession(db, {
      name: 'M',
      type: 'competition',
      disciplineId: 'spsf-milsnabb',
      programId: 'spsf-milsnabb',
      startedAt: '2026-11-01T09:00:00.000Z',
    });
    const sighter = addSeries(db, {
      sessionId: session.id,
      position: 1,
      isSighter: true,
      photoUri: 'file:///s.jpg',
    });
    const deleted = addSeries(db, { sessionId: session.id, position: 2 });
    addSeries(db, { sessionId: session.id, position: 3, photoUri: 'file:///3.jpg' });
    softDeleteSeries(db, deleted.id);

    const byUri = new Map(listSeriesPhotos(db).map((photo) => [photo.photoUri, photo]));
    expect(byUri.get('file:///s.jpg')).toMatchObject({ seriesId: sighter.id, number: null });
    expect(byUri.get('file:///3.jpg')).toMatchObject({ position: 3, number: 1 });
  });
});
