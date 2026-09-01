// M6 (§6.6): the single query feeding shared/src/compliance's barometer —
// tombstoned sessions excluded by the same isNull(deletedAt) filter every
// other query uses. extra_rounds never create activities: this reads only
// session identity/type/weaponGroup, never touches the extra_rounds column.
import { isNull } from 'drizzle-orm';
import type { ComplianceSession } from '@shotledger/shared';

import { sessions } from '../schema';
import type { Database } from '../types';

export function listComplianceSessions(db: Database): ComplianceSession[] {
  return db
    .select({
      id: sessions.id,
      startedAt: sessions.startedAt,
      type: sessions.type,
      weaponGroup: sessions.weaponGroup,
    })
    .from(sessions)
    .where(isNull(sessions.deletedAt))
    .all();
}
