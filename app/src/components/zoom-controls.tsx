// The − / + / fit pill over a zoomable canvas: MarkCanvas and ZoomableView
// both use it, so every canvas zooms the same way (#608).
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/theme/tokens';

export interface ZoomControlsProps {
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFit: () => void;
  /** At fit already: the button stays, so the others never shift under the finger. */
  fitDisabled: boolean;
  testIDPrefix?: string;
}

export function ZoomControls({
  onZoomOut,
  onZoomIn,
  onFit,
  fitDisabled,
  testIDPrefix = 'canvas',
}: ZoomControlsProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.pill}>
      <ZoomButton
        label="−"
        accessibilityLabel={t('photoScoring.zoomOut')}
        onPress={onZoomOut}
        testID={`${testIDPrefix}-zoom-out`}
      />
      <View style={styles.divider} />
      <ZoomButton
        label="+"
        accessibilityLabel={t('photoScoring.zoomIn')}
        onPress={onZoomIn}
        testID={`${testIDPrefix}-zoom-in`}
      />
      <View style={styles.divider} />
      <ZoomButton
        label="⤢"
        accessibilityLabel={t('photoScoring.zoomFit')}
        onPress={onFit}
        disabled={fitDisabled}
        testID={`${testIDPrefix}-zoom-fit`}
      />
    </View>
  );
}

function ZoomButton({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
  testID,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      hitSlop={6}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <ThemedText type="smallBold" style={[styles.label, disabled && styles.labelDisabled]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.medium,
    backgroundColor: '#1c1c1e',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    overflow: 'hidden',
  },
  button: {
    width: 44,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    backgroundColor: '#3a3a3c',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  label: {
    color: '#ffffff',
    fontSize: 20,
    lineHeight: 24,
  },
  labelDisabled: {
    opacity: 0.35,
  },
});
