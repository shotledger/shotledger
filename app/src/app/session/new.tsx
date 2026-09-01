// New-session form (§4 M3). Everything the session needs before the first
// series: type, discipline, program, competition details, vapengrupp + klass
// (orthogonal, §6.4a), firearm, ammo lot, and the decimal toggle where the
// rules allow one.
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
import {
  buildProgramSkeleton,
  decimalAllowed,
  defaultSessionName,
  DISCIPLINES,
  programsForDiscipline,
  requireDiscipline,
  shooterClassesForDiscipline,
  weaponGroupCode,
  weaponGroupsForDiscipline,
  formatShooterClass,
} from '@shotledger/shared';

import { Card } from '@/components/card';
import { OptionPicker, type PickerOption } from '@/components/option-picker';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { listAmmoLots } from '@/db/queries/ammo-lots';
import { getDefaultFirearmForGroup } from '@/db/queries/firearm-groups';
import { listFirearms } from '@/db/queries/firearms';
import { addSeries } from '@/db/queries/series';
import { setSessionExtraRounds } from '@/db/queries/round-count';
import { createSession, type SessionType } from '@/db/queries/sessions';
import {
  COMPETITION_LEVELS,
  disciplineLabel,
  formatLocalDate,
  levelShortLabel,
  programLabel,
  type CompetitionLevel,
} from '@/features/session/labels';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme/tokens';

const NO_PROGRAM = 'none';

export default function NewSessionScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const theme = useTheme();

  const [type, setType] = useState<SessionType>('training');
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
  const [extraRounds, setExtraRounds] = useState('');

  const discipline = requireDiscipline(disciplineId);
  const programs = programsForDiscipline(disciplineId);
  const program = programs.find((p) => p.id === programId) ?? null;
  const groups = weaponGroupsForDiscipline(disciplineId);
  const classes = shooterClassesForDiscipline(disciplineId);
  const showDecimalToggle = decimalAllowed(discipline, program);

  const firearms = useMemo(() => (db ? listFirearms(db) : []), []);
  const ammoLots = useMemo(() => (db ? listAmmoLots(db) : []), []);

  const startedAt = useMemo(() => new Date().toISOString(), []);
  const defaultName =
    type === 'competition'
      ? defaultSessionName({
          kind: 'competition',
          levelLabel: levelShortLabel(t, level, isChampionship),
          programLabel: program ? programLabel(t, program.id) : null,
          weaponGroupCode: weaponGroupCode(weaponGroup),
        })
      : defaultSessionName({
          kind: 'training',
          disciplineLabel: disciplineLabel(t, disciplineId),
          dateLabel: formatLocalDate(startedAt, i18n.language),
        });
  const name = nameOverride ?? defaultName;

  function onSelectDiscipline(nextId: string) {
    setDisciplineId(nextId);
    setProgramId(NO_PROGRAM);
    setWeaponGroup(null);
    setDecimalScoring(false);
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
      decimalScoring: showDecimalToggle && decimalScoring,
    });

    // Unscored extra rounds go through the round-count path so the firearm
    // counter moves with them (spec A1 §A1.3 A-X1); never through createSession.
    const parsedExtraRounds = extraRounds.trim() === '' ? null : Number(extraRounds.trim());
    if (
      parsedExtraRounds !== null &&
      Number.isInteger(parsedExtraRounds) &&
      parsedExtraRounds >= 0
    ) {
      setSessionExtraRounds(db, session.id, parsedExtraRounds);
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
          <TextInput
            value={competitionName}
            onChangeText={setCompetitionName}
            placeholder={t('session.competitionNamePlaceholder')}
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            testID="competition-name"
          />
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

      <Card>
        <ThemedText type="smallBold">{t('session.extraRounds')}</ThemedText>
        <TextInput
          value={extraRounds}
          onChangeText={setExtraRounds}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder="0"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, borderColor: theme.border }]}
          testID="extra-rounds"
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t('session.extraRoundsHint')}
        </ThemedText>
      </Card>

      <Card>
        <ThemedText type="smallBold">{t('session.name')}</ThemedText>
        <TextInput
          value={name}
          onChangeText={setNameOverride}
          style={[styles.input, { color: theme.text, borderColor: theme.border }]}
          testID="session-name"
        />
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
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
});
