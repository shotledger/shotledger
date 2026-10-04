// "How do you want to add this series?" — manual entry or photo scoring,
// asked at the moment of adding rather than buried in Tools (#138).
//
// Not an ActionSheet: the choice carries a "use for the rest of this session"
// switch, and a plain action list has nowhere to put it. Someone scanning
// targets all evening should be asked once.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

/** The stored per-session preference. `ask` shows this sheet every time. */
export type SeriesEntryMode = 'ask' | 'manual' | 'photo';

/** What the sheet returns — never `ask`, since the user has just chosen. */
export type SeriesEntryChoice = Exclude<SeriesEntryMode, 'ask'>;

export interface SeriesEntryChoiceSheetProps {
  visible: boolean;
  /** Defaults to "Add Series". */
  title?: string;
  onClose: () => void;
  /** `remember` is the switch: persist this choice for the rest of the session. */
  onChoose: (choice: SeriesEntryChoice, remember: boolean) => void;
}

export function SeriesEntryChoiceSheet({
  visible,
  title,
  onClose,
  onChoose,
}: SeriesEntryChoiceSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [remember, setRemember] = useState(false);

  function choose(choice: SeriesEntryChoice) {
    onClose();
    onChoose(choice, remember);
    setRemember(false);
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title ?? t('session.entryChoiceTitle')}
      testID="series-entry-choice"
    >
      {(['manual', 'photo'] as const).map((choice) => (
        <Pressable
          key={choice}
          accessibilityRole="button"
          onPress={() => choose(choice)}
          testID={`series-entry-${choice}`}
          style={({ pressed }) => [
            styles.option,
            { borderColor: theme.border },
            pressed && { backgroundColor: theme.backgroundSelected },
          ]}
        >
          <ThemedText type="smallBold">{t(`session.entryChoice.${choice}` as const)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t(`session.entryChoiceHint.${choice}` as const)}
          </ThemedText>
        </Pressable>
      ))}

      <View style={styles.rememberRow}>
        <ThemedText type="small" style={styles.rememberLabel}>
          {t('session.entryChoiceRemember')}
        </ThemedText>
        <Switch value={remember} onValueChange={setRemember} testID="series-entry-remember" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  option: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    padding: Spacing.three,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    gap: Spacing.half,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    // Material's minimum touch target for the switch row.
    minHeight: 48,
  },
  rememberLabel: {
    flexShrink: 1,
  },
});
