// Settings → Personal. Birth year, your class, women's classes, and the
// märke table those three feed.
//
// Its own page because no setting is set directly under Settings any more
// (maintainer, #138: "birthday, class etc should be under a subsettings page
// (Personal or similar)"). The märke table stays on the same page as the
// birth year it reads, which is the earlier request it has to honor.
import {
  allBadgeThresholds,
  ageReduction,
  type BadgeGroup,
  type BadgeGrade,
} from '@shotledger/shared';
import {
  birthYearOptions as birthYearRange,
  SKILL_CLASSES,
  type SkillClass,
} from '@shotledger/shared/src/disciplines/eligibility';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { InfoButton } from '@/components/info-button';
import { ListRow } from '@/components/list-row';
import { OptionPicker } from '@/components/option-picker';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { SearchablePicker, type SearchablePickerOption } from '@/components/searchable-picker';
import { ThemedText } from '@/components/themed-text';
import { Toggle } from '@/components/toggle';
import { db } from '@/db/client';
import { getSetting, setSetting, SETTINGS_KEYS } from '@/db/queries/settings';
import { Spacing } from '@/theme/tokens';

export default function PersonalSettingsScreen() {
  const { t } = useTranslation();

  const [skillClass, setSkillClass] = useState<SkillClass | null>(() =>
    getSetting<SkillClass | null>(db, SETTINGS_KEYS.skillClass, null),
  );
  const [womensClasses, setWomensClasses] = useState<boolean>(() =>
    getSetting<boolean>(db, SETTINGS_KEYS.competesInWomensClasses, false),
  );
  const [birthYear, setBirthYear] = useState<number | null>(() =>
    getSetting<number | null>(db, SETTINGS_KEYS.birthYear, null),
  );

  function onChangeSkillClass(next: SkillClass) {
    setSkillClass(next);
    setSetting<SkillClass>(db, SETTINGS_KEYS.skillClass, next);
  }

  function onChangeWomensClasses(next: boolean) {
    setWomensClasses(next);
    setSetting<boolean>(db, SETTINGS_KEYS.competesInWomensClasses, next);
  }

  function applyBirthYear(year: number) {
    setBirthYear(year);
    setSetting<number | null>(db, SETTINGS_KEYS.birthYear, year);
  }

  function onChangeBirthYear(year: number) {
    // Changing an existing year is allowed but confirmed: the veteran class
    // and the age-reduced marke thresholds are derived, so they recompute for
    // sessions already logged, not only for new ones.
    if (birthYear === null || year === birthYear) {
      applyBirthYear(year);
      return;
    }
    Alert.alert(
      t('settings.birthYearChangeTitle'),
      t('settings.birthYearChangeMessage', { from: birthYear, to: year }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.birthYearChangeConfirm'), onPress: () => applyBirthYear(year) },
      ],
    );
  }

  const currentYear = new Date().getFullYear();
  const birthYearOptions = useMemo<SearchablePickerOption<number>[]>(
    () =>
      birthYearRange(currentYear).map((year) => ({
        value: year,
        label: String(year),
        testID: `birth-year-option-${year}`,
      })),
    [currentYear],
  );

  const markeThresholds = useMemo(
    () => allBadgeThresholds({ birthYear, year: currentYear }),
    [birthYear, currentYear],
  );
  const markeReduction = useMemo(
    () => ageReduction(birthYear, currentYear),
    [birthYear, currentYear],
  );
  // −1 p/series from the year after turning 55, −2 from the year after
  // turning 65 (SHB Bilaga 1 mom 5.1.1.1) — so the reduction that applies
  // today started the year the shooter turned 56 or 66, respectively.
  const markeReductionSinceYear =
    birthYear === null || markeReduction === 0
      ? null
      : birthYear + (markeReduction === 2 ? 66 : 56);
  const markeGroups: BadgeGroup[] = ['A', 'B', 'C'];
  const markeValors: BadgeGrade[] = ['brons', 'silver', 'guld'];

  return (
    <Screen>
      <Stack.Screen options={{ title: t('settings.personal') }} />
      <ScreenTitle>{t('settings.personal')}</ScreenTitle>

      <Card>
        <SearchablePicker
          label={t('settings.birthYear')}
          options={birthYearOptions}
          value={birthYear}
          onChange={onChangeBirthYear}
          placeholder={t('settings.birthYearPlaceholder')}
          searchPlaceholder={t('settings.birthYearSearchPlaceholder')}
          emptyLabel={t('settings.birthYearNoMatch')}
          keyboardType="number-pad"
          labelTrailing={
            <InfoButton
              title={t('settings.birthYear')}
              body={t('settings.birthYearHelp')}
              testID="birth-year-info"
            />
          }
          testID="birth-year"
        />
        {/* Retroactive, so it stays beside the field rather than behind the [i]. */}
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.birthYearRetroactive')}
        </ThemedText>

        {/* The two facts that cannot be derived. Everything else about which
            klasser the shooter may enter falls out of the birth year above —
            Jun, Vet Y and Vet Ä are all year-based in both federations. */}
        <OptionPicker
          label={t('settings.skillClass')}
          options={SKILL_CLASSES.map((value) => ({ value, label: value }))}
          value={skillClass}
          onChange={onChangeSkillClass}
        />
        <ListRow
          title={t('settings.womensClasses')}
          subtitle={t('settings.womensClassesHelp')}
          trailing={
            <Toggle
              value={womensClasses}
              onValueChange={onChangeWomensClasses}
              testID="womens-classes"
            />
          }
        />

        <View style={styles.badgeTable} testID="badge-requirement">
          <View style={styles.headerRow}>
            <ThemedText type="smallBold" style={styles.headerLabel}>
              {t('settings.badgeTitle')}
            </ThemedText>
            <InfoButton
              title={t('settings.badgeTitle')}
              body={t('settings.badgeInfo')}
              testID="badge-info"
            />
          </View>
          <View style={styles.markeRow}>
            <View style={styles.markeCellLabel} />
            {markeGroups.map((group) => (
              <ThemedText key={group} type="smallBold" style={styles.markeCell}>
                {group}
              </ThemedText>
            ))}
          </View>
          {markeValors.map((grade) => (
            <View key={grade} style={styles.markeRow}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.markeCellLabel}>
                {t(`webshooter.medal.${grade}`)}
              </ThemedText>
              {markeGroups.map((group) => (
                <ThemedText key={group} type="default" style={styles.markeCell}>
                  {markeThresholds[group][grade]}
                </ThemedText>
              ))}
            </View>
          ))}
          <ThemedText type="small" themeColor="textSecondary">
            {birthYear === null
              ? t('settings.badgeNoYearNote')
              : markeReductionSinceYear !== null
                ? t('settings.badgeReductionNote', {
                    points: markeReduction,
                    sinceYear: markeReductionSinceYear,
                  })
                : t('settings.badgeReductionNoneNote')}
          </ThemedText>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  headerLabel: {
    flexShrink: 1,
  },
  badgeTable: {
    gap: Spacing.one,
  },
  markeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  markeCellLabel: {
    flex: 2,
  },
  markeCell: {
    flex: 1,
    textAlign: 'center',
  },
});
