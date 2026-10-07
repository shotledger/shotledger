// Bulk Edit: retag, change the firearm on, or move many sessions with one
// push (docs/specs/web-bulk-edit-spec.md §3.2). The list logic is in
// model.ts, what an Apply does in apply.ts; this file only renders.
import { rankRecentLocations } from '@shotledger/shared/src/locations/recent-locations';
import { TEXT_LIMITS } from '@shotledger/shared/src/sync';
import {
  buildBulkEdit,
  type BulkAction,
  type BulkError,
} from '@shotledger/shared/src/sync-client/bulk-edit';
import type { TFunction } from 'i18next';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { uuidv7 } from 'uuidv7';

import { disciplineLabel, formatLocalDate } from '../../../app/src/features/session/labels';
import { loadTables, pushEntry } from '../api';
import { locationUsage, SignInAgain, useOnline } from '../entry/entry';
import type { PulledTables } from '../pull';
import { afterEdit, apply, applyBlocked, IDLE, type ApplyState } from './apply';
import {
  bulkContext,
  bulkRows,
  filterRows,
  firearmLabel,
  NO_FILTER,
  tagNamesOn,
  targetIds,
  type BulkFilter,
} from './model';

type ActionKind = BulkAction['kind'];

/** The firearm picker's "not chosen yet", distinct from None. */
const UNCHOSEN = 'unchosen';
const NONE = '';

function errorText(t: TFunction, error: BulkError): string {
  switch (error.kind) {
    case 'noSessions':
      return t('web.bulk.errorNoSessions');
    case 'blankTag':
      return t('web.bulk.errorBlankTag');
    case 'tooLong':
      return t('web.entry.errorTooLong', {
        field: error.field === 'tag' ? t('web.bulk.tag') : t('session.location'),
        max: error.max,
      });
    case 'unknownFirearm':
      return t('web.entry.errorUnknownFirearm');
    case 'nothingToChange':
      return t('web.bulk.errorNothing');
    case 'tooManyChanges':
      return t('web.bulk.errorTooMany', { needed: error.needed, max: error.max });
  }
}

function statusLines(t: TFunction, state: ApplyState): string[] {
  const { status } = state;
  switch (status.kind) {
    case 'applying':
      return [t('web.bulk.applying')];
    case 'applied': {
      const { summary } = status;
      const lines = [t('web.bulk.applied', { count: summary.changed })];
      if (summary.unchanged > 0) lines.push(t('web.bulk.unchanged', { count: summary.unchanged }));
      if (summary.missing > 0) lines.push(t('web.bulk.missing', { count: summary.missing }));
      if (status.refused > 0) lines.push(t('web.bulk.refused', { count: status.refused }));
      if (!status.refreshed) lines.push(t('web.bulk.reload'));
      return lines;
    }
    case 'failed':
      if (status.error === 'network') return [t('web.bulk.failedNetwork')];
      if (status.error === 'unauthenticated') return [t('web.bulk.failedSignedOut')];
      if (status.error === 'versionUnsupported') return [t('web.bulk.failedOutdated')];
      return [t('web.entry.failed')];
    case 'invalid':
      return status.errors.map((error) => errorText(t, error));
    case 'idle':
      return [];
  }
}

