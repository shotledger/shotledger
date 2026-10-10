// Settings: the five account settings that sync, edited and saved with one
// push (docs/specs/web-settings-edit-spec.md). The form logic is in
// model.ts, what a Save does in save.ts; this file only renders.
import { PROFILE_SELECTIONS, type ProfileSelection } from '@shotledger/shared/src/compliance';
import { SKILL_CLASSES } from '@shotledger/shared/src/disciplines/eligibility';
import { buildSettingsChanges } from '@shotledger/shared/src/sync-client/settings-edit';
import type { AccountSettings } from '@shotledger/shared/src/sync-client/account-settings';
import type { TFunction } from 'i18next';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { currentUserId, pushRows } from '../api';
import { useOnline } from '../entry/entry';
import type { ReauthOutcome } from '../reauth';
import { SignInAgain } from '../sign-in-again';
import type { PulledTables } from '../pull';
import {
  birthYearChoices,
  caseView,
  hasChanges,
  initialSettings,
  needsBirthYearConfirm,
  ownershipFacts,
} from './model';
import {
  afterEdit,
  afterSignIn,
  IDLE,
  save,
  saveBlocked,
  submitRequest,
  type SaveState,
} from './save';

// The phone's labels for its profile picker (Settings → Compliance).
const PROFILE_LABEL_KEYS: Record<ProfileSelection, string> = {
  none: 'compliance.profileNone',
  se: 'compliance.profileSe',
};

