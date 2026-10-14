// Merge Ammo Lots on the Bulk Edit page (docs/specs/ammo-lot-merge-spec.md
// M6). What a Merge does and what the panel then says is merge.ts; this file
// only renders and wires.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { uuidv7 } from 'uuidv7';

import { currentUserId, loadTables, pushRows } from '../api';
import type { PulledTables } from '../pull';
import type { ReauthOutcome } from '../reauth';
import { SignInAgain } from '../sign-in-again';
import type { Message } from './messages';
import {
  afterMergeEdit,
  EMPTY_MERGE,
  keepOptions,
  lotOptions,
  MERGE_IDLE,
  mergeMessages,
  mergeReady,
  runMerge,
  type LotOption,
  type MergeForm,
  type MergeState,
} from './merge';

export function MergeLots({
  tables,
  refresh,
  online,
  onReauthenticated,
}: {
  tables: PulledTables;
  refresh: () => Promise<boolean>;
  online: boolean;
  onReauthenticated: (userId: string) => ReauthOutcome;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<MergeForm>(EMPTY_MERGE);
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<MergeState>(MERGE_IDLE);
  const options = useMemo(() => lotOptions(tables), [tables]);
  const applying = state.status.kind === 'applying';

  const choose = (key: keyof MergeForm, id: string) => {
    setForm((current) => {
      const next = { ...current, [key]: id };
      // Keep never offers the Duplicate.
      return key === 'duplicateId' && next.keptId === id ? { ...next, keptId: '' } : next;
    });
    setConfirming(false);
    setState(afterMergeEdit);
  };

  const run = () => {
    const held = state.held;
    setConfirming(false);
    setState({ status: { kind: 'applying' }, held: null });
    const io = {
      currentUserId,
      loadTables,
      push: pushRows,
      refresh,
      newId: uuidv7,
      newChangeId: () => crypto.randomUUID(),
      now: () => new Date().toISOString(),
    };
    void runMerge(io, form, held)
      .catch((): MergeState => ({ status: { kind: 'failed', error: 'unknown' }, held }))
      .then((next) => {
        setState(next);
        if (next.status.kind === 'applied') setForm(EMPTY_MERGE);
      });
  };

  const onSignedIn = (userId: string) => {
    // The same account keeps the held merge for Retry; another drops it.
    if (onReauthenticated(userId) === 'same') {
      setState((was) => ({ status: { kind: 'idle' }, held: was.held }));
    }
  };

  const label = (o: LotOption) =>
    t('web.bulk.mergeLotOption', {
      lot: o.caliber ? t('ammo.lotWithCaliber', { label: o.label, caliber: o.caliber }) : o.label,
      count: o.sessions,
    });
  const duplicate = options.find((o) => o.id === form.duplicateId);
  const kept = options.find((o) => o.id === form.keptId);
  const text = (message: Message) => t(message.key, message.params);
  const failed = state.status.kind === 'failed' || state.status.kind === 'invalid';

  if (options.length < 2) return null;
  return (
    <section className="card bulk-merge">
      <h2>{t('web.bulk.mergeTitle')}</h2>
      <p className="muted">{t('web.bulk.mergeHelp')}</p>
      <fieldset className="bulk-action" disabled={applying}>
        <label className="field">
          {t('web.bulk.mergeDuplicate')}
          <select
            value={form.duplicateId}
            onChange={(event) => choose('duplicateId', event.target.value)}
          >
            <option value="" disabled>
              {t('web.bulk.choose')}
            </option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {label(o)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t('web.bulk.mergeKeep')}
          <select value={form.keptId} onChange={(event) => choose('keptId', event.target.value)}>
            <option value="" disabled>
              {t('web.bulk.choose')}
            </option>
            {keepOptions(options, form.duplicateId).map((o) => (
              <option key={o.id} value={o.id}>
                {label(o)}
              </option>
            ))}
          </select>
        </label>
        {confirming && duplicate && kept ? (
          <div
            className="bulk-merge-confirm"
            role="alertdialog"
            aria-label={t('ammo.mergeConfirmTitle')}
          >
            <p>
              {t('ammo.mergeConfirmBody', {
                count: duplicate.sessions,
                duplicate: duplicate.label,
                kept: kept.label,
              })}
            </p>
            <div className="bulk-buttons">
              <button type="button" className="secondary" onClick={() => setConfirming(false)}>
                {t('common.cancel')}
              </button>
              <button type="button" className="destructive" onClick={run} disabled={!online}>
                {t('ammo.mergeConfirm')}
              </button>
            </div>
          </div>
        ) : (
          <div className="bulk-buttons">
            <button
              type="button"
              disabled={!online || (state.held === null && !mergeReady(form))}
              onClick={() => (state.held === null ? setConfirming(true) : run())}
            >
              {state.held === null ? t('web.bulk.merge') : t('web.entry.retry')}
            </button>
          </div>
        )}
        <div className="entry-status bulk-status" role="status">
          {!online && <p className="danger">{t('web.entry.offline')}</p>}
          {mergeMessages(state)
            .map(text)
            .map((line) => (
              <p key={line} className={failed ? 'danger' : 'muted'}>
                {line}
              </p>
            ))}
        </div>
      </fieldset>
      {state.status.kind === 'failed' && state.status.error === 'unauthenticated' && (
        <SignInAgain onSignedIn={onSignedIn} />
      )}
    </section>
  );
}
