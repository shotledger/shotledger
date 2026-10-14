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
import { MAX_ROUNDS_FIRED } from '@shotledger/shared/src/sync-client/rounds-entry';
import type { EntryError } from '@shotledger/shared/src/sync-client/session-entry';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { uuidv7 } from 'uuidv7';

import {
  COMPETITION_LEVELS,
  disciplineLabel,
  matchFormatLabel,
  type CompetitionLevel,
} from '../../../app/src/features/session/labels';
import { currentUserId, loadTables, pushRows, uploadPhoto } from '../api';
import type { ReauthOutcome } from '../reauth';
import { SignInAgain } from '../sign-in-again';
import type { PulledTables } from '../pull';
import { DateField, TimeField } from '../fields/date-time-fields';
import { KindPicker, RoundsFiredField, SectionHeading, StartFinalButton } from './kind-fields';
import { buildEntry, disciplineOptions } from './kinds';
import { faltSendsTheSame, initialFalt, isFaltForm, type FaltForm } from './falt-model';
import { FaltStations } from './falt-stations';
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
  rowShots,
  rowSummary,
  sendsTheSame,
  seriesLengthOf,
  startedAtIso,
  withDiscipline,
  withProgram,
  withRegulation,
  withRowPhoto,
  withType,
  type EntryForm,
} from './model';
import { EntryCells } from './entry-cells';
import { heldPhotosFor } from './photo-upload';
import { lastTimes, preselection, runningTotals } from './running-totals';
import {
  afterEdit,
  IDLE,
  reusablePhotoIds,
  save,
  saveBlocked,
  submitRequest,
  type SaveState,
} from './save';
import { SeriesPhoto, useSeriesPhotos } from './series-photo';
import { addTag, removeTag } from './tags';
import { TagsField } from './tags-field';
import { showDate } from '../dates';
import { pickableFirearms } from '../firearms/active';

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
function errorText(
  t: TFunction,
  error: EntryError,
  rowLabel: (row: number) => string,
  decimal: boolean,
): string {
  switch (error.kind) {
    case 'series':
      if (error.error.kind === 'comma')
        return t('web.entry.errorComma', { row: rowLabel(error.row) });
      // With decimals a bare ring ("9", "X") is not a shot: say what is (QA #747).
      return t(decimal ? 'web.entry.errorTokenDecimal' : 'web.entry.errorToken', {
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
        tag: t('session.tags'),
      }[error.field];
      return t('web.entry.errorTooLong', { field, max: error.max });
    }
    case 'unknownFirearm':
      return t('web.entry.errorUnknownFirearm');
    case 'unknownAmmoLot':
      return t('web.entry.errorUnknownAmmoLot');
    case 'invalidStartedAt':
      return t('web.entry.errorDateTime');
    case 'startedAtOutOfRange':
      return t('web.entry.errorDateRange');
    case 'nothingEntered':
      return t('web.entry.errorNothingEntered');
    case 'invalidRounds':
      return t('session.roundsFiredInvalid', { max: MAX_ROUNDS_FIRED });
    case 'tooManyChanges':
      return t('web.entry.errorTooManyChanges');
    case 'hitsDiscipline':
      return t('web.entry.failed');
    case 'stationPoints':
      return t('web.entry.errorStationPoints', { row: rowLabel(error.row) });
    case 'invalidStation':
      return t('web.entry.errorInvalidStation', { row: rowLabel(error.row) });
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
      if (status.photo === 'photoRateLimited') return t('web.entry.failedPhotoRateLimited');
      if (status.photo === 'photoQuota') return t('web.entry.failedPhotoQuota');
      if (status.photo === 'photoTooLarge') return t('web.entry.failedPhotoTooLarge');
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
  const { t } = useTranslation();
  const online = useOnline();
  // The synced profile prefills the klass and ranks the events, as on the phone (C6).
  const profile = useMemo(() => readAccountSettings(tables.settings), [tables]);
  // The last session's discipline and firearm, as the phone's New Session (#822).
  const [preselected] = useState(() => preselection(tables.sessions, tables.firearms));
  const [form, setForm] = useState<EntryForm>(() => initialForm(new Date(), profile, preselected));
  const [state, setState] = useState<SaveState>(IDLE);
  // A fält session's stations, beside the series rows (web-falt-entry-spec C1).
  const [falt, setFalt] = useState<FaltForm>(initialFalt);
  // The form as last set: a photo pick resolves later than the render that started it.
  const latest = useRef(form);
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
    const prev = latest.current;
    latest.current = next;
    setForm(next);
    // Only blank rows added (Enter, Add Series): the held request still holds (R21).
    const unchanged = sendsTheSame(prev, next);
    setState((was) => afterEdit(was, { sendsTheSame: unchanged }));
  };
  // A photo pick or removal is a form edit, so it drops a held request (photo spec R6).
  const photos = useSeriesPhotos((key, photo) => edit(withRowPhoto(latest.current, key, photo)));
  const set = <K extends keyof EntryForm>(key: K, value: EntryForm[K]) =>
    edit({ ...form, [key]: value });
  const editFalt = (next: FaltForm) => {
    setFalt(next);
    const unchanged = faltSendsTheSame(falt, next);
    setState((was) => afterEdit(was, { sendsTheSame: unchanged }));
  };

  const discipline = requireDiscipline(form.disciplineId);
  const programs = programsForDiscipline(form.disciplineId);
  const groups = weaponGroupsForDiscipline(form.disciplineId);
  const classes = classesFor(form);
  const events = eventsFor(form);
  const mode = modeOf(form);
  const fixed = isFixed(form);
  const isCompetition = form.type === 'competition';
  const isSeries = form.kind === 'series';
  // Fält as stations; a rounds-only fält session stays rounds (#718).
  const isFalt = isSeries && isFaltForm(form);

  const firearms = useMemo(
    () =>
      [...pickableFirearms(tables.firearms).values()]
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
    dateLabel: startedAt ? showDate(startedAt) : '',
  });

  // The phone's series entry figures over the typed rows (running-totals.ts).
  const seriesLength = seriesLengthOf(form);
  const typed = form.rows.map((row) => ({
    isSighter: row.isSighter,
    isFinal: row.isFinal === true,
    shots: rowShots(row.text, mode),
  }));
  const session = runningTotals(typed);
  const lastTime = lastTimes(
    tables,
    {
      disciplineId: form.disciplineId,
      startedAt,
      decimalScoring: decimalShown(form) && form.decimalScoring,
    },
    typed,
  );
  const formatTotal = (tenths: number) => tenthsToScore(tenths).toFixed(mode === 'decimal' ? 1 : 0);

  const blocked = saveBlocked(online, state);
  const errors = state.status.kind === 'invalid' ? state.status.errors : [];
  const rowLabel = (row: number) =>
    isFalt
      ? t('station.title', { position: row })
      : form.rows[row - 1]?.isSighter
        ? t('session.sighter')
        : t('session.seriesTitle', { position: row });
  const rowErrors = new Map<number, string>();
  const formErrors: string[] = [];
  for (const error of errors) {
    const text = errorText(t, error, rowLabel, mode === 'decimal');
    if ('row' in error) rowErrors.set(error.row, text);
    else formErrors.push(text);
  }

  const pickedBlobs = () => new Map([...photos.picks].map(([key, pick]) => [key, pick.blob]));

  const runSave = () => {
    const held = submitRequest(state);
    if (blocked !== null || startedAt === null) return;
    focusAfterSave.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const spare = state.spare;
    setState({ status: { kind: 'saving' }, held: null, ...(spare && { spare }) });
    void save(
      {
        loadContext: async () => {
          const fresh = await loadTables(['firearms', 'firearm_groups', 'ammo_lots', 'tags']);
          return {
            firearms: fresh.firearms,
            firearmGroups: fresh.firearm_groups.values(),
            ammoLots: fresh.ammo_lots,
            tags: fresh.tags,
          };
        },
        build: (context) =>
          buildEntry(
            form,
            falt,
            defaultName,
            context,
            {
              newId: uuidv7,
              newChangeId: () => crypto.randomUUID(),
              now: () => new Date().toISOString(),
            },
            reusablePhotoIds(pickedBlobs(), spare),
          ),
        currentUserId,
        push: pushRows,
        refresh,
        photos: {
          heldFor: (built) =>
            heldPhotosFor(
              built,
              form.rows.map((row) => row.key),
              pickedBlobs(),
            ),
          upload: uploadPhoto,
        },
      },
      held,
      spare,
    )
      .then((next) => {
        setState(next);
        if (next.status.kind === 'saved') {
          // The session just pushed is now the last one, whether or not the
          // refreshed rows carry it yet.
          const fresh = initialForm(
            new Date(),
            profile,
            preselection(tables.sessions, tables.firearms, {
              disciplineId: form.disciplineId,
              firearmId: form.firearmId,
              startedAt: startedAt ?? '',
            }),
          );
          latest.current = fresh;
          setForm(fresh);
          setFalt(initialFalt());
          photos.clear();
        }
      })
      // save() catches what it calls; this is the last guard against "saving" forever (R18).
      .catch(() =>
        setState({ status: { kind: 'failed', error: 'unknown' }, held, ...(spare && { spare }) }),
      );
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
          {/* The phone's New Session order (#822): what the first shot needs
              leads, the optional fields fold under Details. Date and time stay
              up front: the web logs sessions after the fact. */}
          <section className="card entry-fields">
            {preselected?.disciplineId != null && (
              <p className="muted entry-preselected">{t('entryA.fromLastSession')}</p>
            )}
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
            {isFalt && (
              <label className="field">
                {t('session.faltResultMode')}
                <select
                  value={falt.resultMode}
                  onChange={(event) =>
                    editFalt({ ...falt, resultMode: event.target.value as FaltForm['resultMode'] })
                  }
                >
                  <option value="falt">{t('session.faltResultModeFalt')}</option>
                  <option value="poangfalt">{t('session.faltResultModePoangfalt')}</option>
                </select>
              </label>
            )}
            <DateField
              label={t('session.date')}
              value={form.date}
              onChange={(date) => set('date', date)}
              required
            />
            <TimeField
              label={t('web.entry.time')}
              value={form.time}
              onChange={(time) => set('time', time)}
              required
            />
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
            {!isSeries && <RoundsFiredField form={form} edit={edit} />}
          </section>
          <details className="card entry-details">
            <summary>
              <strong>{t('entryA.details')}</strong>
              <span className="muted">
                {t(profile.showAmmoLots ? 'entryA.detailsSummary' : 'entryA.detailsSummaryNoAmmo')}
              </span>
            </summary>
            <div className="entry-fields">
              <KindPicker form={form} edit={edit} />
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
              {/* Hidden with the area, as New Session on the phone (#801). */}
              {profile.showAmmoLots && (
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
              )}
              {isSeries && form.programId === null && !isFalt && (
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
            </div>
            <TagsField
              tags={tables.tags}
              chosen={form.tags}
              onAdd={(typed) => edit(addTag(form, typed, tables.tags))}
              onRemove={(name) => edit(removeTag(form, name))}
            />
          </details>

          {isFalt && <FaltStations falt={falt} onEdit={editFalt} rowErrors={rowErrors} />}
          <section className="card series-rows" hidden={!isSeries || isFalt}>
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
                  {/* Always while it parses, 0 · 0X included, as the phone's live total. */}
                  <span className="row-summary">
                    {summary.ok
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
                  <EntryCells
                    shots={rowShots(row.text, mode)}
                    length={seriesLength}
                    mode={mode}
                    lastTime={lastTime[index] ?? null}
                  />
                  {profile.showPhotos && (
                    <SeriesPhoto
                      rowLabel={label}
                      pick={photos.picks.get(row.key)}
                      error={photos.errors.get(row.key)}
                      onFile={(file) => void photos.choose(row.key, file)}
                      onRemove={() => photos.remove(row.key)}
                    />
                  )}
                  {rowError && <p className="danger row-error">{rowError}</p>}
                </div>
              );
            })}
            <p className="entry-session-total">
              <span className="muted">{t('entryA.sessionTotal')}</span>{' '}
              <strong>{formatTotal(session.totalTenths)}</strong>{' '}
              <span className="muted">{t('entryA.innerTens', { count: session.innerTens })}</span>
            </p>
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
