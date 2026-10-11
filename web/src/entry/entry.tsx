// Enter Series: a session typed from the keyboard and saved with one push
// (docs/specs/web-series-entry-spec.md §3). The form logic is in model.ts,
// what a Save does in save.ts; this file only renders and wires keys.
import {
  categoryKey,
  defaultSessionName,
  formatShooterClass,
  programsForDiscipline,
  requireDiscipline,
  weaponGroupsForDiscipline,
} from '@shotledger/shared/src/disciplines';
import { derivedWeaponGroup } from '@shotledger/shared/src/disciplines/session-defaults';
import {
  rankRecentLocations,
  type LocationUsage,
} from '@shotledger/shared/src/locations/recent-locations';
import { REGULATIONS } from '@shotledger/shared/src/regulations/registry';
import { tenthsToScore } from '@shotledger/shared/src/scoring/totals';
import { TEXT_LIMITS } from '@shotledger/shared/src/sync';
import { readAccountSettings } from '@shotledger/shared/src/sync-client/account-settings';
import type { EntryError } from '@shotledger/shared/src/sync-client/session-entry';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { uuidv7 } from 'uuidv7';

import {
  COMPETITION_LEVELS,
  disciplineLabel,
  formatLocalDate,
  matchFormatLabel,
  type CompetitionLevel,
} from '../../../app/src/features/session/labels';
import { currentUserId, loadTables, pushRows } from '../api';
import type { ReauthOutcome } from '../reauth';
import { SignInAgain } from '../sign-in-again';
import type { PulledTables } from '../pull';
import { KindPicker, RoundsFiredField, SectionHeading, StartFinalButton } from './kind-fields';
import { buildEntry, disciplineOptions } from './kinds';
import {
  addRow,
  canMarkSighter,
  classesFor,
  decimalShown,
  eventsFor,
  initialForm,
  isFixed,
  modeOf,
  onRowEnter,
  rowSummary,
  sendsTheSame,
  startedAtIso,
  withDiscipline,
  withProgram,
  withRegulation,
  withType,
  type EntryForm,
} from './model';
import { afterEdit, IDLE, save, saveBlocked, submitRequest, type SaveState } from './save';

type Rows = Map<string, Record<string, unknown>>;

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

export function locationUsage(sessions: Rows): LocationUsage[] {
  const byLocation = new Map<string, LocationUsage>();
  for (const row of sessions.values()) {
    const location = typeof row.location === 'string' ? row.location : '';
    if (location.trim() === '') continue;
    const startedAt = String(row.started_at);
    const seen = byLocation.get(location);
    byLocation.set(location, {
      location,
      count: (seen?.count ?? 0) + 1,
      lastUsedAt: seen && seen.lastUsedAt > startedAt ? seen.lastUsedAt : startedAt,
    });
  }
  return [...byLocation.values()];
}

/** `rowLabel` names a 1-based form row as the page labels it. */
function errorText(t: TFunction, error: EntryError, rowLabel: (row: number) => string): string {
  switch (error.kind) {
    case 'series':
      return error.error.kind === 'comma'
        ? t('web.entry.errorComma', { row: rowLabel(error.row) })
        : t('web.entry.errorToken', {
            row: rowLabel(error.row),
            token: error.error.token,
            position: error.error.position,
          });
    case 'tooManyShots':
      return t('web.entry.errorTooManyShots', { row: rowLabel(error.row), max: error.max });
    case 'secondSighter':
      return t('web.entry.errorSecondSighter', { row: rowLabel(error.row) });
    case 'finalWithoutMain':
      return t('web.entry.errorFinalWithoutMain');
    case 'tooLong': {
      const field = {
        name: t('session.name'),
        competitionName: t('session.competitionName'),
        location: t('session.location'),
      }[error.field];
      return t('web.entry.errorTooLong', { field, max: error.max });
    }
    case 'unknownFirearm':
      return t('web.entry.errorUnknownFirearm');
    case 'unknownAmmoLot':
      return t('web.entry.errorUnknownAmmoLot');
    case 'invalidStartedAt':
      return t('web.entry.errorDateTime');
    case 'invalidRounds':
      return t('session.roundsFiredInvalid');
    case 'tooManyChanges':
      return t('web.entry.errorTooManyChanges');
    case 'hitsDiscipline':
      return t('web.entry.failed');
  }
}

