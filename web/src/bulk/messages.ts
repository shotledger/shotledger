// What the Bulk Edit page says after an Apply, as i18n keys (spec §3.2,
// R6, R7, R25). Pure, so every outcome's wording is tested.
import type { BulkError } from '@shotledger/shared/src/sync-client/bulk-edit';

import type { ApplyState } from './apply';

export interface Message {
  key: string;
  params?: Record<string, string | number>;
  /** A field label to translate and pass as `field`. */
  fieldKey?: string;
  /** Firearm names to join as a list in the reader's language and pass as `firearms`. */
  firearms?: string[];
}

export function errorMessage(error: BulkError): Message {
  switch (error.kind) {
    case 'noSessions':
      return { key: 'web.bulk.errorNoSessions' };
    case 'blankTag':
      return { key: 'web.bulk.errorBlankTag' };
    case 'tooLong':
      return {
        key: 'web.entry.errorTooLong',
        params: { max: error.max },
        fieldKey: error.field === 'tag' ? 'web.bulk.tag' : 'session.location',
      };
    case 'unknownFirearm':
      return { key: 'web.entry.errorUnknownFirearm' };
    case 'nothingToChange':
      return { key: 'web.bulk.errorNothing' };
    case 'tooManyChanges':
      return { key: 'web.bulk.errorTooMany', params: { needed: error.needed, max: error.max } };
  }
}

const FAILED: Record<string, string> = {
  network: 'web.bulk.failedNetwork',
  unauthenticated: 'web.bulk.failedSignedOut',
  versionUnsupported: 'web.bulk.failedOutdated',
};

/** `firearmName` is null for a firearm the page no longer has a row for. */
export function statusMessages(
  state: ApplyState,
  firearmName: (firearmId: string) => string | null,
): Message[] {
  const { status } = state;
  switch (status.kind) {
    case 'applying':
      return [{ key: 'web.bulk.applying' }];
    case 'applied': {
      const { summary } = status;
      const lines: Message[] = [{ key: 'web.bulk.applied', params: { count: summary.changed } }];
      if (summary.unchanged > 0) {
        lines.push({ key: 'web.bulk.unchanged', params: { count: summary.unchanged } });
      }
      if (summary.missing > 0) {
        lines.push({ key: 'web.bulk.missing', params: { count: summary.missing } });
      }
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
      if (status.tagGone) lines.push({ key: 'web.bulk.tagGone' });
      if (!status.refreshed) lines.push({ key: 'web.bulk.reload' });
      return lines;
    }
    case 'failed':
      return [
        {
          key: status.unconfirmed
            ? 'web.bulk.failedUnconfirmed'
            : (FAILED[status.error] ?? 'web.entry.failed'),
        },
      ];
    case 'accountChanged':
      return [{ key: 'web.bulk.accountChanged' }];
    case 'invalid':
      return status.errors.map(errorMessage);
    case 'idle':
      return [];
  }
}
