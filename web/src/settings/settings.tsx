// Settings: the five account settings that sync, edited and saved with one
// push (docs/specs/web-settings-edit-spec.md). The form logic is in
// model.ts, what a Save does in save.ts; this file only renders.
import { PROFILE_SELECTIONS, type ProfileSelection } from '@shotledger/shared/src/compliance';
import { SKILL_CLASSES } from '@shotledger/shared/src/disciplines/eligibility';
import { buildSettingsChanges } from '@shotledger/shared/src/sync-client/settings-edit';
import type { AccountSettings } from '@shotledger/shared/src/sync-client/settings-edit';
import type { TFunction } from 'i18next';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { pushRows } from '../api';
import { SignInAgain, useOnline } from '../entry/entry';
import type { PulledTables } from '../pull';
import {
  birthYearChoices,
  caseView,
  hasChanges,
  initialSettings,
  needsBirthYearConfirm,
  ownershipFacts,
} from './model';
import { afterEdit, IDLE, save, saveBlocked, type SaveState } from './save';

// The phone's labels for its profile picker (Settings → Compliance).
const PROFILE_LABEL_KEYS: Record<ProfileSelection, string> = {
  none: 'compliance.profileNone',
  se: 'compliance.profileSe',
};

function Choices<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (next: T) => void;
}) {
  return (
    <div className="choices">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? '' : 'secondary'}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
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
      if (status.error === 'network') return t('web.settings.failedNetwork');
      if (status.error === 'unauthenticated') return t('web.entry.failedSignedOut');
      if (status.error === 'versionUnsupported') return t('web.settings.failedOutdated');
      return t('web.entry.failed');
    case 'invalid':
      return t('web.entry.failed');
    case 'idle':
      return null;
  }
}

export function Settings({
  tables,
  refresh,
}: {
  tables: PulledTables;
  refresh: () => Promise<boolean>;
}) {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  // What the page opened with; a refresh after a save opens it afresh.
  const opened = useMemo(
    () => initialSettings(tables.settings, i18n.language),
    [tables, i18n.language],
  );
  const facts = useMemo(() => ownershipFacts(tables.firearms), [tables]);
  const [draft, setDraft] = useState<{ opened: AccountSettings; form: AccountSettings }>({
    opened,
    form: opened,
  });
  // A new `opened` (after a refresh) replaces the form.
  const form = draft.opened === opened ? draft.form : opened;
  const [state, setState] = useState<SaveState>(IDLE);
  const [confirming, setConfirming] = useState(false);
  const [signedInAgain, setSignedInAgain] = useState(false);

  const edit = (next: Partial<AccountSettings>) => {
    setDraft({ opened, form: { ...form, ...next } });
    setState(afterEdit);
    setConfirming(false);
  };

  const currentYear = new Date().getFullYear();
  const years = birthYearChoices(currentYear, form.birthYear);
  const view = caseView(form, facts);
  const changed = hasChanges(opened, form);
  const blocked = saveBlocked(online, state, changed);

  const runSave = (held: SaveState['held']) => {
    setConfirming(false);
    setState({ status: { kind: 'saving' }, held: null });
    void save(
      {
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
    ).then((next) => {
      setState(next);
      if (next.status.kind === 'saved') setSignedInAgain(false);
    });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (blocked !== null) return;
    if (needsBirthYearConfirm(opened, form)) setConfirming(true);
    else runSave(null);
  };

  const message = statusText(t, state);
  const failedWith = state.status.kind === 'failed' ? state.status.error : null;

  return (
    <div className="settings">
      <form className="settings" onSubmit={onSubmit} noValidate>
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
            <legend>{t('settings.skillClass')}</legend>
            <Choices
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
          <h2>{t('compliance.settingsTitle')}</h2>
          <Choices
            options={PROFILE_SELECTIONS.map((value) => ({
              value,
              label: t(PROFILE_LABEL_KEYS[value]),
            }))}
            value={form.complianceProfile}
            onChange={(complianceProfile) => edit({ complianceProfile })}
          />
          {view.variantId !== null && view.variantIds.length > 1 && (
            <fieldset className="field">
              <legend>{t('compliance.caseTitle')}</legend>
              <Choices
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

        <section className="entry-actions">
          <button type="submit" disabled={blocked !== null}>
            {t('common.save')}
          </button>
          {state.held !== null && (
            <button
              type="button"
              className="secondary"
              disabled={blocked === 'offline' || blocked === 'saving'}
              onClick={() => runSave(state.held)}
            >
              {t('web.entry.retry')}
            </button>
          )}
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
              <button type="button" onClick={() => runSave(null)}>
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
      {failedWith === 'unauthenticated' && !signedInAgain && (
        <SignInAgain onSignedIn={() => setSignedInAgain(true)} />
      )}
    </div>
  );
}
