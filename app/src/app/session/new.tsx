// New-session form (§4 M3). Field order follows the maintainer's ruling
// (2026-09-03): what the session IS (type + kind), what it is CALLED, WHERE it
// was — then the shooting details.
//
// `kind` is the fork in the form: a 'series' session logs scored series and is
// never offered extra_rounds here, a 'rounds' session logs a fixed shot count
// and is never offered a program, a decimal toggle or series. The choice is
// made once, at creation, and is immutable afterwards (§3 `sessions.kind`).
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';
import {
  buildProgramSkeleton,
  decimalAllowed,
  defaultSessionName,
  disciplinesForRegulations,
  programsForDiscipline,
  requireDiscipline,
  DISCIPLINES,
  shooterClassesForDiscipline,
  weaponGroupsForDiscipline,
  formatShooterClass,
  categoryKey,
  defaultShooterClass,
  rankEventsForShooter,
  spsfEligibleClasses,
  type EventDefinition,
  type ShooterProfile,
  type SkillClass,
  TEXT_LIMITS,
} from '@shotledger/shared';

import { Card } from '@/components/card';
import { InfoButton } from '@/components/info-button';
import { OptionPicker, type PickerOption } from '@/components/option-picker';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import {
  effectiveRegulationIds,
  findRegulation,
  type Regulation,
} from '@shotledger/shared/src/regulations/registry';
import { enabledRegulationIds } from '@/features/regulations/use-regulations';
import { listAmmoLots } from '@/db/queries/ammo-lots';
import { getDefaultFirearmForGroup, listFirearmGroups } from '@/db/queries/firearm-groups';
import { listFirearms } from '@/db/queries/firearms';
import { addSeries } from '@/db/queries/series';
import { setSessionExtraRounds } from '@/db/queries/round-count';
import { getSetting, SETTINGS_KEYS } from '@/db/queries/settings';
import { createSession, type SessionKind, type SessionType } from '@/db/queries/sessions';
import { addSessionTag, getOrCreateTag, listTags } from '@/db/queries/tags';
import { LocationField } from '@/features/location/location-field';
import {
  COMPETITION_LEVELS,
  disciplineLabel,
  formatLocalDate,
  matchFormatHint,
  matchFormatLabel,
  type CompetitionLevel,
} from '@/features/session/labels';
import { readTrackedInputs } from '@/features/settings/tracked-inputs';
import { TagSelect } from '@/features/tags/tag-select';
import { Spacing } from '@/theme/tokens';

const NO_PROGRAM = 'none';

/**
 * A competition is the case the fixed format exists for, so it preselects it
 * (#348); training starts free and fills in as it goes. Both are overridable.
 */
function defaultProgramFor(type: SessionType, disciplineId: string): string {
  if (type !== 'competition') return NO_PROGRAM;
  return programsForDiscipline(disciplineId)[0]?.id ?? NO_PROGRAM;
}

/**
 * The discipline to land on when a regelverk is picked: the first that
 * belongs to a federation at all. Generic disciplines survive every filter
 * and sort first, so without this a shooter choosing SvSF would land on free
 * training against a ring target. Not "the regelverk's OWN federation":
 * SvSF's own discipline is snabbluftpistol, and the shooter who enabled SvSF
 * is far more likely shooting luftpistol — an ISSF definition, listed first.
 */
function firstDisciplineFor(regulationId: string): string | undefined {
  const available = disciplinesForRegulations([regulationId]);
  return (available.find((d) => d.federation !== 'generic') ?? available[0])?.id;
}

/**
 * The vapengrupp a training session takes from the gun instead of asking for
 * it (maintainer, 2026-09-13: "the weapon group and class are not relevant for
 * practise. only relevant when competing").
 *
 * Derived, never nulled: `goldSeriesThreshold` reads the weapon group, and
 * practice series count towards the märkesprov, so a training session that
 * stopped carrying one would silently stop counting.
 *
 * `isDefaultForGroup` marks the go-to firearm FOR a group rather than the
 * primary group OF a firearm, so it is used only to break a tie. When it
 * cannot, this returns null and the caller keeps showing the picker rather
 * than guessing.
 */
