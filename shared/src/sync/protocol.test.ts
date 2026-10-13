import { describe, expect, it } from 'vitest';

import { FEATURE_SETTING_KEYS } from '../features/visibility';
import {
  ChangeRowSchema,
  checkProtocolVersion,
  ClientChangeSchema,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  PROTOCOL_VERSION_UNSUPPORTED,
  PullRequestSchema,
  PullResponseSchema,
  PushRequestSchema,
  PushResponseSchema,
  isSyncableSettingRow,
  isSyncedSettingKey,
  SYNC_TABLE_NAMES,
  SYNCED_SETTING_KEYS,
  SyncTableNameSchema,
} from './protocol';

const validClientChange = {
  clientChangeId: '11111111-1111-4111-8111-111111111111',
  tableName: 'firearms',
  rowId: 'row-1',
  payload: { make: 'Anschutz' },
  deletedAt: null,
  updatedAt: '2026-08-01T00:00:00.000Z',
};

describe('SyncTableNameSchema', () => {
  it('G1 accepts every documented syncable table', () => {
    for (const name of [
      'firearms',
      'licenses',
      'firearm_groups',
      'ammo_lots',
      'sessions',
      'series',
      'shots',
      'maintenance_events',
      'tags',
      'sight_settings',
    ]) {
      expect(SyncTableNameSchema.safeParse(name).success).toBe(true);
    }
  });

  // Excluded until the maintainer's 2026-10-06 ruling (spec §1); now synced.
  it('G2 accepts settings and session_tags', () => {
    expect(SyncTableNameSchema.safeParse('settings').success).toBe(true);
    expect(SyncTableNameSchema.safeParse('session_tags').success).toBe(true);
  });

  it('G2b rejects an unknown table name (negative control)', () => {
    expect(SyncTableNameSchema.safeParse('not_a_table').success).toBe(false);
  });
});