/** An exclusive choice: native radios, so the arrow keys move it (spec R15). */
function RadioGroup<T extends string>({
  labelledBy,
  options,
  value,
  onChange,
}: {
  labelledBy: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (next: T) => void;
}) {
  const name = useId();
  return (
    <div className="radios" role="radiogroup" aria-labelledby={labelledBy}>
      {options.map((option) => (
        <label key={option.value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

function statusText(t: TFunction, state: SaveState): string | null {
  const { status } = state;
  switch (status.kind) {
    case 'saving':
      return t('web.entry.saving');
    case 'saved':
      return status.refreshed ? t('web.settings.saved') : t('web.settings.savedReload');
    case 'failed':
      if (status.unconfirmed) return t('web.settings.failedUnconfirmed');
      if (status.error === 'network') return t('web.settings.failedNetwork');
      if (status.error === 'unauthenticated') return t('web.entry.failedSignedOut');
      if (status.error === 'versionUnsupported') return t('web.settings.failedOutdated');
      return t('web.entry.failed');
    case 'accountChanged':
      return t('web.settings.accountChanged');
    case 'invalid':
      return t('web.entry.failed');
    case 'idle':
      return null;
  }
}

export function Settings({
  tables,
  refresh,
  onReauthenticated,
}: {
  tables: PulledTables;
  refresh: () => Promise<boolean>;
  /** Another account remounts this page with that account's tables (R12). */
  onReauthenticated: (userId: string) => ReauthOutcome;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const online = useOnline();
  // What the page opened with; a refresh after a save opens it afresh.
  const opened = useMemo(() => initialSettings(tables.settings), [tables]);
  const facts = useMemo(() => ownershipFacts(tables.firearms), [tables]);
  const [draft, setDraft] = useState<{ opened: AccountSettings; form: AccountSettings }>({
    opened,
    form: opened,
  });
  // A new `opened` (after a refresh) replaces the form.
  const form = draft.opened === opened ? draft.form : opened;
  const [state, setState] = useState<SaveState>(IDLE);
  const [confirming, setConfirming] = useState(false);

  const edit = (next: Partial<AccountSettings>) => {
    setDraft({ opened, form: { ...form, ...next } });
    setState(afterEdit);
    setConfirming(false);
  };

  const currentYear = new Date().getFullYear();
  const years = birthYearChoices(currentYear, form.birthYear);
  const view = caseView(form, facts);
  // Nothing can change while a save is in flight: its refresh replaces the form.
  const saving = state.status.kind === 'saving';
  const changed = hasChanges(opened, form);
  const blocked = saveBlocked(online, state, changed);

  const runSave = () => {
    const held = submitRequest(state);
    setConfirming(false);
    setState({ status: { kind: 'saving' }, held: null });
    void save(
      {
        currentUserId,
        build: () =>
          buildSettingsChanges(opened, form, tables.settings, {
            newChangeId: () => crypto.randomUUID(),
            now: () => new Date().toISOString(),
            currentYear,
          }),
        push: pushRows,
        refresh,
      },
      held,
    )
      .then(setState)
      // save() catches what it calls; this is the last guard against "saving" forever (R9).
      .catch(() => setState({ status: { kind: 'failed', error: 'unknown' }, held }));
  };

  const onSignedIn = (userId: string) => {
    const outcome = onReauthenticated(userId);
    setState((was) => afterSignIn(was, outcome));
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (blocked !== null) return;
    // A held request was confirmed when it was built; resend it as it is.
    if (state.held === null && needsBirthYearConfirm(opened, form)) setConfirming(true);
    else runSave();
  };

  const message = statusText(t, state);
  const failedWith = state.status.kind === 'failed' ? state.status.error : null;

  return (
    <div>
      <form className="settings" onSubmit={onSubmit} noValidate>
        <fieldset className="settings-fields" disabled={saving}>
          <section className="card">
            <h2>{t('settings.personal')}</h2>
            <label className="field">
              {t('settings.birthYear')}
              <select
                value={form.birthYear ?? ''}
                onChange={(event) => edit({ birthYear: Number(event.target.value) })}
              >
                {form.birthYear === null && (
                  <option value="" disabled>
                    {t('settings.birthYearPlaceholder')}
                  </option>
                )}
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="field">
              <legend id={`${ids}-class`}>{t('settings.skillClass')}</legend>
              <RadioGroup
                labelledBy={`${ids}-class`}
                options={SKILL_CLASSES.map((value) => ({ value, label: value }))}
                value={form.skillClass}
                onChange={(skillClass) => edit({ skillClass })}
              />
            </fieldset>
            <label className="field check">
              <input
                type="checkbox"
                checked={form.competesInWomensClasses}
                onChange={(event) => edit({ competesInWomensClasses: event.target.checked })}
              />
              {t('settings.womensClasses')}
            </label>
          </section>

          <section className="card">
            <h2 id={`${ids}-profile`}>{t('compliance.settingsTitle')}</h2>
            <RadioGroup
              labelledBy={`${ids}-profile`}
              options={PROFILE_SELECTIONS.map((value) => ({
                value,
                label: t(PROFILE_LABEL_KEYS[value]),
              }))}
              value={form.complianceProfile}
              onChange={(complianceProfile) => edit({ complianceProfile })}
            />
            {form.complianceProfile === null && (
              <p className="muted">{t('web.settings.profileUnset')}</p>
            )}
            {view.variantId !== null && view.variantIds.length > 1 && (
              <fieldset className="field">
                <legend id={`${ids}-case`}>{t('compliance.caseTitle')}</legend>
                <RadioGroup
                  labelledBy={`${ids}-case`}
                  options={view.variantIds.map((id) => ({
                    value: id,
                    label: t(`compliance.case.${id}`),
                  }))}
                  value={view.variantId}
                  onChange={(complianceProfileVariant) => edit({ complianceProfileVariant })}
                />
                <p className="muted">{t(`compliance.caseHint.${view.variantId}`)}</p>
                <p className="muted">
                  {t(view.explicit ? 'compliance.caseExplicit' : 'compliance.caseDerived')}
                </p>
                {!view.explicit && view.reasonId && (
                  <p className="muted">{t(`compliance.caseReason.${view.reasonId}`)}</p>
                )}
              </fieldset>
            )}
          </section>
        </fieldset>

        <section className="entry-actions">
          {/* While a request is held, the one action resends it (R8). */}
          <button type="submit" disabled={blocked !== null}>
            {state.held === null ? t('common.save') : t('web.entry.retry')}
          </button>
          <div className="entry-status" role="status">
            {blocked === 'offline' && <p className="danger">{t('web.entry.offline')}</p>}
            {message && (
              <p className={state.status.kind === 'saved' ? 'muted' : 'danger'}>{message}</p>
            )}
          </div>
        </section>
        {confirming && opened.birthYear !== null && form.birthYear !== null && (
          <section
            className="card"
            role="alertdialog"
            aria-label={t('settings.birthYearChangeTitle')}
          >
            <p>
              {t('settings.birthYearChangeMessage', {
                from: opened.birthYear,
                to: form.birthYear,
              })}
            </p>
            <div className="actions">
              <button type="button" onClick={runSave}>
                {t('settings.birthYearChangeConfirm')}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => edit({ birthYear: opened.birthYear })}
              >
                {t('common.cancel')}
              </button>
            </div>
          </section>
        )}
      </form>
      {/* Outside the settings form: a form cannot nest in another. */}
      {failedWith === 'unauthenticated' && <SignInAgain onSignedIn={onSignedIn} />}
    </div>
  );
}
