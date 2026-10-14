// Bulk Edit: retag, change the firearm on, or move many sessions with one
// push (docs/specs/web-bulk-edit-spec.md §3.2). The list is model.ts, the
// request request.ts, what an Apply does apply.ts and what the page then
// says messages.ts; this file only renders and wires.
import { rankRecentLocations } from '@shotledger/shared/src/locations/recent-locations';
import { TEXT_LIMITS } from '@shotledger/shared/src/sync';
import type { BulkAction } from '@shotledger/shared/src/sync-client/bulk-edit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { uuidv7 } from 'uuidv7';

import { disciplineLabel } from '../../../app/src/features/session/labels';
import { currentUserId, loadTables, pushRows } from '../api';
import { locationUsage, useOnline } from '../entry/entry';
import { DateField } from '../fields/date-time-fields';
import type { PulledTables } from '../pull';
import type { ReauthOutcome } from '../reauth';
import { SignInAgain } from '../sign-in-again';
import {
  accountChanged,
  afterEdit,
  apply,
  applyBlocked,
  IDLE,
  submitRequest,
  type ApplyState,
} from './apply';
import { carry, clearCarried, peekCarried } from './carry';
import { statusMessages, type Message } from './messages';
import {
  bulkRows,
  filterRows,
  firearmLabel,
  NO_FILTER,
  tagNamesOn,
  targetIds,
  type BulkFilter,
} from './model';
import { applyDeps, bulkRequest, INITIAL_FORM, UNCHOSEN, type BulkForm } from './request';
import { showDate } from '../dates';
import { pickableFirearms } from '../firearms/active';

