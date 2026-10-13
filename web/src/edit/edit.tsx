// Edit Session: one session's fields and main-section series, saved with one
// push (docs/specs/web-session-edit-spec.md §3.2). The form logic is in
// model.ts, what a Save does in save.ts; this file only renders and wires keys.
import {
  categoryKey,
  eventsForDiscipline,
  findEvent,
  formatShooterClass,
  getDiscipline,
  shooterClassesForDiscipline,
  weaponGroupsForDiscipline,
} from '@shotledger/shared/src/disciplines';
import { tenthsToScore } from '@shotledger/shared/src/scoring/totals';
import { TEXT_LIMITS } from '@shotledger/shared/src/sync';
import type { TFunction } from 'i18next';
import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { uuidv7 } from 'uuidv7';

import { COMPETITION_LEVELS } from '../../../app/src/features/session/labels';
import { currentUserId, loadTables, pushRows } from '../api';
import { rowSummary } from '../entry/model';
import { useOnline } from '../entry/entry';
import type { PulledTables } from '../pull';
import type { ReauthOutcome } from '../reauth';
import { Hint } from '../shell/hint';
import { SignInAgain } from '../sign-in-again';
import { errorMessage, statusMessages, type Message } from './messages';
import {
  addRow,
  canMarkSighter,
  editContext,
  openForm,
  setRow,
  toDraft,
  type EditForm,
  type OpenedForm,
} from './model';
import { saveDeps, type EditIo } from './request';
import {
  afterEdit,
  destination,
  editBlocked,
  IDLE,
  run,
  submitRequest,
  type EditState,
} from './save';

type Rows = Map<string, Record<string, unknown>>;

export const firearmLabel = (row: Record<string, unknown>) =>
  `${String(row.make)} ${String(row.model)}`;

