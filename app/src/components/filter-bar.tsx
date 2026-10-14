// Filter Bar (#822, DESIGN.md "Filter Bar"): the row above a filtered list
// or chart. A Filters button opens a bottom sheet holding the controls; the
// active filters sit beside it as chips, each one tap to remove. Statistics,
// Records and the web share the shape. Presentational: the screen owns the
// filter state and passes the sheet's contents as children.
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from '@/components/bottom-sheet';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { MIN_TOUCH_TARGET, Radius, Spacing } from '@/theme/tokens';

export interface ActiveFilter {
  key: string;
  label: string;
}

export interface FilterBarProps {
  filters: readonly ActiveFilter[];
  onRemove: (key: string) => void;
  sheetOpen: boolean;
  onOpenSheet: () => void;
  onCloseSheet: () => void;
  /** Shown in the sheet only, when at least one filter is active. */
  onClearAll?: () => void;
  /** The sheet's controls: Segmented, Choice Chips and the like. */
  children: ReactNode;
  testID?: string;
}

/** "Filters", or "Filters (2)" while two are active. */
export function filterButtonLabel(t: TFunction, count: number): string {
  return count > 0 ? t('components.filtersActive', { count }) : t('components.filters');
}

export function FilterBar({
  filters,
  onRemove,
  sheetOpen,
  onOpenSheet,
  onCloseSheet,
  onClearAll,
  children,
  testID,
}: FilterBarProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <View testID={testID}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <Button
          variant="tonal"
          label={filterButtonLabel(t, filters.length)}
          onPress={onOpenSheet}
          testID={testID ? `${testID}-open` : undefined}
        />
        {filters.map((filter) => (
          <Pressable
            key={filter.key}
            accessibilityRole="button"
            accessibilityLabel={t('components.removeFilter', { label: filter.label })}
            onPress={() => onRemove(filter.key)}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: theme.selected, borderColor: theme.selectedOutline },
              pressed && { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <ThemedText type="small" numberOfLines={1}>
              {filter.label}
            </ThemedText>
            <ThemedText type="smallBold" themeColor="textSecondary" importantForAccessibility="no">
              ×
            </ThemedText>
          </Pressable>
        ))}
      </ScrollView>
      <BottomSheet
        visible={sheetOpen}
        onClose={onCloseSheet}
        title={t('components.filters')}
        testID={testID ? `${testID}-sheet` : undefined}
      >
        <View style={styles.sheet}>
          {children}
          <View style={styles.sheetActions}>
            {onClearAll && filters.length > 0 ? (
              <Button variant="text" label={t('components.clearFilters')} onPress={onClearAll} />
            ) : null}
            <Button
              variant="primary"
              label={t('common.close')}
              onPress={onCloseSheet}
              style={styles.done}
            />
          </View>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 2,
  },
  sheet: {
    gap: Spacing.three,
    padding: Spacing.three,
  },
  sheetActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  done: {
    flexGrow: 1,
  },
});
