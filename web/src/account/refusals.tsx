// The phone's refused changes on Account & Sync, on the web Account page
// (docs/specs/sync-discard-refused-spec.md §2.4, rule 11): the same two
// counts, the same rows from the shared `badRows`, the same words, and
// Discard through the same `discardRefused`. A confirmed discard reloads the
// account, so the list and the counts come from a fresh pull.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DiscardOutcome } from '@shotledger/shared/src/sync-client/discard';
import {
  badRows,
  badRowTitle,
  confirmParts,
  type BadRow,
  type ConfirmPart,
} from '@shotledger/shared/src/sync-client/refusal-list';
import { countMarks, marksFromRefusals, rowKey } from '@shotledger/shared/src/sync-client/shadow';
import type { RowRef } from '@shotledger/shared/src/sync/family';

import { showDate } from '../dates';
import type { PulledAccount, WebTable } from '../pull';

/** The confirm's i18n keys, by the shared `confirmParts`. */
const CONFIRM_KEY: Record<ConfirmPart, string> = {
  body: 'account.refusal.confirmBody',
  member: 'account.refusal.confirmMember',
  root: 'account.refusal.confirmRoot',
};

export type DiscardState =
  { step: 'idle' | 'reload' } | { step: 'asking' | 'working' | 'failed'; key: string };
export type DiscardEvent =
  | { type: 'ask'; key: string }
  | { type: 'cancel' }
  | { type: 'confirm' }
  | { type: 'done'; outcome: DiscardOutcome; refreshed?: boolean };
export const IDLE: DiscardState = { step: 'idle' };

/** One confirm at a time; `send` names the row to discard now. */
export function discardStep(
  state: DiscardState,
  event: DiscardEvent,
): { state: DiscardState; send: string | null } {
  const stay = { state, send: null };
  switch (event.type) {
    case 'ask':
      return state.step === 'idle' || state.step === 'failed' || state.step === 'reload'
        ? { state: { step: 'asking', key: event.key }, send: null }
        : stay;
    case 'cancel':
      return state.step === 'asking' ? { state: IDLE, send: null } : stay;
    case 'confirm':
      return state.step === 'asking'
        ? { state: { step: 'working', key: state.key }, send: state.key }
        : stay;
    case 'done':
      if (state.step !== 'working') return stay;
      if (event.outcome.kind !== 'discarded') {
        return { state: { step: 'failed', key: state.key }, send: null };
      }
      // Discarded, but the page still shows the old pull (as web.bulk.reload elsewhere).
      return { state: event.refreshed === false ? { step: 'reload' } : IDLE, send: null };
  }
}

export interface DiscardDeps {
  discard: (ref: RowRef) => Promise<DiscardOutcome>;
  /** Pulls the account again; false when that failed. */
  refresh: () => Promise<boolean>;
}

export async function runDiscard(
  deps: DiscardDeps,
  ref: RowRef,
): Promise<{ outcome: DiscardOutcome; refreshed: boolean }> {
  const outcome = await deps.discard(ref);
  const refreshed = outcome.kind === 'discarded' ? await deps.refresh() : true;
  return { outcome, refreshed };
}

export function Refusals({
  tables,
  discard,
  refresh,
  initial = IDLE,
  online = true,
}: {
  tables: PulledAccount;
  discard: DiscardDeps['discard'];
  refresh: DiscardDeps['refresh'];
  initial?: DiscardState;
  online?: boolean;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<DiscardState>(initial);
  const { invalid, waiting } = countMarks(marksFromRefusals(tables.refusals, []));
  if (invalid === 0 && waiting === 0) return null;

  // The pulled tables hold only live rows the server stores.
  const rows = badRows(tables.refusals, (ref) =>
    (tables[ref.tableName as WebTable] as Map<string, Record<string, unknown>> | undefined)?.get(
      ref.rowId,
    ),
  );
  const keyOf = (row: BadRow) => rowKey(row.tableName, row.rowId);

  const onEvent = (event: DiscardEvent, row?: BadRow) => {
    const next = discardStep(state, event);
    setState(next.state);
    if (next.send !== null && row !== undefined) {
      void runDiscard({ discard, refresh }, { tableName: row.tableName, rowId: row.rowId })
        .catch(() => ({ outcome: { kind: 'failed', error: 'unknown' } as DiscardOutcome }))
        .then((done) => setState((was) => discardStep(was, { type: 'done', ...done }).state));
    }
  };

  return (
    <section className="card">
      <h2>{t('account.syncTitle')}</h2>
      {invalid > 0 && <p className="muted">{t('account.refusedChanges', { count: invalid })}</p>}
      {rows.length > 0 && (
        <ul className="refusals">
          {rows.map((row) => {
            const key = keyOf(row);
            const asking = state.step === 'asking' && state.key === key;
            return (
              <li key={key}>
                <div className="refusal-row">
                  <div>
                    <p>{badRowTitle(row, t(`account.refusal.kind.${row.tableName}`), showDate)}</p>
                    {row.waiting > 0 && (
                      <p className="muted">
                        {t('account.refusal.waiting', { count: row.waiting })}
                      </p>
                    )}
                    {!row.held && <p className="muted">{t('account.refusal.notOnDevice')}</p>}
                    {state.step === 'failed' && state.key === key && (
                      <p className="danger">{t('account.refusal.discardFailed')}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="destructive small"
                    disabled={!online || state.step === 'working' || state.step === 'asking'}
                    onClick={() => onEvent({ type: 'ask', key })}
                  >
                    {t('account.refusal.discard')}
                  </button>
                </div>
                {asking && (
                  <div
                    className="card confirm"
                    role="alertdialog"
                    aria-label={t('account.refusal.confirmTitle')}
                  >
                    <h3>{t('account.refusal.confirmTitle')}</h3>
                    {confirmParts(row.role).map((part) => (
                      <p key={part}>{t(CONFIRM_KEY[part])}</p>
                    ))}
                    <div className="actions">
                      <button
                        type="button"
                        className="destructive"
                        disabled={!online}
                        onClick={() => onEvent({ type: 'confirm' }, row)}
                      >
                        {t('account.refusal.discard')}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => onEvent({ type: 'cancel' })}
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {waiting > 0 && <p className="muted">{t('account.heldChanges', { count: waiting })}</p>}
      {state.step === 'reload' && <p className="muted">{t('web.bulk.reload')}</p>}
    </section>
  );
}
