// The selected mark's actions. They take the place of the marking screen's
// bottom bar while a mark is selected, where the thumb already is.
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import type { Mark, MarkScore } from '@/features/photo-scoring/marks';
import { Radius, Spacing } from '@/theme/tokens';

export interface MarkActionBarProps extends ViewProps {
  mark: Mark;
  score: MarkScore;
  onDelete: () => void;
  onToggleInnerTen: () => void;
  onCallRing: (ringLabel: string) => void;
  onDeselect: () => void;
}

function BarButton({
  label,
  onPress,
  active = false,
  tone = 'neutral',
  testID,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  tone?: 'neutral' | 'danger';
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        { borderColor: tone === 'danger' ? theme.danger : theme.border },
        active && { backgroundColor: theme.primary, borderColor: theme.primary },
        pressed && !active && { backgroundColor: theme.backgroundSelected },
      ]}
    >
      <ThemedText
        type="smallBold"
        themeColor={active ? 'onPrimary' : tone === 'danger' ? 'danger' : 'text'}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function MarkActionBar({
  mark,
  score,
  onDelete,
  onToggleInnerTen,
  onCallRing,
  onDeselect,
  style,
  ...rest
}: MarkActionBarProps) {
  const { t } = useTranslation();
  return (
    <ThemedView type="backgroundElement" style={[styles.bar, style]} {...rest}>
      {score.candidates.length > 1 && (
        <View style={styles.row} testID="mark-edge-call">
          <ThemedText type="small" themeColor="textSecondary" style={styles.edgeLabel}>
            {t('photoScoring.edgeCall')}
          </ThemedText>
          {score.candidates.map((candidate) => (
            <BarButton
              key={candidate.label}
              label={candidate.label}
              active={score.effective.label === candidate.label}
              onPress={() => onCallRing(candidate.label)}
              testID={`edge-call-${candidate.label}`}
            />
          ))}
        </View>
      )}
      <View style={styles.row}>
        <BarButton
          label={t('photoScoring.delete')}
          tone="danger"
          onPress={onDelete}
          testID="mark-delete"
        />
        <BarButton
          label={t('photoScoring.markInnerTen')}
          active={mark.isInnerTen}
          onPress={onToggleInnerTen}
          testID="mark-inner-ten"
        />
        <View style={styles.spacer} />
        <BarButton label={t('photoScoring.deselect')} onPress={onDeselect} testID="mark-deselect" />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderRadius: Radius.medium,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  edgeLabel: {
    marginRight: Spacing.one,
  },
  spacer: {
    flex: 1,
  },
  button: {
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