/** The live rows of a table as picker options, plus the stored value if it is gone. */
function options(
  rows: Rows,
  label: (row: Record<string, unknown>) => string,
  stored: string | null,
) {
  const live = [...rows.values()]
    .filter((row) => row.deleted_at === null || row.deleted_at === undefined)
    .map((row) => ({ id: String(row.id), label: label(row) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return stored !== null && !live.some((o) => o.id === stored)
    ? [...live, { id: stored, label: '–' }]
    : live;
}

/** The I/O a Save or Delete runs with, from the live page. */
export function webIo(refresh: () => Promise<boolean>): EditIo {
  return {
    currentUserId,
    loadTables,
    push: pushRows,
    refresh,
    newId: uuidv7,
    newChangeId: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
  };
}

/** A message in the reader's language; `rowLabel` names a 1-based form row. */
export function messageText(
  t: TFunction,
  language: string,
  message: Message,
  rowLabel: (row: number) => string = String,
): string {
  return t(message.key, {
    ...message.params,
    ...(message.fieldKey ? { field: t(message.fieldKey) } : {}),
    ...(message.firearms
      ? { firearms: new Intl.ListFormat(language).format(message.firearms) }
      : {}),
    ...(message.row !== undefined ? { row: rowLabel(message.row) } : {}),
  });
}

export interface Done {
  /** Where to go, and what to say there. */
  hash: string;
  lines: string[];
}

export function SessionEdit({
  tables,
  sessionId,
  refresh,
  onReauthenticated,
  onDone,
}: {
  tables: PulledTables;
  sessionId: string;
  refresh: () => Promise<boolean>;
  /** App reloads the logbook when another account signed in (#669 R22). */
  onReauthenticated: (userId: string) => ReauthOutcome;
  onDone: (done: Done) => void;
}) {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const [opened, setOpened] = useState<OpenedForm | null>(() =>
    openForm(editContext(tables), sessionId),
  );
  const [form, setForm] = useState<EditForm | null>(() => opened?.initial ?? null);
  const [state, setState] = useState<EditState>(IDLE);
  const session = opened?.opened.session;
  const disciplineId = String(session?.discipline_id ?? '');
  const discipline = getDiscipline(disciplineId);

  const firearms = useMemo(
    () => options(tables.firearms, firearmLabel, opened?.initial.firearmId ?? null),
    [tables, opened],
  );
  const ammoLots = useMemo(
    () => options(tables.ammo_lots, (row) => String(row.label), opened?.initial.ammoLotId ?? null),
    [tables, opened],
  );

  if (opened === null || form === null || session === undefined) {
    return (
      <div className="session-detail">
        <a className="back" href="#sessions">
          ← {t('web.sessions.back')}
        </a>
        <p className="muted">{t('web.sessions.notFound')}</p>
      </div>
    );
  }

  const isCompetition = session.type === 'competition';
  const working = state.status.kind === 'working';
  const blocked = editBlocked(online, state);
  const edit = (next: EditForm) => {
    setForm(next);
    setState(afterEdit);
  };
  const set = <K extends keyof EditForm>(key: K, value: EditForm[K]) =>
    edit({ ...form, [key]: value });

  const groups = discipline ? weaponGroupsForDiscipline(disciplineId) : [];
  const classes = discipline ? shooterClassesForDiscipline(disciplineId) : [];
  const offered = discipline ? eventsForDiscipline(disciplineId) : [];
  const storedEvent =
    form.eventId !== null && !offered.some((e) => e.id === form.eventId)
      ? findEvent(form.eventId)
      : undefined;
  const events = storedEvent ? [...offered, storedEvent] : offered;

  const rowLabel = (row: number) =>
    form.rows[row - 1]?.isSighter
      ? t('session.sighter')
      : t('session.seriesTitle', { position: row });
  const text = (message: Message) => messageText(t, i18n.language, message, rowLabel);
  const firearmName = (id: string) => {
    const row = tables.firearms.get(id);
    return row === undefined ? null : firearmLabel(row);
  };
  // Series errors go under their row; the rest under the buttons.
  const rowErrors = new Map<number, string[]>();
  const lines: string[] = [];
  if (state.status.kind === 'invalid') {
    for (const error of state.status.errors) {
      const line = text(errorMessage(error));
      if ('row' in error) rowErrors.set(error.row, [...(rowErrors.get(error.row) ?? []), line]);
      else lines.push(line);
    }
  } else {
    lines.push(...statusMessages(state, firearmName).map(text));
  }

  const runSave = () => {
    const held = submitRequest(state);
    if (blocked !== null) return;
    setState({ status: { kind: 'working', action: 'save' }, held: null });
    const draft = toDraft(sessionId, opened.initial, form);
    void run(saveDeps(webIo(refresh), opened.opened, draft), 'save', held)
      .then((next) => {
        setState(next);
        const hash = destination(sessionId, next.status);
        if (hash !== null) {
          onDone({
            hash,
            lines: statusMessages(next, firearmName).map((m) => messageText(t, i18n.language, m)),
          });
        }
      })
      // run() catches what it calls; this is the last guard against "saving" forever (U9).
      .catch(() => setState({ status: { kind: 'failed', error: 'unknown' }, held }));
  };

  const onReload = () => {
    if (state.status.kind !== 'stale') return;
    const next = openForm(state.status.fresh, sessionId);
    setOpened(next);
    setForm(next?.initial ?? null);
    setState(IDLE);
    // The rest of the app catches up with the same server state.
    void refresh();
  };

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
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement)) return;
    // Enter alone never saves: Ctrl+Enter (Cmd+Enter) does.
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) runSave();
  };
  const failedWith = state.status.kind === 'failed' ? state.status.error : null;
  const detail = `#sessions/${encodeURIComponent(sessionId)}`;

  return (
    <div className="entry edit">
      <a className="back" href={detail}>
        ← {String(session.name)}
      </a>
      <form className="entry" onSubmit={onSubmit} onKeyDown={onFormKeyDown} noValidate>
        {/* Nothing changes under a save in flight (#669 R23). */}
        <fieldset className="entry-fieldset" disabled={working}>
          <section className="card entry-fields">
            <label className="field">
              {t('session.date')}
              <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
            </label>
            <label className="field">
              {t('web.entry.time')}
              <input type="time" value={form.time} onChange={(e) => set('time', e.target.value)} />
            </label>
            <label className="field">
              {t('session.name')}
              <input
                value={form.name}
                maxLength={TEXT_LIMITS.sessions.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </label>
            <label className="field">
              {t('session.location')}
              <input
                value={form.location}
                placeholder={t('session.locationPlaceholder')}
                maxLength={TEXT_LIMITS.sessions.location}
                onChange={(e) => set('location', e.target.value)}
              />
            </label>
            {isCompetition && (
              <>
                <label className="field">
                  {t('session.competitionLevel')}
                  <select
                    value={form.competitionLevel ?? ''}
                    onChange={(e) => set('competitionLevel', e.target.value || null)}
                  >
                    {form.competitionLevel === null && (
                      <option value="">{t('session.none')}</option>
                    )}
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
                    onChange={(e) => set('isChampionship', e.target.checked)}
                  />
                  {t('session.championship')}
                </label>
                <label className="field">
                  {t('session.competitionName')}
                  <input
                    value={form.competitionName}
                    placeholder={t('session.competitionNamePlaceholder')}
                    maxLength={TEXT_LIMITS.sessions.competition_name}
                    onChange={(e) => set('competitionName', e.target.value)}
                  />
                </label>
                {groups.length > 0 && (
                  <label className="field">
                    {t('session.weaponGroup')}
                    <select
                      value={form.weaponGroup ?? ''}
                      onChange={(e) => set('weaponGroup', e.target.value || null)}
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
                {classes.length > 0 && (
                  <label className="field">
                    {t('session.shooterClass')}
                    <select
                      value={form.shooterClass ?? ''}
                      onChange={(e) => set('shooterClass', e.target.value || null)}
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
                {events.length > 0 && (
                  <label className="field">
                    {t('session.event')}
                    <select
                      value={form.eventId ?? ''}
                      onChange={(e) => set('eventId', e.target.value || null)}
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
              </>
            )}
            <label className="field">
              {t('session.firearm')}
              <select
                value={form.firearmId ?? ''}
                onChange={(e) => set('firearmId', e.target.value || null)}
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
                onChange={(e) => set('ammoLotId', e.target.value || null)}
              >
                <option value="">{t('session.none')}</option>
                {ammoLots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field edit-notes">
              {t('session.notes')}
              <textarea
                value={form.notes}
                rows={3}
                maxLength={TEXT_LIMITS.sessions.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </label>
          </section>

          {opened.editsSeries && (
            <SeriesRows
              opened={opened}
              form={form}
              edit={edit}
              rowErrors={rowErrors}
              rowLabel={rowLabel}
            />
          )}
          {opened.phoneOnly !== null && (
            <section className="card edit-phone-only">
              <span className="muted">
                {t(
                  opened.phoneOnly.kind === 'stations' ? 'session.stations' : 'session.roundsFired',
                )}
              </span>
              <span>
                {opened.phoneOnly.kind === 'stations'
                  ? opened.phoneOnly.count
                  : opened.phoneOnly.rounds}
              </span>
              <Hint
                text={t(
                  opened.phoneOnly.kind === 'stations'
                    ? 'web.edit.stationsHint'
                    : 'web.edit.roundsHint',
                )}
              />
            </section>
          )}
          {opened.readOnly.length > 0 && (
            <section className="card">
              <ul className="edit-read-only">
                {opened.readOnly.map((row) => (
                  <li key={row.id}>
                    <span className="muted">
                      {t(
                        row.kind === 'final' ? 'web.edit.finalSeries' : 'web.edit.totalOnlySeries',
                        {
                          position: row.position,
                        },
                      )}
                    </span>
                    <span className="read-only-shots">{row.text}</span>
                    {row.hasPhoto && <span className="badge">{t('web.edit.photo')}</span>}
                  </li>
                ))}
              </ul>
              <p className="muted">{t('web.edit.readOnly')}</p>
            </section>
          )}

          <section className="entry-actions">
            {/* While a request is held, the one action resends it (#669 R13). */}
            <button type="submit" disabled={blocked !== null}>
              {state.held === null ? t('session.saveChanges') : t('web.entry.retry')}
            </button>
            <a className="button secondary" href={detail}>
              {t('common.cancel')}
            </a>
            <div className="entry-status" role="status">
              {blocked === 'offline' && <p className="danger">{t('web.entry.offline')}</p>}
              {lines.map((line) => (
                <p key={line} className={state.status.kind === 'working' ? 'muted' : 'danger'}>
                  {line}
                </p>
              ))}
              {state.status.kind === 'stale' && (
                <button type="button" className="secondary" onClick={onReload}>
                  {t('web.edit.reload')}
                </button>
              )}
            </div>
          </section>
        </fieldset>
      </form>
      {/* Outside the form: a form cannot nest in another. */}
      {failedWith === 'unauthenticated' && <SignInAgain onSignedIn={onSignedIn} />}
    </div>
  );
}

function SeriesRows({
  opened,
  form,
  edit,
  rowErrors,
  rowLabel,
}: {
  opened: OpenedForm;
  form: EditForm;
  edit: (next: EditForm) => void;
  rowErrors: ReadonlyMap<number, string[]>;
  rowLabel: (row: number) => string;
}) {
  const { t } = useTranslation();
  const { mode, fixed } = opened;
  return (
    <section className="card series-rows edit-series">
      {form.rows.map((row, index) => {
        const summary = rowSummary(row.text, mode);
        const errors = rowErrors.get(index + 1) ?? [];
        return (
          <div key={row.key} className={row.deleted ? 'series-row deleted' : 'series-row'}>
            <div className="edit-row-label">
              <label htmlFor={`edit-row-${row.key}`}>{rowLabel(index + 1)}</label>
              {row.hasPhoto && <span className="badge">{t('web.edit.photo')}</span>}
            </div>
            <input
              id={`edit-row-${row.key}`}
              className="shots"
              value={row.text}
              autoComplete="off"
              spellCheck={false}
              disabled={row.deleted}
              aria-invalid={errors.length > 0 || !summary.ok}
              onChange={(e) => edit(setRow(form, row.key, { text: e.target.value }))}
            />
            <span className="row-summary">
              {summary.ok && summary.shots > 0 && !row.deleted
                ? t('web.entry.rowSummary', {
                    total: tenthsToScore(summary.totalTenths).toFixed(mode === 'decimal' ? 1 : 0),
                    innerTens: summary.innerTens,
                  })
                : ''}
            </span>
            {!fixed ? (
              <label className="check">
                <input
                  type="checkbox"
                  tabIndex={-1}
                  checked={row.isSighter}
                  disabled={row.deleted || !canMarkSighter(form, row.key, fixed)}
                  onChange={(e) => edit(setRow(form, row.key, { isSighter: e.target.checked }))}
                />
                {t('session.sighter')}
              </label>
            ) : (
              <span />
            )}
            <button
              type="button"
              className="secondary small"
              onClick={() => edit(setRow(form, row.key, { deleted: !row.deleted }))}
            >
              {row.deleted ? t('web.edit.undo') : t('session.deleteSeries')}
            </button>
            {errors.map((message) => (
              <p key={message} className="danger row-error">
                {message}
              </p>
            ))}
          </div>
        );
      })}
      <div>
        <button type="button" className="secondary" onClick={() => edit(addRow(form))}>
          {t('session.addSeries')}
        </button>
      </div>
    </section>
  );
}
