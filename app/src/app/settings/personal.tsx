// Settings → Personal. Birth year, your class, women's classes, and the
// märke table those three feed.
//
// Its own page because no setting is set directly under Settings any more
// (maintainer, #138: "birthday, class etc should be under a subsettings page
// (Personal or similar)"). The märke table stays on the same page as the
// birth year it reads, which is the earlier request it has to honour.
import {
  allMarkeThresholds,
  ageReduction,
  type MarkeGroup,
  type MarkeValor,
} from '@shotledger/shared';
import type { SkillClass } from '@shotledger/shared/src/disciplines/eligibility';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/card';
import { InfoButton } from '@/components/info-button';
import { ListRow } from '@/components/list-row';
import { OptionPicker } from '@/components/option-picker';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { SearchablePicker, type SearchablePickerOption } from '@/components/searchable-picker';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { getSetting, setSetting, SETTINGS_KEYS } from '@/db/queries/settings';
import { Spacing } from '@/theme/tokens';

/** 1, 2, 3 — the 1u/1b/1s variants are deliberately not offered (SHB F.2.5). */
const SKILL_CLASS_OPTIONS: readonly SkillClass[] = ['1', '2', '3'];

export default function PersonalSettingsScreen() {
  const { t } = useTranslation();

  const [skillClass, setSkillClass] = useState<SkillClass | null>(() =>
    db ? getSetting<SkillClass | null>(db, SETTINGS_KEYS.skillClass, null) : null,
  );
  const [womensClasses, setWomensClasses] = useState<boolean>(() =>
    db ? getSetting<boolean>(db, SETTINGS_KEYS.competesInWomensClasses, false) : false,
  );
  const [birthYear, setBirthYear] = useState<number | null>(() =>
    db ? getSetting<number | null>(db, SETTINGS_KEYS.birthYear, null) : null,
  );

  function onChangeSkillClass(next: SkillClass) {
    setSkillClass(next);
    if (db) setSetting<SkillClass>(db, SETTINGS_KEYS.skillClass, next);
  }

  function onChangeWomensClasses(next: boolean) {
    setWomensClasses(next);
    if (db) setSetting<boolean>(db, SETTINGS_KEYS.competesInWomensClasses, next);
  }

  function applyBirthYear(year: number) {
    setBirthYear(year);
    if (db) setSetting<number | null>(db, SETTINGS_KEYS.birthYear, year);
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

  // Newest first, spanning ages 10-100 — plausible for a shooting license.
  const currentYear = new Date().getFullYear();
  const birthYearOptions = useMemo<SearchablePickerOption<number>[]>(() => {
    const options: SearchablePickerOption<number>[] = [];
    for (let year = currentYear - 10; year >= currentYear - 100; year--) {
      options.push({ value: year, label: String(year), testID: `birth-year-option-${year}` });
    }
    return options;
  }, [currentYear]);

  const markeThresholds = useMemo(
    () => allMarkeThresholds({ birthYear, year: currentYear }),
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
  const markeGroups: MarkeGroup[] = ['A', 'B', 'C'];
  const markeValors: MarkeValor[] = ['brons', 'silver', 'guld'];

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
          testID="birth-year"
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.birthYearHelp')}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.birthYearRetroactive')}
        </ThemedText>

        {/* The two facts that cannot be derived. Everything else about which
            klasser the shooter may enter falls out of the birth year above —
            Jun, Vet Y and Vet Ä are all year-based in both federations. */}
        <OptionPicker
          label={t('settings.skillClass')}
          options={SKILL_CLASS_OPTIONS.map((value) => ({ value, label: value }))}
          value={skillClass}
          onChange={onChangeSkillClass}
        />
        <ListRow
          title={t('settings.womensClasses')}
          subtitle={t('settings.womensClassesHelp')}
          trailing={
            <Switch
              value={womensClasses}
              onValueChange={onChangeWomensClasses}
              testID="womens-classes"
            />
          }
        />

        <View style={styles.markeTable} testID="marke-requirement">
          <View style={styles.headerRow}>
            <ThemedText type="smallBold" style={styles.headerLabel}>
              {t('settings.markeTitle')}
            </ThemedText>
            <InfoButton
              title={t('settings.markeTitle')}
              body={t('settings.markeInfo')}
              testID="marke-info"
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
          {markeValors.map((valor) => (
            <View key={valor} style={styles.markeRow}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.markeCellLabel}>
                {t(`webshooter.medal.${valor}`)}
              </ThemedText>
              {markeGroups.map((group) => (
                <ThemedText key={group} type="default" style={styles.markeCell}>
                  {markeThresholds[group][valor]}
                </ThemedText>
              ))}
            </View>
          ))}
          <ThemedText type="small" themeColor="textSecondary">
            {birthYear === null
              ? t('settings.markeNoYearNote')
              : markeReductionSinceYear !== null
                ? t('settings.markeReductionNote', {
                    points: markeReduction,
                    sinceYear: markeReductionSinceYear,
                  })
                : t('settings.markeReductionNoneNote')}
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
  markeTable: {
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