function derivedWeaponGroup(firearmId: string | null): string | null {
  if (!db || firearmId === null) return null;
  const rows = listFirearmGroups(db, firearmId);
  if (rows.length === 1) return rows[0]!.groupId;
  const marked = rows.filter((row) => row.isDefaultForGroup === 1);
  return marked.length === 1 ? marked[0]!.groupId : null;
}

/**
 * The events a discipline offers under the regelverk being logged: ISSF's
 * own, or ISSF's plus SvSF's national classes when SvSF is picked. Ranked,
 * not filtered by eligibility (see rankEventsForShooter).
 */
function eventsUnder(
  regulationId: string,
  disciplineId: string,
  profile: ShooterProfile,
): readonly EventDefinition[] {
  return rankEventsForShooter(
    profile,
    disciplineId,
    new Date().getFullYear(),
    effectiveRegulationIds([regulationId]),
  );
}

/**
 * The event to preselect: the first one the shooter is eligible for, or null
 * for a discipline that has no events (every SPSF and generic one).
 */
function preferredEventId(
  regulationId: string,
  disciplineId: string,
  profile: ShooterProfile,
): string | null {
  return eventsUnder(regulationId, disciplineId, profile)[0]?.id ?? null;
}

export default function NewSessionScreen() {
  // Read once per screen: these are set in Settings and do not change while
  // a session is being created.
  const shooterProfile: ShooterProfile = useMemo(
    () => ({
      birthYear: db ? getSetting<number | null>(db, SETTINGS_KEYS.birthYear, null) : null,
      skillClass: db ? getSetting<SkillClass | null>(db, SETTINGS_KEYS.skillClass, null) : null,
      competesInWomensClasses: db
        ? getSetting<boolean>(db, SETTINGS_KEYS.competesInWomensClasses, false)
        : false,
    }),
    [],
  );
  const { t, i18n } = useTranslation();
  const router = useRouter();

  const [type, setType] = useState<SessionType>('training');
  const tracked = useMemo(() => readTrackedInputs(db), []);
  const [kind, setKind] = useState<SessionKind>('series');
  // One regelverk at a time (maintainer, 2026-09-12: pick the regulation
  // first). With a single one enabled it is not a choice, so the picker stays
  // hidden and its disciplines are simply the list — which is what a fresh
  // SPSF-only install sees.
  const regulations = useMemo<readonly Regulation[]>(
    () =>
      enabledRegulationIds()
        .map(findRegulation)
        .filter((regulation): regulation is Regulation => regulation !== null),
    [],
  );
  const [regulationId, setRegulationId] = useState<string>(() => regulations[0]?.id ?? '');
  // Generic disciplines survive every filter (ADR 0011), so free training is
  // reachable whichever regelverk is selected — and with none enabled, the
  // unknown id filters to exactly those.
  const availableDisciplines = disciplinesForRegulations([regulationId]);
  const disciplineIdInitial =
    firstDisciplineFor(regulationId) ?? DISCIPLINES[0]?.id ?? 'spsf-precision';
  const [disciplineId, setDisciplineId] = useState<string>(disciplineIdInitial);
  const [programId, setProgramId] = useState<string>(() =>
    defaultProgramFor(type, disciplineIdInitial),
  );
  const [level, setLevel] = useState<CompetitionLevel>('forening');
  const [isChampionship, setIsChampionship] = useState(false);
  const [competitionName, setCompetitionName] = useState('');
  const [weaponGroup, setWeaponGroup] = useState<string | null>(null);
  // Prefilled from the profile rather than asked afresh every session.
  const [shooterClass, setShooterClass] = useState<string | null>(() =>
    defaultShooterClass(shooterProfile, new Date().getFullYear()),
  );
  // ISSF puts the category on the EVENT, where SPSF puts it on the klass, so
  // a session carries one or the other and never both.
  const [eventId, setEventId] = useState<string | null>(() =>
    preferredEventId(regulationId, disciplineIdInitial, shooterProfile),
  );
  const [firearmId, setFirearmId] = useState<string | null>(null);
  const [ammoLotId, setAmmoLotId] = useState<string | null>(null);
  const [decimalScoring, setDecimalScoring] = useState(false);
  // Vanlig fält is the default: poängfält is the rarer form, and SHB
  // describes both over the same two numbers (D.6.11 p. 95).
  const [faltResultMode, setFaltResultMode] = useState<'falt' | 'poangfalt'>('falt');
  const [seriesLengthText, setSeriesLengthText] = useState<string>(() =>
    String(requireDiscipline(disciplineIdInitial).defaultSeriesLength),
  );
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [roundsFired, setRoundsFired] = useState('');

  const discipline = requireDiscipline(disciplineId);
  const programs = programsForDiscipline(disciplineId);
  const program = kind === 'series' ? (programs.find((p) => p.id === programId) ?? null) : null;
  const groups = weaponGroupsForDiscipline(disciplineId);
  // Every klass the discipline's federation defines stays selectable — the
  // shooter's own eligibility only decides the ORDER and the preselection,
  // never what is on offer (maintainer, 2026-09-12: "pre populate based on
  // user settings and allow override"). A club evening can put anyone in any
  // class, and the app should not argue.
  // Ranked, not filtered: a club evening can put anyone in any event, exactly
  // as it can in any klass. Empty for an SPSF or generic discipline, which is
  // what hides the picker rather than showing an empty one.
  const events = eventsUnder(regulationId, disciplineId, shooterProfile);
  const allClasses = shooterClassesForDiscipline(disciplineId);
  // The chosen gun narrows it: Jun/Dam/Vet exist only in vapengrupp C.
  const eligible = spsfEligibleClasses(shooterProfile, new Date().getFullYear(), weaponGroup);
  const classes = [
    ...eligible.filter((klass) => allClasses.includes(klass)),
    ...allClasses.filter((klass) => !eligible.includes(klass)),
  ];
  const showDecimalToggle =
    kind === 'series' && discipline.scoring === 'rings' && decimalAllowed(discipline, program);
  // Fält is scored in hits on figures, so it is the one place this is asked.
  const showFaltResultMode = kind === 'series' && discipline.scoring === 'hits';
  // A fixed format already says how many shots a series takes (#348).
  const showSeriesLength = kind === 'series' && discipline.scoring === 'rings' && !program;
  // Any whole number of shots; blank or invalid falls back to the discipline's.
  const parsedSeriesLength = Number(seriesLengthText.trim());
  const seriesLength =
    Number.isInteger(parsedSeriesLength) && parsedSeriesLength > 0 ? parsedSeriesLength : null;
  // Only under the chosen chip: on Free Format there is nothing laid out to
  // describe.
  const programHint = program ? matchFormatHint(t, program) : null;
  // Vapengrupp and klass are competition concepts. A training session still
  // CARRIES a vapengrupp — the märke reads it — but takes it from the gun
  // rather than asking. Klass and event are entry classifications with no
  // meaning outside a competition, so they are simply not recorded.
  const isCompetition = type === 'competition';
  // Settings → Optional Fields can switch the competition pickers off; the
  // weapon group then comes from the gun exactly as in training (#569).
  const asksGroup = isCompetition && tracked.weaponGroups;
  const asksClass = isCompetition && tracked.shooterClass;
  const derivedGroup = asksGroup ? null : derivedWeaponGroup(firearmId);
  // The one case training still asks: a gun IS chosen but sits in several
  // groups with no tie broken. Nulling it there would cost the shooter their
  // märke count on a gun the app knows about. With no firearm chosen there is
  // nothing to derive from and nothing to lose, so the picker stays hidden —
  // otherwise "training does not ask for a vapengrupp" would be false for
  // every session that has not picked a gun yet, which is most of them.
  const showGroupPicker =
    groups.length > 0 && (asksGroup || (firearmId !== null && derivedGroup === null));
  const showClassPicker = allClasses.length > 0 && asksClass;
  const showEventPicker = events.length > 0 && isCompetition;

  const firearms = useMemo(() => (db ? listFirearms(db) : []), []);
  const ammoLots = useMemo(() => (db ? listAmmoLots(db) : []), []);
  const knownTags = useMemo(() => (db ? listTags(db).map((tag) => tag.name) : []), []);
  const onlineLocationLookup = useMemo(
    () => (db ? getSetting<boolean>(db, SETTINGS_KEYS.onlineLocationLookup, false) : false),
    [],
  );

  const startedAt = useMemo(() => new Date().toISOString(), []);
  const defaultName = defaultSessionName({
    typeLabel: t(`sessionType.${type}`),
    dateLabel: formatLocalDate(startedAt, i18n.language),
  });
  const name = nameOverride ?? defaultName;

  function onSelectType(nextType: SessionType) {
    setType(nextType);
    setProgramId(defaultProgramFor(nextType, disciplineId));
  }

  function onSelectDiscipline(nextId: string, underRegulationId: string = regulationId) {
    setDisciplineId(nextId);
    setProgramId(defaultProgramFor(type, nextId));
    setWeaponGroup(null);
    setEventId(preferredEventId(underRegulationId, nextId, shooterProfile));
    setDecimalScoring(false);
    setSeriesLengthText(String(requireDiscipline(nextId).defaultSeriesLength));
  }

  function onSelectRegulation(nextId: string) {
    setRegulationId(nextId);
    // The discipline the form was on may not exist under the new regelverk,
    // and every field below it is discipline-shaped, so this cascades exactly
    // as picking a discipline by hand does — including the event, whose list
    // differs between ISSF and SvSF for the same discipline.
    const first = firstDisciplineFor(nextId);
    if (first !== undefined) onSelectDiscipline(first, nextId);
  }

  function onSelectKind(nextKind: SessionKind) {
    setKind(nextKind);
    // The two shapes share no scoring-side state: a rounds session has no
    // program, no series and no decimal mode.
    if (nextKind === 'rounds') {
      setProgramId(NO_PROGRAM);
      setDecimalScoring(false);
    } else {
      setRoundsFired('');
    }
  }

  function onSelectWeaponGroup(groupId: string) {
    setWeaponGroup(groupId);
    // Default the firearm to the one marked default for this vapengrupp (§4 M3).
    if (db) {
      const defaultFirearm = getDefaultFirearmForGroup(db, groupId);
      if (defaultFirearm) setFirearmId(defaultFirearm.firearmId);
    }
  }

  function onCreate() {
    if (!db) return;
    const session = createSession(db, {
      name: name.trim() || defaultName,
      type,
      kind,
      disciplineId,
      programId: program?.id ?? null,
      competitionLevel: type === 'competition' ? level : null,
      isChampionship: type === 'competition' && isChampionship,
      competitionName: type === 'competition' && competitionName ? competitionName : null,
      weaponGroup: asksGroup ? weaponGroup : (derivedGroup ?? weaponGroup),
      shooterClass: asksClass ? shooterClass : null,
      eventId: isCompetition ? eventId : null,
      firearmId,
      ammoLotId,
      startedAt,
      location: location.trim() === '' ? null : location.trim(),
      decimalScoring: showDecimalToggle && decimalScoring,
      faltResultMode: showFaltResultMode ? faltResultMode : null,
      seriesLength: showSeriesLength ? seriesLength : null,
    });

    for (const tagName of selectedTags) {
      addSessionTag(db, session.id, getOrCreateTag(db, tagName).id);
    }

    // A rounds session's shot count IS extra_rounds: rounds fired but never
    // scored (spec A1 §A1.3). It goes through the round-count path so the
    // firearm counter moves with it — never through createSession.
    if (kind === 'rounds') {
      const parsed = roundsFired.trim() === '' ? null : Number(roundsFired.trim());
      if (parsed !== null && Number.isInteger(parsed) && parsed >= 0) {
        setSessionExtraRounds(db, session.id, parsed);
      }
    }

    // A fixed-format program pre-creates its series skeleton (§6.3).
    if (program) {
      for (const entry of buildProgramSkeleton(program)) {
        addSeries(db, {
          sessionId: session.id,
          position: entry.position,
          isSighter: entry.isSighter,
          isFinal: entry.isFinal,
        });
      }
    }

    router.replace(`/session/${session.id}`);
  }

  const toOptions = <T extends string>(
    values: readonly { value: T; label: string }[],
    prefix: string,
  ): PickerOption<T>[] =>
    values.map((option) => ({ ...option, testID: `${prefix}-${option.value}` }));

  return (
    <Screen>
      <Card>
        <ThemedText type="smallBold">{t('session.type')}</ThemedText>
        <SegmentedControl
          options={[
            { value: 'training' as SessionType, label: t('sessionType.training') },
            { value: 'competition' as SessionType, label: t('sessionType.competition') },
          ]}
          value={type}
          onChange={onSelectType}
        />
        <OptionPicker
          label={t('session.kind')}
          options={toOptions(
            [
              { value: 'series' as SessionKind, label: t('sessionKind.series') },
              { value: 'rounds' as SessionKind, label: t('sessionKind.rounds') },
            ],
            'kind',
          )}
          value={kind}
          onChange={onSelectKind}
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t('session.kindHint')}
        </ThemedText>
      </Card>

      <Card>
        <View style={styles.headerRow}>
          <ThemedText type="smallBold" style={styles.headerLabel}>
            {t('session.name')}
          </ThemedText>
          <InfoButton
            title={t('session.name')}
            body={t('session.nameHint')}
            testID="session-name-info"
          />
        </View>
        <TextField
          value={name}
          onChangeText={setNameOverride}
          maxLength={TEXT_LIMITS.sessions.name}
          testID="session-name"
        />
      </Card>

      <Card>
        <LocationField
          value={location}
          onChange={setLocation}
          onlineEnabled={onlineLocationLookup}
          language={i18n.language}
        />
      </Card>

      <Card>
        {regulations.length > 1 && (
          <OptionPicker
            label={t('session.regulation')}
            options={toOptions(
              regulations.map((regulation) => ({
                value: regulation.id,
                label: regulation.shortName,
              })),
              'regulation',
            )}
            value={regulationId}
            onChange={onSelectRegulation}
          />
        )}
        <OptionPicker
          label={t('session.discipline')}
          options={toOptions(
            availableDisciplines.map((d) => ({ value: d.id, label: disciplineLabel(t, d.id) })),
            'discipline',
          )}
          value={disciplineId}
          onChange={onSelectDiscipline}
        />
        {/* A discipline with no programs of its own would render a picker whose
            only option is "no program" — a choice that is not one. The
            practice discipline is the case. */}
        {kind === 'series' && programs.length > 0 && (
          <>
            <View style={styles.headerRow}>
              <ThemedText type="smallBold" style={styles.headerLabel}>
                {t('session.matchFormat')}
              </ThemedText>
              <InfoButton
                title={t('session.matchFormat')}
                body={t('session.matchFormatInfo')}
                testID="program-info"
              />
            </View>
            <OptionPicker
              options={toOptions(
                [
                  { value: NO_PROGRAM, label: t('session.freeFormat') },
                  ...programs.map((p) => ({
                    value: p.id,
                    label: matchFormatLabel(t, p.id, programs.length),
                  })),
                ],
                'program',
              )}
              value={programId}
              onChange={setProgramId}
            />
            {programHint && (
              <ThemedText type="small" themeColor="textSecondary" testID="program-hint">
                {programHint}
              </ThemedText>
            )}
          </>
        )}
        {showSeriesLength && (
          <>
            <View style={styles.headerRow}>
              <ThemedText type="smallBold" style={styles.headerLabel}>
                {t('session.seriesLength')}
              </ThemedText>
              <InfoButton
                title={t('session.seriesLength')}
                body={t('session.seriesLengthHint')}
                testID="series-length-info"
              />
            </View>
            <TextField
              value={seriesLengthText}
              onChangeText={setSeriesLengthText}
              keyboardType="number-pad"
              inputMode="numeric"
              placeholder={String(discipline.defaultSeriesLength)}
              testID="series-length"
            />
          </>
        )}
      </Card>

      {type === 'competition' && (
        <Card>
          <OptionPicker
            label={t('session.competitionLevel')}
            options={toOptions(
              COMPETITION_LEVELS.map((value) => ({
                value,
                label: t(`competitionLevel.${value}`),
              })),
              'level',
            )}
            value={level}
            onChange={setLevel}
          />
          <View style={styles.switchRow}>
            <ThemedText type="small">{t('session.championship')}</ThemedText>
            <Switch
              value={isChampionship}
              onValueChange={setIsChampionship}
              testID="championship-toggle"
            />
          </View>
          <View style={styles.headerRow}>
            <ThemedText type="smallBold" style={styles.headerLabel}>
              {t('session.competitionName')}
            </ThemedText>
            <InfoButton
              title={t('session.competitionName')}
              body={t('session.competitionNameHint')}
              testID="competition-name-info"
            />
          </View>
          <TextField
            value={competitionName}
            onChangeText={setCompetitionName}
            maxLength={TEXT_LIMITS.sessions.competition_name}
            placeholder={t('session.competitionNamePlaceholder')}
            testID="competition-name"
          />
        </Card>
      )}

      {/* A federation defines vapengrupper and klasser, or events — never both.
          Rendering a picker with nothing in it printed an empty "Weapon Group"
          and a "Class: None" on every ISSF session. The CARD needs the same
          guard as the pickers: the practice discipline has none of the three,
          and an always-rendered card left an empty box floating in the form. */}
      {(showGroupPicker || showClassPicker || showEventPicker) && (
        <Card>
          {showGroupPicker && (
            <OptionPicker
              label={t('session.weaponGroup')}
              options={toOptions(
                groups.map((g) => ({ value: g.id, label: g.label })),
                'group',
              )}
              value={weaponGroup}
              onChange={onSelectWeaponGroup}
            />
          )}
          {showClassPicker && (
            <OptionPicker
              label={t('session.shooterClass')}
              options={toOptions(
                classes.map((code) => ({ value: code, label: formatShooterClass(code) })),
                'class',
              )}
              value={shooterClass}
              onChange={setShooterClass}
              emptyLabel={t('session.none')}
            />
          )}
          {showEventPicker && (
            <OptionPicker
              label={t('session.event')}
              options={toOptions(
                events.map((event) => ({
                  value: event.id,
                  label: t(`eventCategory.${categoryKey(event.category)}`),
                })),
                'event',
              )}
              value={eventId}
              onChange={setEventId}
              emptyLabel={t('session.none')}
            />
          )}
        </Card>
      )}

      <Card>
        <OptionPicker
          label={t('session.firearm')}
          options={toOptions(
            firearms.map((f) => ({ value: f.id, label: `${f.make} ${f.model}` })),
            'firearm',
          )}
          value={firearmId}
          onChange={setFirearmId}
          emptyLabel={t('session.none')}
        />
        <OptionPicker
          label={t('session.ammoLot')}
          options={toOptions(
            ammoLots.map((lot) => ({ value: lot.id, label: lot.label })),
            'ammo',
          )}
          value={ammoLotId}
          onChange={setAmmoLotId}
          emptyLabel={t('session.none')}
        />
      </Card>

      {showDecimalToggle && (
        <Card>
          <View style={styles.switchRow}>
            <ThemedText type="small">{t('session.decimalScoring')}</ThemedText>
            <Switch
              value={decimalScoring}
              onValueChange={setDecimalScoring}
              testID="decimal-toggle"
            />
          </View>
        </Card>
      )}

      {showFaltResultMode && (
        <Card>
          <ThemedText type="smallBold" style={styles.headerLabel}>
            {t('session.faltResultMode')}
          </ThemedText>
          <SegmentedControl
            options={[
              { value: 'falt', label: t('session.faltResultModeFalt') },
              { value: 'poangfalt', label: t('session.faltResultModePoangfalt') },
            ]}
            value={faltResultMode}
            onChange={(value) => setFaltResultMode(value as 'falt' | 'poangfalt')}
            testID="falt-result-mode"
          />
          <ThemedText type="small" style={styles.helpText}>
            {t('session.faltResultModeHelp')}
          </ThemedText>
        </Card>
      )}

      {kind === 'rounds' && (
        <Card>
          <View style={styles.headerRow}>
            <ThemedText type="smallBold" style={styles.headerLabel}>
              {t('session.roundsFired')}
            </ThemedText>
            <InfoButton
              title={t('session.roundsFired')}
              body={t('session.roundsFiredHint')}
              testID="rounds-fired-info"
            />
          </View>
          <TextField
            value={roundsFired}
            onChangeText={setRoundsFired}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder="0"
            testID="rounds-fired"
          />
        </Card>
      )}

      <Card>
        <TagSelect known={knownTags} selected={selectedTags} onChange={setSelectedTags} />
      </Card>

      <PrimaryButton label={t('session.create')} onPress={onCreate} testID="create-session" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // A heading and its [i] share a row. The picker's own `label` is dropped
  // for Program so it can too (see OptionPicker's `label` note).
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  headerLabel: {
    flexShrink: 1,
  },
  helpText: {
    marginTop: Spacing.two,
    opacity: 0.7,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
});
