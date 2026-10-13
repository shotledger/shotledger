// What the Edit Session page and Delete say, as i18n keys
// (docs/specs/web-session-edit-spec.md E9). Pure, so every outcome's wording
// is tested.
import { MAX_ROUNDS_FIRED } from '@shotledger/shared/src/sync-client/rounds-entry';
import type { EditError } from '@shotledger/shared/src/sync-client/session-edit';

import type { EditState } from './save';

export interface Message {
  key: string;
  params?: Record<string, string | number>;
  /** A field label to translate and pass as `field`. */
  fieldKey?: string;
  /** Firearm names to join as a list in the reader's language and pass as `firearms`. */
  firearms?: string[];
  /** The form row the message is about (1-based), for the row label. */
  row?: number;
  /** The station row the message is about (1-based), for the station label. */
  station?: number;
}

const FIELD_KEYS = {
  name: 'session.name',
  competitionName: 'session.competitionName',
  location: 'session.location',
  notes: 'session.notes',
} as const;

export function errorMessage(error: EditError): Message {
  switch (error.kind) {
    case 'seriesText':
      return error.error.kind === 'comma'
        ? { key: 'web.entry.errorComma', row: error.row }
        : {
            key: 'web.entry.errorToken',
            row: error.row,
            params: { token: error.error.token, position: error.error.position },
          };
    case 'tooManyShots':
      return { key: 'web.entry.errorTooManyShots', row: error.row, params: { max: error.max } };
    case 'secondSighter':
      return { key: 'web.entry.errorSecondSighter', row: error.row };
    case 'readOnlySeries':
      return { key: 'web.edit.errorReadOnly', row: error.row };
    case 'stationPoints':
      return { key: 'web.entry.errorStationPoints', station: error.row };
    case 'invalidStation':
      return { key: 'web.entry.errorInvalidStation', station: error.row };
    case 'invalidRounds':
      return { key: 'session.roundsFiredInvalid', params: { max: MAX_ROUNDS_FIRED } };
    case 'tooLong':
      return {
        key: 'web.entry.errorTooLong',
        params: { max: error.max },
        fieldKey: FIELD_KEYS[error.field],
      };
    case 'unknownFirearm':
      return { key: 'web.entry.errorUnknownFirearm' };
    case 'unknownAmmoLot':
      return { key: 'web.entry.errorUnknownAmmoLot' };
    case 'invalidStartedAt':
      return { key: 'web.entry.errorDateTime' };
    case 'startedAtOutOfRange':
      return { key: 'web.entry.errorDateRange' };
    case 'nothingToChange':
      return { key: 'web.edit.nothingToChange' };
    case 'tooManyChanges':
      return { key: 'web.edit.errorTooMany', params: { needed: error.needed, max: error.max } };
    case 'stale':
      return { key: 'web.edit.stale' };
    case 'gone':
      return { key: 'web.edit.gone' };
  }
}

const FAILED: Record<string, string> = {
  network: 'web.edit.failedNetwork',
  unauthenticated: 'web.edit.failedSignedOut',
  versionUnsupported: 'web.edit.failedOutdated',
};

/** `firearmName` is null for a firearm the page no longer has a row for. */
export function statusMessages(
  state: EditState,
  firearmName: (firearmId: string) => string | null,
): Message[] {
  const { status } = state;
  switch (status.kind) {
    case 'working':
      return [{ key: status.action === 'delete' ? 'web.edit.deleting' : 'web.entry.saving' }];
    case 'done': {
      const lines: Message[] = [
        { key: status.action === 'delete' ? 'web.edit.deleted' : 'web.entry.saved' },
      ];
      if (status.refused > 0) {
        lines.push({ key: 'web.bulk.refused', params: { count: status.refused } });
      }
      const firearms = status.firearmsToCheck
        .map((id) => firearmName(id))
        .filter((name): name is string => name !== null);
      if (firearms.length > 0) {
        lines.push({
          key: 'web.bulk.checkRoundCounts',
          params: { count: firearms.length },
          firearms,
        });
      }
      if (!status.refreshed) lines.push({ key: 'web.bulk.reload' });
      return lines;
    }
    case 'gone':
      return status.refreshed
        ? [{ key: 'web.edit.gone' }]
        : [{ key: 'web.edit.gone' }, { key: 'web.bulk.reload' }];
    case 'stale':
      return [{ key: status.action === 'delete' ? 'web.edit.staleDelete' : 'web.edit.stale' }];
    case 'failed':
      return [
        {
          key: status.unconfirmed
            ? 'web.edit.failedUnconfirmed'
            : (FAILED[status.error] ?? 'web.entry.failed'),
        },
      ];
    case 'accountChanged':
      return [{ key: 'web.edit.accountChanged' }];
    case 'invalid':
      return status.errors.map(errorMessage);
    case 'idle':
      return [];
  }
}
