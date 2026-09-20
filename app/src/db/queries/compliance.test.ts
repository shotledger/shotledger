// The compliance query is the only bridge between the sessions table and
// shared/src/compliance. #329 added `firearm_id` to what it carries, and a
// column dropped here is silently a criterion that counts nothing.
import { beforeEach, describe, expect, it } from 'vitest';
import { computeFirearmCriteria, getProfile } from '@shotledger/shared';

import { listComplianceSessions } from './compliance';
import { createFirearm } from './firearms';
import { createSession, softDeleteSession } from './sessions';
import { createTestDb } from '../test-db';
import type { Database } from '../types';

let db: Database;
let firearmId: string;

beforeEach(() => {
  db = createTestDb();
  firearmId = createFirearm(db, { make: 'A', model: '1', weaponType: 'pistol' }).id;
});

function session(overrides: Parameters<typeof createSession>[1]) {
  return createSession(db, overrides);
}

describe('listComplianceSessions', () => {
  it('carries the firearm the session was shot with', () => {
    session({
      name: 's',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: new Date().toISOString(),
      firearmId,
    });
    expect(listComplianceSessions(db)[0]?.firearmId).toBe(firearmId);
  });

  it('carries null for a session with no firearm recorded', () => {
    session({
      name: 's',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: new Date().toISOString(),
    });
    expect(listComplianceSessions(db)[0]?.firearmId).toBeNull();
  });

  it('still excludes tombstoned sessions', () => {
    const s = session({
      name: 's',
      type: 'training',
      disciplineId: 'spsf-precision',
      startedAt: new Date().toISOString(),
      firearmId,
    });
    softDeleteSession(db, s.id);
    expect(listComplianceSessions(db)).toHaveLength(0);
  });

  it('feeds the per-firearm criteria end to end', () => {
    for (let i = 0; i < 2; i += 1) {
      session({
        name: `s${i}`,
        type: 'training',
        disciplineId: 'spsf-precision',
        startedAt: new Date(Date.now() - i * 86_400_000).toISOString(),
        firearmId,
      });
    }
    const [additionalHandgun] = computeFirearmCriteria(
      listComplianceSessions(db),
      getProfile('se'),
      { id: firearmId, weaponType: 'pistol', isOwn: true, hasTimeLimitedPermit: false },
    );
    expect(additionalHandgun?.met).toBe(true);
    expect(additionalHandgun?.activityCount).toBe(2);
  });
});
