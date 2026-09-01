import { beforeEach, describe, expect, it } from 'vitest';

import { createFirearm } from './firearms';
import { createTestDb } from '../test-db';
import type { Database } from '../types';
import {
  addFirearmGroup,
  getDefaultFirearmForGroup,
  listFirearmGroups,
  setDefaultFirearmGroup,
  softDeleteFirearmGroup,
} from './firearm-groups';

let db: Database;
let firearmId: string;

beforeEach(() => {
  db = createTestDb();
  firearmId = createFirearm(db, { make: 'A', model: '1' }).id;
});

describe('addFirearmGroup', () => {
  it('links a firearm to a federation-scoped group id', () => {
    const g = addFirearmGroup(db, { firearmId, groupId: 'spsf:C' });
    expect(g.groupId).toBe('spsf:C');
    expect(g.isDefaultForGroup).toBe(0);
  });

  it('setting default clears any previous default for that group', () => {
    const other = createFirearm(db, { make: 'B', model: '2' }).id;
    addFirearmGroup(db, { firearmId, groupId: 'spsf:C', isDefaultForGroup: true });
    addFirearmGroup(db, { firearmId: other, groupId: 'spsf:C', isDefaultForGroup: true });
    const def = getDefaultFirearmForGroup(db, 'spsf:C');
    expect(def?.firearmId).toBe(other);
  });
});

describe('setDefaultFirearmGroup', () => {
  it('moves the default flag to the given row', () => {
    const g1 = addFirearmGroup(db, { firearmId, groupId: 'spsf:C', isDefaultForGroup: true });
    const other = createFirearm(db, { make: 'B', model: '2' }).id;
    const g2 = addFirearmGroup(db, { firearmId: other, groupId: 'spsf:C' });
    setDefaultFirearmGroup(db, g2.id);
    expect(getDefaultFirearmForGroup(db, 'spsf:C')?.id).toBe(g2.id);
    void g1;
  });
});

describe('listFirearmGroups', () => {
  it('excludes tombstoned rows', () => {
    const g1 = addFirearmGroup(db, { firearmId, groupId: 'spsf:C' });
    const g2 = addFirearmGroup(db, { firearmId, groupId: 'spsf:B' });
    softDeleteFirearmGroup(db, g1.id);
    expect(listFirearmGroups(db, firearmId).map((g) => g.id)).toEqual([g2.id]);
  });
});