export function BulkEdit({
  tables,
  refresh,
  onReauthenticated,
}: {
  tables: PulledTables;
  refresh: () => Promise<boolean>;
  /** App reloads and remounts the pages when another account signs in (R22 of #669). */
  onReauthenticated: (userId: string) => ReauthOutcome;
}) {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const [filter, setFilter] = useState<BulkFilter>(NO_FILTER);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [form, setForm] = useState<BulkForm>(INITIAL_FORM);
  // An Apply that met another account says so on the remount (R15).
  const [state, setState] = useState<ApplyState>(() => peekCarried() ?? IDLE);
  useEffect(clearCarried, []);
  const applying = state.status.kind === 'applying';
  // Disabling the controls for an Apply takes the focus; give it back (R19).
  const focusAfterApply = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (applying || focusAfterApply.current === null) return;
    const element = focusAfterApply.current;
    focusAfterApply.current = null;
    if (element.isConnected) element.focus();
  }, [applying]);

  const rows = useMemo(() => bulkRows(tables), [tables]);
  const shown = useMemo(() => filterRows(rows, filter), [rows, filter]);
  const targets = targetIds(selected, shown);
  const tagsOnTargets = tagNamesOn(rows, targets);
  const allTags = useMemo(
    () =>
      tagNamesOn(
        rows,
        rows.map((row) => row.id),
      ),
    [rows],
  );
  const firearms = useMemo(
    () =>
      [...pickableFirearms(tables.firearms).values()]
        .map((row) => ({ id: String(row.id), label: firearmLabel(row) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [tables],
  );
  const places = rankRecentLocations(
    useMemo(() => locationUsage(tables.sessions), [tables]),
    form.location,
  );

  // Any change to what Apply would send makes a held edit stale.
  const edit = (change: () => void) => {
    change();
    setState(afterEdit);
  };
  const set = <K extends keyof BulkForm>(key: K, value: BulkForm[K]) =>
    edit(() => setForm((current) => ({ ...current, [key]: value })));

  const request = bulkRequest(form, selected, shown);
  const blocked = applyBlocked(online, state);
  const runApply = () => {
    // While a request is held, the one action resends it (R12).
    const held = submitRequest(state);
    if (blocked !== null || (held === null && request === null)) return;
    focusAfterApply.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
    void apply(applyDeps(request, io), held)
      .catch((): ApplyState => ({
        status: { kind: 'failed', error: 'unknown' },
        held,
      }))
      .then((next) => {
        // Another account holds the token: App reloads its logbook (R15).
        if (next.status.kind === 'accountChanged') {
          carry(next);
          if (onReauthenticated(next.status.userId) === 'switched') return;
          clearCarried();
        }
        setState(next);
        if (next.status.kind === 'applied') setSelected(new Set());
      });
  };

  const onSignedIn = (userId: string) => {
    const held = state.held;
    if (held !== null && held.userId !== userId) carry(accountChanged(userId));
    if (onReauthenticated(userId) === 'same') {
      clearCarried();
      // The same account: only the signed-out notice goes; a held request stays.
      setState((was) => ({ status: { kind: 'idle' }, held: was.held }));
    }
  };

  const allShownSelected = shown.length > 0 && targets.length === shown.length;
  const toggleAll = () =>
    edit(() =>
      setSelected((current) => {
        const next = new Set(current);
        for (const row of shown) {
          if (allShownSelected) next.delete(row.id);
          else next.add(row.id);
        }
        return next;
      }),
    );
  const toggle = (id: string) =>
    edit(() =>
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    );

  const clearsLocation = form.kind === 'setLocation' && form.location.trim() === '';
  const applyLabel = t(clearsLocation ? 'web.bulk.applyClearLocation' : 'web.bulk.apply', {
    count: targets.length,
  });
  const text = (message: Message) =>
    t(message.key, {
      ...message.params,
      ...(message.fieldKey ? { field: t(message.fieldKey) } : {}),
      ...(message.firearms
        ? { firearms: new Intl.ListFormat(i18n.language).format(message.firearms) }
        : {}),
    });
  const firearmName = (id: string) => {
    const row = tables.firearms.get(id);
    return row === undefined ? null : firearmLabel(row);
  };
  const lines = statusMessages(state, firearmName).map(text);
  const failedWith = state.status.kind === 'failed' ? state.status.error : null;

  return (
    // Every control is off while an Apply runs, so the page cannot show a
    // selection other than the one being sent (R19).
    <fieldset className="bulk" disabled={applying}>
      <section className="card bulk-filter">
        <DateField
          label={t('period.from')}
          value={filter.from}
          onChange={(from) => edit(() => setFilter({ ...filter, from }))}
        />
        <DateField
          label={t('period.to')}
          value={filter.to}
          onChange={(to) => edit(() => setFilter({ ...filter, to }))}
        />
        {filter.from !== '' && filter.to !== '' && filter.from > filter.to && (
          <p className="danger bulk-range" role="alert">
            {t('web.rangeReversed')}
          </p>
        )}
        <label className="field">
          {t('sessions.searchLabel')}
          <input
            type="search"
            value={filter.search}
            onChange={(event) => edit(() => setFilter({ ...filter, search: event.target.value }))}
          />
        </label>
      </section>

      <form
        className="card bulk-action"
        onSubmit={(event) => {
          event.preventDefault();
          runApply();
        }}
      >
        <label className="field">
          {t('web.bulk.action')}
          <select
            value={form.kind}
            onChange={(event) => set('kind', event.target.value as BulkAction['kind'])}
          >
            <option value="addTag">{t('web.bulk.actionAddTag')}</option>
            <option value="removeTag">{t('web.bulk.actionRemoveTag')}</option>
            <option value="setFirearm">{t('web.bulk.actionFirearm')}</option>
            <option value="setLocation">{t('web.bulk.actionLocation')}</option>
          </select>
        </label>
        {form.kind === 'addTag' && (
          <label className="field">
            {t('web.bulk.tag')}
            <input
              value={form.tagName}
              list="bulk-tags"
              placeholder={t('session.tagPlaceholder')}
              maxLength={TEXT_LIMITS.tags.name}
              onChange={(event) => set('tagName', event.target.value)}
            />
            <datalist id="bulk-tags">
              {allTags.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
        )}
        {form.kind === 'removeTag' && (
          <label className="field">
            {t('web.bulk.tag')}
            <select
              value={tagsOnTargets.includes(form.removeName) ? form.removeName : ''}
              onChange={(event) => set('removeName', event.target.value)}
            >
              <option value="" disabled>
                {t('web.bulk.choose')}
              </option>
              {tagsOnTargets.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        {form.kind === 'setFirearm' && (
          <label className="field">
            {t('session.firearm')}
            <select value={form.firearm} onChange={(event) => set('firearm', event.target.value)}>
              <option value={UNCHOSEN} disabled>
                {t('web.bulk.choose')}
              </option>
              <option value="">{t('session.none')}</option>
              {firearms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {form.kind === 'setLocation' && (
          <label className="field">
            {t('session.location')}
            <input
              value={form.location}
              list="bulk-locations"
              placeholder={t('session.locationPlaceholder')}
              maxLength={TEXT_LIMITS.sessions.location}
              onChange={(event) => set('location', event.target.value)}
            />
            <datalist id="bulk-locations">
              {places.map((place) => (
                <option key={place} value={place} />
              ))}
            </datalist>
          </label>
        )}
        <div className="bulk-buttons">
          <button
            type="submit"
            disabled={
              blocked !== null ||
              (state.held === null &&
                (request === null ||
                  (form.kind === 'removeTag' && !tagsOnTargets.includes(form.removeName))))
            }
          >
            {state.held === null ? applyLabel : t('web.entry.retry')}
          </button>
        </div>
        <div className="entry-status bulk-status" role="status">
          {blocked === 'offline' && <p className="danger">{t('web.entry.offline')}</p>}
          {lines.map((line) => (
            <p
              key={line}
              className={
                state.status.kind === 'failed' || state.status.kind === 'invalid'
                  ? 'danger'
                  : 'muted'
              }
            >
              {line}
            </p>
          ))}
        </div>
      </form>
      {/* Outside the action form: a form cannot nest in another. */}
      {failedWith === 'unauthenticated' && <SignInAgain onSignedIn={onSignedIn} />}

      <section className="card bulk-list">
        <p className="muted">
          {t('web.bulk.shown', { count: shown.length, selected: targets.length })}
        </p>
        {shown.length === 0 ? (
          <p className="muted">{t('web.bulk.empty')}</p>
        ) : (
          <div className="bulk-scroll">
            <table className="bulk-table">
              <thead>
                <tr>
                  <th scope="col">
                    <input
                      type="checkbox"
                      aria-label={t('web.bulk.selectShown')}
                      checked={allShownSelected}
                      onChange={toggleAll}
                    />
                  </th>
                  <th scope="col">{t('session.date')}</th>
                  <th scope="col">{t('session.name')}</th>
                  <th scope="col">{t('session.discipline')}</th>
                  <th scope="col">{t('session.location')}</th>
                  <th scope="col">{t('session.firearm')}</th>
                  <th scope="col">{t('session.tags')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.id} aria-selected={selected.has(row.id)}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={t('web.bulk.selectSession', { name: row.name })}
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                      />
                    </td>
                    <td>{showDate(row.startedAt)}</td>
                    <th scope="row">{row.name}</th>
                    <td>{disciplineLabel(t, row.disciplineId)}</td>
                    <td>{row.location ?? ''}</td>
                    <td>{row.firearm ?? ''}</td>
                    <td>{row.tags.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </fieldset>
  );
}
