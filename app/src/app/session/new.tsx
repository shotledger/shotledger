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
  DISCIPLINES,
  programsForDiscipline,
  requireDiscipline,
  shooterClassesForDiscipline,
  weaponGroupsForDiscipline,
  formatShooterClass,
} from '@shotledger/shared';

import { Card } from '@/components/card';
import { OptionPicker, type PickerOption } from '@/components/option-picker';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { listAmmoLots } from '@/db/queries/ammo-lots';
import { getDefaultFirearmForGroup } from '@/db/queries/firearm-groups';
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
  programLabel,
  type CompetitionLevel,
} from '@/features/session/labels';
import { TagSelect } from '@/features/tags/tag-select';
import { Spacing } from '@/theme/tokens';

const NO_PROGRAM = 'none';

export default function NewSessionScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  const [type, setType] = useState<SessionType>('training');
  const [kind, setKind] = useState<SessionKind>('series');
  const [disciplineId, setDisciplineId] = useState<string>(DISCIPLINES[0]?.id ?? 'spsf-precision');
  const [programId, setProgramId] = useState<string>(NO_PROGRAM);
  const [level, setLevel] = useState<CompetitionLevel>('forening');
  const [isChampionship, setIsChampionship] = useState(false);
  const [competitionName, setCompetitionName] = useState('');
  const [weaponGroup, setWeaponGroup] = useState<string | null>(null);
  const [shooterClass, setShooterClass] = useState<string | null>(null);
  const [firearmId, setFirearmId] = useState<string | null>(null);
  const [ammoLotId, setAmmoLotId] = useState<string | null>(null);
  const [decimalScoring, setDecimalScoring] = useState(false);
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [roundsFired, setRoundsFired] = useState('');

  const discipline = requireDiscipline(disciplineId);
  const programs = programsForDiscipline(disciplineId);
  const program = kind === 'series' ? (programs.find((p) => p.id === programId) ?? null) : null;
  const groups = weaponGroupsForDiscipline(disciplineId);
  const classes = shooterClassesForDiscipline(disciplineId);
  const showDecimalToggle = kind === 'series' && decimalAllowed(discipline, program);

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

  function onSelectDiscipline(nextId: string) {
    setDisciplineId(nextId);
    setProgramId(NO_PROGRAM);
    setWeaponGroup(null);
    setDecimalScoring(false);
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
      weaponGroup,
      shooterClass,
      firearmId,
      ammoLotId,
      startedAt,
      location: location.trim() === '' ? null : location.trim(),
      decimalScoring: showDecimalToggle && decimalScoring,
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
          onChange={setType}
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
        <ThemedText type="smallBold">{t('session.name')}</ThemedText>
        <TextField value={name} onChangeText={setNameOverride} testID="session-name" />
        <ThemedText type="small" themeColor="textSecondary">
          {t('session.nameHint')}
        </ThemedText>
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
        <OptionPicker
          label={t('session.discipline')}
          options={toOptions(
            DISCIPLINES.map((d) => ({ value: d.id, label: disciplineLabel(t, d.id) })),
            'discipline',
          )}
          value={disciplineId}
          onChange={onSelectDiscipline}
        />
        {kind === 'series' && (
          <OptionPicker
            label={t('session.program')}
            options={toOptions(
              [
                { value: NO_PROGRAM, label: t('session.freeTraining') },
                ...programs.map((p) => ({ value: p.id, label: programLabel(t, p.id) })),
              ],
              'program',
            )}
            value={programId}
            onChange={setProgramId}
          />
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
          <ThemedText type="smallBold">{t('session.competitionName')}</ThemedText>
          <TextField
            value={competitionName}
            onChangeText={setCompetitionName}
            placeholder={t('session.competitionNamePlaceholder')}
            testID="competition-name"
          />
          <ThemedText type="small" themeColor="textSecondary">
            {t('session.competitionNameHint')}
          </ThemedText>
        </Card>
      )}

      <Card>
        <OptionPicker
          label={t('session.weaponGroup')}
          options={toOptions(
            groups.map((g) => ({ value: g.id, label: g.code })),
            'group',
          )}
          value={weaponGroup}
          onChange={onSelectWeaponGroup}
        />
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
      </Card>

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

      {kind === 'rounds' && (
        <Card>
          <ThemedText type="smallBold">{t('session.roundsFired')}</ThemedText>
          <TextField
            value={roundsFired}
            onChangeText={setRoundsFired}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder="0"
            testID="rounds-fired"
          />
          <ThemedText type="small" themeColor="textSecondary">
            {t('session.roundsFiredHint')}
          </ThemedText>
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
});