describe('ChangeRowSchema', () => {
  it('C1 accepts a live row with a payload', () => {
    const result = ChangeRowSchema.safeParse({
      tableName: 'firearms',
      rowId: 'row-1',
      seq: 1,
      payload: { make: 'Anschutz' },
      deletedAt: null,
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('C2 accepts a tombstone with a null payload', () => {
    const result = ChangeRowSchema.safeParse({
      tableName: 'firearms',
      rowId: 'row-1',
      seq: 2,
      payload: null,
      deletedAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('C3 rejects a tombstone that still carries a payload', () => {
    const result = ChangeRowSchema.safeParse({
      tableName: 'firearms',
      rowId: 'row-1',
      seq: 2,
      payload: { make: 'Anschutz' },
      deletedAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('C4 rejects seq 0 and negative seq', () => {
    for (const seq of [0, -1]) {
      const result = ChangeRowSchema.safeParse({
        tableName: 'firearms',
        rowId: 'row-1',
        seq,
        payload: null,
        deletedAt: '2026-08-02T00:00:00.000Z',
        updatedAt: '2026-08-02T00:00:00.000Z',
      });
      expect(result.success).toBe(false);
    }
  });
});

describe('ClientChangeSchema', () => {
  it('CC1 accepts a well-formed live change', () => {
    expect(ClientChangeSchema.safeParse(validClientChange).success).toBe(true);
  });

  it('CC2 rejects a non-uuid clientChangeId', () => {
    expect(
      ClientChangeSchema.safeParse({ ...validClientChange, clientChangeId: 'not-a-uuid' }).success,
    ).toBe(false);
  });

  it('CC3 rejects a tombstone change that still carries a payload', () => {
    expect(
      ClientChangeSchema.safeParse({
        ...validClientChange,
        deletedAt: '2026-08-02T00:00:00.000Z',
        payload: { make: 'still here' },
      }).success,
    ).toBe(false);
  });

  it('CC4 accepts a tombstone change with a null payload', () => {
    expect(
      ClientChangeSchema.safeParse({
        ...validClientChange,
        deletedAt: '2026-08-02T00:00:00.000Z',
        payload: null,
      }).success,
    ).toBe(true);
  });
});

describe('PullRequestSchema / PullResponseSchema', () => {
  it('P1 accepts a request for a subset of tables', () => {
    const result = PullRequestSchema.safeParse({
      protocolVersion: 1,
      tables: [{ tableName: 'firearms', cursor: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it('P2 rejects an empty tables array', () => {
    expect(PullRequestSchema.safeParse({ protocolVersion: 1, tables: [] }).success).toBe(false);
  });

  it('P3 rejects a negative cursor', () => {
    const result = PullRequestSchema.safeParse({
      protocolVersion: 1,
      tables: [{ tableName: 'firearms', cursor: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it('P4 round-trips a valid pull response with hasMore', () => {
    const response = {
      protocolVersion: 1,
      changes: [
        {
          tableName: 'firearms',
          rowId: 'row-1',
          seq: 1,
          payload: { make: 'Anschutz' },
          deletedAt: null,
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      nextCursors: [{ tableName: 'firearms', cursor: 1, hasMore: false }],
    };
    expect(PullResponseSchema.safeParse(response).success).toBe(true);
  });
});

describe('PushRequestSchema / PushResponseSchema', () => {
  it('U1 accepts a batch of one change', () => {
    expect(
      PushRequestSchema.safeParse({ protocolVersion: 1, changes: [validClientChange] }).success,
    ).toBe(true);
  });

  it('U2 rejects an empty batch', () => {
    expect(PushRequestSchema.safeParse({ protocolVersion: 1, changes: [] }).success).toBe(false);
  });

  it('U3 rejects a batch over the 500 cap', () => {
    const changes = Array.from({ length: 501 }, (_, i) => ({
      ...validClientChange,
      clientChangeId: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
    }));
    expect(PushRequestSchema.safeParse({ protocolVersion: 1, changes }).success).toBe(false);
  });

  it('U4 accepts a push response with applied, rejected, and duplicate acks', () => {
    const response = {
      protocolVersion: 1,
      acks: [
        { clientChangeId: '11111111-1111-4111-8111-111111111111', status: 'applied', seq: 1 },
        {
          clientChangeId: '22222222-2222-4222-8222-222222222222',
          status: 'rejected',
          reason: 'tombstoned',
        },
        { clientChangeId: '33333333-3333-4333-8333-333333333333', status: 'duplicate', seq: 1 },
      ],
    };
    expect(PushResponseSchema.safeParse(response).success).toBe(true);
  });

  it('U5 rejects an unknown ack status (negative control)', () => {
    const response = {
      protocolVersion: 1,
      acks: [{ clientChangeId: '11111111-1111-4111-8111-111111111111', status: 'bogus' }],
    };
    expect(PushResponseSchema.safeParse(response).success).toBe(false);
  });
});

describe('checkProtocolVersion', () => {
  it('V1 accepts the current protocol version', () => {
    expect(checkProtocolVersion(PROTOCOL_VERSION)).toEqual({ ok: true });
  });

  it('V2 accepts exactly the minimum supported version', () => {
    expect(checkProtocolVersion(MIN_SUPPORTED_PROTOCOL_VERSION)).toEqual({ ok: true });
  });

  it('V3 rejects a version below the minimum with the handshake error shape', () => {
    const result = checkProtocolVersion(MIN_SUPPORTED_PROTOCOL_VERSION - 1);
    expect(result).toEqual({
      ok: false,
      error: {
        code: PROTOCOL_VERSION_UNSUPPORTED,
        minSupportedVersion: MIN_SUPPORTED_PROTOCOL_VERSION,
        serverVersion: PROTOCOL_VERSION,
      },
    });
  });

  it('V4 accepts a version newer than the server (forward compatibility is the server pull/push handler’s job, not this check)', () => {
    expect(checkProtocolVersion(PROTOCOL_VERSION + 1)).toEqual({ ok: true });
  });
});

// docs/specs/sync-tags-settings-spec.md
describe('session_tags and settings (sync-tags-settings spec)', () => {
  it('P1 the table enum carries the two new tables, and a change for each parses', () => {
    expect(SYNC_TABLE_NAMES).toContain('session_tags');
    expect(SYNC_TABLE_NAMES).toContain('settings');
    for (const tableName of ['session_tags', 'settings']) {
      expect(ClientChangeSchema.safeParse({ ...validClientChange, tableName }).success).toBe(true);
    }
  });

  it('P2 the settings allowlist is exactly the five account keys and the five feature switches', () => {
    expect([...SYNCED_SETTING_KEYS]).toEqual([
      'birthYear',
      'skillClass',
      'competesInWomensClasses',
      'complianceProfile',
      'complianceProfileVariant',
      'showLicenseActivity',
      'showPhotos',
      'showTimer',
      'showSightSettings',
      'showAmmoLots',
    ]);
    // The feature switches are the ones shared/src/features names (#801 S1).
    expect(SYNCED_SETTING_KEYS.slice(5)).toEqual(Object.values(FEATURE_SETTING_KEYS));
    for (const key of SYNCED_SETTING_KEYS) expect(isSyncedSettingKey(key)).toBe(true);
    for (const key of [
      'backupFolder',
      'flagOverrides',
      'theme',
      'language',
      '',
      'BIRTHYEAR',
      'trackHandloads',
      'photoTrainingConsent',
      'showphotos',
    ]) {
      expect(isSyncedSettingKey(key)).toBe(false);
    }
  });

  it('accepts a settings row only for an allowlisted key carried under its own id', () => {
    expect(isSyncableSettingRow('birthYear', { id: 'birthYear', value: '1980' })).toBe(true);
    expect(isSyncableSettingRow('birthYear', null)).toBe(true);
    expect(isSyncableSettingRow('backupFolder', { id: 'backupFolder' })).toBe(false);
    expect(isSyncableSettingRow('backupFolder', null)).toBe(false);
    expect(isSyncableSettingRow('birthYear', { id: 'backupFolder' })).toBe(false);
    expect(isSyncableSettingRow('birthYear', { value: '1980' })).toBe(false);
    expect(isSyncableSettingRow('birthYear', 'birthYear')).toBe(false);
    expect(isSyncableSettingRow('birthYear', undefined)).toBe(false);
  });
});
