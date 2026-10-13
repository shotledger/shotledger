// Edit and Delete on the session detail (docs/specs/web-session-edit-spec.md
// §3.2, E5). Delete asks first, naming the session and the rounds its
// firearm's count loses; only that confirmation sends, and it is refused when
// the session changed elsewhere since this page pulled it (R10).
import { openedSession } from '@shotledger/shared/src/sync-client/session-edit';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { showDate } from '../dates';
import { useOnline } from '../entry/entry';
import type { PulledTables } from '../pull';
import type { ReauthOutcome } from '../reauth';
import { SignInAgain } from '../sign-in-again';
import { firearmLabel, messageText, webIo, type Done } from './edit';
import { statusMessages } from './messages';
import { editContext } from './model';
import { deleteDeps, deletePreview } from './request';
import {
  deleteStep,
  destination,
  editBlocked,
  IDLE,
  run,
  submitRequest,
  type DeleteStep,
  type EditState,
} from './save';

export interface SessionWriter {
  refresh: () => Promise<boolean>;
  onReauthenticated: (userId: string) => ReauthOutcome;
  onDone: (done: Done) => void;
}

export function SessionActions({
  tables,
  sessionId,
  name,
  startedAt,
  writer,
}: {
  tables: PulledTables;
  sessionId: string;
  name: string;
  startedAt: string;
  writer: SessionWriter;
}) {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const [step, setStep] = useState<DeleteStep>('closed');
  const [state, setState] = useState<EditState>(IDLE);
  const blocked = editBlocked(online, state);
  const preview = deletePreview(tables, sessionId);
  const firearmName = (id: string) => {
    const row = tables.firearms.get(id);
    return row === undefined ? null : firearmLabel(row);
  };

  const onStep = (event: 'ask' | 'cancel' | 'confirm') => {
    const next = deleteStep(step, event);
    setStep(next.step);
    if (next.send) runDelete();
  };

  const runDelete = () => {
    const held = submitRequest(state);
    // The session as the confirmation showed it; the detail only renders a live one.
    const shown = openedSession(sessionId, editContext(tables));
    if (blocked !== null || shown === null) return;
    setState({ status: { kind: 'working', action: 'delete' }, held: null });
    void run(deleteDeps(webIo(writer.refresh), shown), 'delete', held)
      .then((next) => {
        setState(next);
        const hash = destination(sessionId, next.status);
        if (hash !== null) {
          writer.onDone({
            hash,
            lines: statusMessages(next, firearmName).map((m) => messageText(t, i18n.language, m)),
          });
        }
      })
      .catch(() => setState({ status: { kind: 'failed', error: 'unknown' }, held }));
  };

  // Pull the account again, so the detail and the next confirmation show what is there now.
  const onReload = () => {
    setState(IDLE);
    void writer.refresh();
  };

  const onSignedIn = (userId: string) => {
    if (writer.onReauthenticated(userId) === 'same') {
      setState((was) => ({ status: { kind: 'idle' }, held: was.held }));
    }
  };

  const lines = statusMessages(state, firearmName).map((m) => messageText(t, i18n.language, m));
  const working = state.status.kind === 'working';
  const firearm = preview?.firearmId ? firearmName(preview.firearmId) : null;

  return (
    <div className="session-actions">
      <div className="actions">
        <a className="button" href={`#sessions/${encodeURIComponent(sessionId)}/edit`}>
          {t('common.edit')}
        </a>
        {/* While a request is held, the button resends it without asking again. */}
        <button
          type="button"
          className="destructive small"
          disabled={blocked !== null || step === 'asking'}
          onClick={() => (state.held === null ? onStep('ask') : runDelete())}
        >
          {state.held === null ? t('common.deleteSession') : t('web.entry.retry')}
        </button>
      </div>
      {step === 'asking' && (
        <div
          className="card confirm"
          role="alertdialog"
          aria-label={t('common.deleteSessionConfirmTitle')}
        >
          <p>
            {t('web.edit.confirmDelete', {
              name,
              date: showDate(startedAt),
            })}
          </p>
          {firearm !== null && (
            <p>{t('web.edit.confirmDeleteRounds', { firearm, rounds: preview!.rounds })}</p>
          )}
          <div className="actions">
            <button type="button" className="destructive" onClick={() => onStep('confirm')}>
              {t('web.edit.confirmDeleteButton')}
            </button>
            <button type="button" className="secondary" onClick={() => onStep('cancel')}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
      <div role="status">
        {blocked === 'offline' && <p className="danger">{t('web.entry.offline')}</p>}
        {lines.map((line) => (
          <p key={line} className={working ? 'muted' : 'danger'}>
            {line}
          </p>
        ))}
        {state.status.kind === 'stale' && (
          <button type="button" className="secondary" onClick={onReload}>
            {t('web.edit.reload')}
          </button>
        )}
      </div>
      {state.status.kind === 'failed' && state.status.error === 'unauthenticated' && (
        <SignInAgain onSignedIn={onSignedIn} />
      )}
    </div>
  );
}