export function BulkEdit({
  tables,
  refresh,
}: {
  tables: PulledTables;
  refresh: () => Promise<boolean>;
}) {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const [filter, setFilter] = useState<BulkFilter>(NO_FILTER);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [kind, setKind] = useState<ActionKind>('addTag');
  const [tagName, setTagName] = useState('');
  const [removeName, setRemoveName] = useState('');
  const [firearm, setFirearm] = useState(UNCHOSEN);
  const [location, setLocation] = useState('');
  const [state, setState] = useState<ApplyState>(IDLE);
  const [signedInAgain, setSignedInAgain] = useState(false);

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
      [...tables.firearms.values()]
        .filter((row) => row.deleted_at === null || row.deleted_at === undefined)
        .map((row) => ({ id: String(row.id), label: firearmLabel(row) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [tables],
  );
  const places = rankRecentLocations(
    useMemo(() => locationUsage(tables.sessions), [tables]),
    location,
  );

  // Any change to what Apply would send makes a held request stale.
  const edit = (change: () => void) => {
    change();
    setState(afterEdit);
  };

  const action: BulkAction | null =
    kind === 'addTag'
      ? { kind, name: tagName }
      : kind === 'removeTag'
        ? removeName === ''
          ? null
          : { kind, name: removeName }
        : kind === 'setFirearm'
          ? firearm === UNCHOSEN
            ? null
            : { kind, firearmId: firearm === NONE ? null : firearm }
          : { kind, location };

  const blocked = applyBlocked(online, state);
  const runApply = (held: ApplyState['held']) => {
    if (blocked !== null || (held === null && action === null)) return;
    setState({ status: { kind: 'applying' }, held: null });
    void apply(
      {
        loadContext: async () =>
          bulkContext(
            await loadTables(
              kind === 'setFirearm'
                ? [
                    'sessions',
                    'tags',
                    'session_tags',
                    'firearms',
                    'series',
                    'shots',
                    'falt_stations',
                  ]
                : ['sessions', 'tags', 'session_tags', 'firearms'],
            ),
          ),
        build: (context) =>
          buildBulkEdit(action!, targets, context, {
            newId: uuidv7,
            newChangeId: () => crypto.randomUUID(),
            now: () => new Date().toISOString(),
          }),
        push: pushEntry,
        refresh,
      },
      held,
    ).then((next) => {
      setState(next);
      if (next.status.kind === 'applied') {
        setSelected(new Set());
        setSignedInAgain(false);
      }
    });
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

  const clearsLocation = kind === 'setLocation' && location.trim() === '';
  const applyLabel = t(clearsLocation ? 'web.bulk.applyClearLocation' : 'web.bulk.apply', {
    count: targets.length,
  });
  const lines = statusLines(t, state);
  const failedWith = state.status.kind === 'failed' ? state.status.error : null;

  return (
    <div className="bulk">
      <section className="card bulk-filter">
        <label className="field">
          {t('period.from')}
          <input
            type="date"
            value={filter.from}
            onChange={(event) => edit(() => setFilter({ ...filter, from: event.target.value }))}
          />
        </label>
        <label className="field">
          {t('period.to')}
          <input
            type="date"
            value={filter.to}
            onChange={(event) => edit(() => setFilter({ ...filter, to: event.target.value }))}
          />
        </label>
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
          runApply(null);
        }}
      >
        <label className="field">
          {t('web.bulk.action')}
          <select
            value={kind}
            onChange={(event) => edit(() => setKind(event.target.value as ActionKind))}
          >
            <option value="addTag">{t('web.bulk.actionAddTag')}</option>
            <option value="removeTag">{t('web.bulk.actionRemoveTag')}</option>
            <option value="setFirearm">{t('web.bulk.actionFirearm')}</option>
            <option value="setLocation">{t('web.bulk.actionLocation')}</option>
          </select>
        </label>
        {kind === 'addTag' && (
          <label className="field">
            {t('web.bulk.tag')}
            <input
              value={tagName}
              list="bulk-tags"
              placeholder={t('session.tagPlaceholder')}
              maxLength={TEXT_LIMITS.tags.name}
              onChange={(event) => edit(() => setTagName(event.target.value))}
            />
            <datalist id="bulk-tags">
              {allTags.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
        )}
        {kind === 'removeTag' && (
          <label className="field">
            {t('web.bulk.tag')}
            <select
              value={tagsOnTargets.includes(removeName) ? removeName : ''}
              onChange={(event) => edit(() => setRemoveName(event.target.value))}
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
        {kind === 'setFirearm' && (
          <label className="field">
            {t('session.firearm')}
            <select
              value={firearm}
              onChange={(event) => edit(() => setFirearm(event.target.value))}
            >
              <option value={UNCHOSEN} disabled>
                {t('web.bulk.choose')}
              </option>
              <option value={NONE}>{t('session.none')}</option>
              {firearms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === 'setLocation' && (
          <label className="field">
            {t('session.location')}
            <input
              value={location}
              list="bulk-locations"
              placeholder={t('session.locationPlaceholder')}
              maxLength={TEXT_LIMITS.sessions.location}
              onChange={(event) => edit(() => setLocation(event.target.value))}
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
              targets.length === 0 ||
              action === null ||
              (kind === 'removeTag' && !tagsOnTargets.includes(removeName))
            }
          >
            {applyLabel}
          </button>
          {state.held !== null && (
            <button
              type="button"
              className="secondary"
              disabled={blocked !== null}
              onClick={() => runApply(state.held)}
            >
              {t('web.entry.retry')}
            </button>
          )}
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
      {failedWith === 'unauthenticated' && !signedInAgain && (
        <SignInAgain onSignedIn={() => setSignedInAgain(true)} />
      )}

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
                    <td>{formatLocalDate(row.startedAt, i18n.language)}</td>
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
    </div>
  );
}