function statusText(t: TFunction, state: SaveState): string | null {
  const { status } = state;
  switch (status.kind) {
    case 'saving':
      return t('web.entry.saving');
    case 'saved':
      if (status.firearmRejected) return t('web.entry.savedFirearmRejected');
      return status.refreshed ? t('web.entry.saved') : t('web.entry.savedReload');
    case 'failed':
      if (status.error === 'network') return t('web.entry.failedNetwork');
      if (status.error === 'unauthenticated') return t('web.entry.failedSignedOut');
      if (status.error === 'versionUnsupported') return t('web.entry.failedOutdated');
      if (status.unconfirmed) return t('web.entry.failedUnconfirmed');
      return t('web.entry.failed');
    case 'accountChanged':
      return t('web.entry.accountChanged');
    case 'idle':
    case 'invalid':
      return null;
  }
}

export function Entry({
  tables,
  refresh,
  onReauthenticated,
}: {
  tables: PulledTables;
  refresh: () => Promise<boolean>;
  /** App reloads the logbook when another account signed in (R22). */
  onReauthenticated: (userId: string) => ReauthOutcome;
}) {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  // The synced profile prefills the klass and ranks the events, as on the phone (C6).
  const profile = useMemo(() => readAccountSettings(tables.settings), [tables]);
  const [form, setForm] = useState<EntryForm>(() => initialForm(new Date(), profile));
  const [state, setState] = useState<SaveState>(IDLE);
  const rowInputs = useRef(new Map<number, HTMLInputElement>());
  // A row added by Enter exists only after the next render.
  const pendingFocus = useRef<number | null>(null);
  // Disabling the form for a save takes the focus; give it back afterwards,
  // so Enter and Ctrl+Enter keep working from the keyboard.
  const focusAfterSave = useRef<HTMLElement | null>(null);
  const saving = state.status.kind === 'saving';
  useEffect(() => {
    if (pendingFocus.current !== null) {
      rowInputs.current.get(pendingFocus.current)?.focus();
      pendingFocus.current = null;
    }
    if (!saving && focusAfterSave.current !== null) {
      const element = focusAfterSave.current;
      focusAfterSave.current = null;
      if (element.isConnected) element.focus();
      else rowInputs.current.values().next().value?.focus();
    }
  });

  const edit = (next: EntryForm) => {
    setForm(next);
    // Only blank rows added (Enter, Add Series): the held request still holds (R21).
    const unchanged = sendsTheSame(form, next);
    setState((was) => afterEdit(was, { sendsTheSame: unchanged }));
  };
  const set = <K extends keyof EntryForm>(key: K, value: EntryForm[K]) =>
    edit({ ...form, [key]: value });

  const discipline = requireDiscipline(form.disciplineId);
  const programs = programsForDiscipline(form.disciplineId);
  const groups = weaponGroupsForDiscipline(form.disciplineId);
  const classes = classesFor(form);
  const events = eventsFor(form);
  const mode = modeOf(form);
  const fixed = isFixed(form);
  const isCompetition = form.type === 'competition';
  const isSeries = form.kind === 'series';

  const firearms = useMemo(
    () =>
      [...tables.firearms.values()]
        .map((row) => ({ id: String(row.id), label: `${String(row.make)} ${String(row.model)}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [tables],
  );
  const ammoLots = useMemo(
    () =>
      [...tables.ammo_lots.values()]
        .map((row) => ({ id: String(row.id), label: String(row.label) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [tables],
  );
  const usage = useMemo(() => locationUsage(tables.sessions), [tables]);
  const suggestions = rankRecentLocations(usage, form.location);

  // As on the phone: training takes the vapengrupp from the gun and asks only
  // when the gun sits in several groups with no default.
  const derived =
    form.firearmId === null
      ? null
      : derivedWeaponGroup(
          [...tables.firearm_groups.values()]
            .filter((row) => row.firearm_id === form.firearmId)
            .map((row) => ({
              groupId: String(row.group_id),
              isDefaultForGroup: Number(row.is_default_for_group),
            })),
        );
  const showGroupPicker =
    groups.length > 0 && (isCompetition || (form.firearmId !== null && derived === null));

  const startedAt = startedAtIso(form.date, form.time);
  const defaultName = defaultSessionName({
    typeLabel: t(`sessionType.${form.type}`),
    dateLabel: startedAt ? formatLocalDate(startedAt, i18n.language) : '',
  });

  const blocked = saveBlocked(online, state);
  const errors = state.status.kind === 'invalid' ? state.status.errors : [];
  const rowLabel = (row: number) =>
    form.rows[row - 1]?.isSighter
      ? t('session.sighter')
      : t('session.seriesTitle', { position: row });
  const rowErrors = new Map<number, string>();
  const formErrors: string[] = [];
  for (const error of errors) {
    if ('row' in error) rowErrors.set(error.row, errorText(t, error, rowLabel));
    else formErrors.push(errorText(t, error, rowLabel));
  }

  const runSave = () => {
    const held = submitRequest(state);
    if (blocked !== null || startedAt === null) return;
    focusAfterSave.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setState({ status: { kind: 'saving' }, held: null });
    void save(
      {
        loadContext: async () => {
          const fresh = await loadTables(['firearms', 'firearm_groups', 'ammo_lots']);
          return {
            firearms: fresh.firearms,
            firearmGroups: fresh.firearm_groups.values(),
            ammoLots: fresh.ammo_lots,
          };
        },
        build: (context) =>
          buildEntry(form, defaultName, context, {
            newId: uuidv7,
            newChangeId: () => crypto.randomUUID(),
            now: () => new Date().toISOString(),
          }),
        currentUserId,
        push: pushRows,
        refresh,
      },
      held,
    )
      .then((next) => {
        setState(next);
        if (next.status.kind === 'saved') setForm(initialForm(new Date(), profile));
      })
      // save() catches what it calls; this is the last guard against "saving" forever (R18).
      .catch(() => setState({ status: { kind: 'failed', error: 'unknown' }, held }));
  };

  // The same account signed in again: only the signed-out notice goes.
  const onSignedIn = (userId: string) => {
    if (onReauthenticated(userId) === 'same') {
      setState((was) => ({ status: { kind: 'idle' }, held: was.held }));
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    runSave();
  };
  const onFormKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      runSave();
    }
  };
  const onRowKeyDown = (event: KeyboardEvent, index: number) => {
    if (event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    const next = onRowEnter(form, index);
    if (next.focus === null) return;
    const key = next.form.rows[next.focus]!.key;
    if (next.form === form) {
      rowInputs.current.get(key)?.focus();
    } else {
      pendingFocus.current = key;
      edit(next.form);
    }
  };

  const message = statusText(t, state);
  const failedWith = state.status.kind === 'failed' ? state.status.error : null;

  return (
    <div className="entry">
      <form className="entry" onSubmit={onSubmit} onKeyDown={onFormKeyDown} noValidate>
        {/* Nothing changes under a save in flight (R23). */}
        <fieldset className="entry-fieldset" disabled={saving}>
          <section className="card entry-fields">
            <label className="field">
              {t('session.type')}
              <select
                value={form.type}
                onChange={(event) => edit(withType(form, event.target.value as EntryForm['type']))}
              >
                <option value="training">{t('sessionType.training')}</option>
                <option value="competition">{t('sessionType.competition')}</option>
              </select>
            </label>
            <KindPicker form={form} edit={edit} />
            <label className="field">
              {t('session.regulation')}
              <select
                value={form.regulationId}
                onChange={(event) => edit(withRegulation(form, event.target.value))}
              >
                {REGULATIONS.map((regulation) => (
                  <option key={regulation.id} value={regulation.id}>
                    {regulation.shortName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('session.discipline')}
              <select
                value={form.disciplineId}
                onChange={(event) => edit(withDiscipline(form, event.target.value))}
              >
                {disciplineOptions(form).map((d) => (
                  <option key={d.id} value={d.id}>
                    {disciplineLabel(t, d.id)}
                  </option>
                ))}
              </select>
            </label>
            {isSeries && programs.length > 0 && (
              <label className="field">
                {t('session.matchFormat')}
                <select
                  value={form.programId ?? ''}
                  onChange={(event) => edit(withProgram(form, event.target.value || null))}
                >
                  <option value="">{t('session.freeFormat')}</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {matchFormatLabel(t, p.id, programs.length)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              {t('session.date')}
              <input
                type="date"
                value={form.date}
                onChange={(event) => set('date', event.target.value)}
                required
              />
            </label>
            <label className="field">
              {t('web.entry.time')}
              <input
                type="time"
                value={form.time}
                onChange={(event) => set('time', event.target.value)}
                required
              />
            </label>
            <label className="field">
              {t('session.name')}
              <input
                value={form.name}
                placeholder={defaultName}
                maxLength={TEXT_LIMITS.sessions.name}
                onChange={(event) => set('name', event.target.value)}
              />
            </label>
            <label className="field">
              {t('session.location')}
              <input
                value={form.location}
                list="entry-locations"
                placeholder={t('session.locationPlaceholder')}
                maxLength={TEXT_LIMITS.sessions.location}
                onChange={(event) => set('location', event.target.value)}
              />
              <datalist id="entry-locations">
                {suggestions.map((place) => (
                  <option key={place} value={place} />
                ))}
              </datalist>
            </label>
            {isCompetition && (
              <>
                <label className="field">
                  {t('session.competitionLevel')}
                  <select
                    value={form.competitionLevel}
                    onChange={(event) =>
                      set('competitionLevel', event.target.value as CompetitionLevel)
                    }
                  >
                    {COMPETITION_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {t(`competitionLevel.${level}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field check">
                  <input
                    type="checkbox"
                    checked={form.isChampionship}
                    onChange={(event) => set('isChampionship', event.target.checked)}
                  />
                  {t('session.championship')}
                </label>
                <label className="field">
                  {t('session.competitionName')}
                  <input
                    value={form.competitionName}
                    placeholder={t('session.competitionNamePlaceholder')}
                    maxLength={TEXT_LIMITS.sessions.competition_name}
                    onChange={(event) => set('competitionName', event.target.value)}
                  />
                </label>
              </>
            )}
            {showGroupPicker && (
              <label className="field">
                {t('session.weaponGroup')}
                <select
                  value={form.weaponGroup ?? ''}
                  onChange={(event) => set('weaponGroup', event.target.value || null)}
                >
                  <option value="">{t('session.none')}</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {isCompetition && classes.length > 0 && (
              <label className="field">
                {t('session.shooterClass')}
                <select
                  value={form.shooterClass ?? ''}
                  onChange={(event) => set('shooterClass', event.target.value || null)}
                >
                  <option value="">{t('session.none')}</option>
                  {classes.map((code) => (
                    <option key={code} value={code}>
                      {formatShooterClass(code)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {isCompetition && events.length > 0 && (
              <label className="field">
                {t('session.event')}
                <select
                  value={form.eventId ?? ''}
                  onChange={(event) => set('eventId', event.target.value || null)}
                >
                  <option value="">{t('session.none')}</option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {t(`eventCategory.${categoryKey(e.category)}`)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              {t('session.firearm')}
              <select
                value={form.firearmId ?? ''}
                onChange={(event) => set('firearmId', event.target.value || null)}
              >
                <option value="">{t('session.none')}</option>
                {firearms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('session.ammoLot')}
              <select
                value={form.ammoLotId ?? ''}
                onChange={(event) => set('ammoLotId', event.target.value || null)}
              >
                <option value="">{t('session.none')}</option>
                {ammoLots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.label}
                  </option>
                ))}
              </select>
            </label>
            {isSeries && decimalShown(form) && (
              <label className="field check">
                <input
                  type="checkbox"
                  checked={form.decimalScoring}
                  onChange={(event) => set('decimalScoring', event.target.checked)}
                />
                {t('session.decimalScoring')}
              </label>
            )}
            {isSeries && form.programId === null && (
              <label className="field">
                {t('session.seriesLength')}
                <input
                  inputMode="numeric"
                  value={form.seriesLengthText}
                  placeholder={String(discipline.defaultSeriesLength)}
                  onChange={(event) => set('seriesLengthText', event.target.value)}
                />
              </label>
            )}
            {!isSeries && <RoundsFiredField form={form} edit={edit} />}
          </section>

          <section className="card series-rows" hidden={!isSeries}>
            {form.rows.map((row, index) => {
              const summary = rowSummary(row.text, mode);
              const label = rowLabel(index + 1);
              const rowError = rowErrors.get(index + 1);
              return (
                <div key={row.key} className="series-row">
                  <SectionHeading form={form} index={index} />
                  <label htmlFor={`row-${row.key}`}>{label}</label>
                  <input
                    id={`row-${row.key}`}
                    ref={(element) => {
                      if (element) rowInputs.current.set(row.key, element);
                      else rowInputs.current.delete(row.key);
                    }}
                    className="shots"
                    value={row.text}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={rowError !== undefined || !summary.ok}
                    onKeyDown={(event) => onRowKeyDown(event, index)}
                    onChange={(event) =>
                      edit({
                        ...form,
                        rows: form.rows.map((r, i) =>
                          i === index ? { ...r, text: event.target.value } : r,
                        ),
                      })
                    }
                  />
                  <span className="row-summary">
                    {summary.ok && summary.shots > 0
                      ? t('web.entry.rowSummary', {
                          total: tenthsToScore(summary.totalTenths).toFixed(
                            mode === 'decimal' ? 1 : 0,
                          ),
                          innerTens: summary.innerTens,
                        })
                      : ''}
                  </span>
                  {!fixed && (
                    <label className="check">
                      <input
                        type="checkbox"
                        tabIndex={-1}
                        checked={row.isSighter}
                        disabled={!canMarkSighter(form, index)}
                        onChange={(event) =>
                          edit({
                            ...form,
                            rows: form.rows.map((r, i) =>
                              i === index ? { ...r, isSighter: event.target.checked } : r,
                            ),
                          })
                        }
                      />
                      {t('session.sighter')}
                    </label>
                  )}
                  {rowError && <p className="danger row-error">{rowError}</p>}
                </div>
              );
            })}
            <div>
              <button type="button" className="secondary" onClick={() => edit(addRow(form))}>
                {t('session.addSeries')}
              </button>
              <StartFinalButton form={form} edit={edit} />
            </div>
          </section>

          <section className="entry-actions">
            {/* While a request is held, the one action resends it (R13). */}
            <button type="submit" disabled={blocked !== null || startedAt === null}>
              {state.held === null ? t('common.save') : t('web.entry.retry')}
            </button>
            <div className="entry-status" role="status">
              {blocked === 'offline' && <p className="danger">{t('web.entry.offline')}</p>}
              {startedAt === null && <p className="danger">{t('web.entry.errorDateTime')}</p>}
              {message && (
                <p className={state.status.kind === 'failed' ? 'danger' : 'muted'}>{message}</p>
              )}
              {formErrors.map((text) => (
                <p key={text} className="danger">
                  {text}
                </p>
              ))}
            </div>
          </section>
        </fieldset>
      </form>
      {/* Outside the entry form: a form cannot nest in another. */}
      {failedWith === 'unauthenticated' && <SignInAgain onSignedIn={onSignedIn} />}
    </div>
  );
}
