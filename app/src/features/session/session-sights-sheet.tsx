// Sight settings, reachable and *adjustable* from the session (#138).
//
// The session menu could already switch which setting was active, but not
// change its clicks — for that you left the session for the firearm screen.
// That is backwards: you adjust sights while shooting, which is exactly when
// you are looking at the session (maintainer, 2026-09-11).
//
// Steppers, not the slider being trialled for the firearm screen: a click is
// an exact number you dial and dial back, and here you are doing it between
// series with cold hands.
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { resolveActiveSightSetting } from '@shotledger/shared';

import { BottomSheet } from '@/components/bottom-sheet';
import { CheckIcon } from '@/components/icons';
import { Stepper } from '@/components/stepper';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import {
  listSightSettings,
  setActiveSightSetting,
  updateSightSetting,
} from '@/db/queries/sight-settings';
import { SIGHT_CLICK_MAX, SIGHT_CLICK_MIN } from '@/features/firearms/sight-clicks';
import { sightClicksDirectionText, sightSettingLabel } from '@/features/firearms/sight-turns-text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme/tokens';

export type SightSettingRow = ReturnType<typeof listSightSettings>[number];

export interface SessionSightsSheetProps {
  visible: boolean;
  onClose: () => void;
  firearmId: string | null;
  settings: readonly SightSettingRow[];
  /** Re-reads the rows after a write, so the sheet shows what was stored. */
  onChanged: () => void;
}

export function SessionSightsSheet({
  visible,
  onClose,
  firearmId,
  settings,
  onChanged,
}: SessionSightsSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const active = resolveActiveSightSetting(settings);

  function onSelect(id: string) {
    if (!firearmId) return;
    setActiveSightSetting(db, firearmId, id);
    onChanged();
  }

  // Writes straight through on every press. A Save button would be one more
  // thing to forget between series, and a click is a small, reversible edit.
  function onAdjust(axis: 'elevationClicks' | 'windageClicks', value: number | null) {
    if (!active) return;
    updateSightSetting(db, active.id, { [axis]: value });
    onChanged();
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('session.sightsTitle')}
      testID="session-sights"
    >
      {settings.map((setting) => (
        <Pressable
          key={setting.id}
          accessibilityRole="button"
          onPress={() => onSelect(setting.id)}
          testID={`session-sight-${setting.id}`}
          style={({ pressed }) => [
            styles.row,
            pressed && { backgroundColor: theme.backgroundSelected },
          ]}
        >
          <ThemedText type="default" style={styles.rowLabel}>
            {sightSettingLabel(t, active, setting)}
          </ThemedText>
          {setting.id === active?.id && <CheckIcon color={theme.primary} />}
        </Pressable>
      ))}

      {active && (
        <View style={styles.adjust} testID="session-sight-adjust">
          <ThemedText type="smallBold">{t('firearms.sightElevation')}</ThemedText>
          <Stepper
            value={active.elevationClicks ?? null}
            onChange={(clicks) => onAdjust('elevationClicks', clicks)}
            min={SIGHT_CLICK_MIN}
            max={SIGHT_CLICK_MAX}
            decrementLabel={t('firearms.sightElevationDecrease')}
            incrementLabel={t('firearms.sightElevationIncrease')}
            clearLabel={t('firearms.sightClicksClear')}
            format={(clicks) =>
              clicks === null
                ? t('firearms.sightClicksNotRecorded')
                : sightClicksDirectionText(t, clicks, 'elevation')
            }
            testID="session-sight-elevation"
          />
          <ThemedText type="smallBold">{t('firearms.sightWindage')}</ThemedText>
          <Stepper
            value={active.windageClicks ?? null}
            onChange={(clicks) => onAdjust('windageClicks', clicks)}
            min={SIGHT_CLICK_MIN}
            max={SIGHT_CLICK_MAX}
            decrementLabel={t('firearms.sightWindageDecrease')}
            incrementLabel={t('firearms.sightWindageIncrease')}
            clearLabel={t('firearms.sightClicksClear')}
            format={(clicks) =>
              clicks === null
                ? t('firearms.sightClicksNotRecorded')
                : sightClicksDirectionText(t, clicks, 'windage')
            }
            testID="session-sight-windage"
          />
          <ThemedText type="small" themeColor="textSecondary">
            {t('session.sightsAdjustHint')}
          </ThemedText>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    // Material's 48dp minimum touch target.
    minHeight: 48,
  },
  rowLabel: {
    flexShrink: 1,
  },
  adjust: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.one,
  },
});
