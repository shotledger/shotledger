// Plain-text location entry with suggestions. The text field is the feature;
// the suggestions only save typing, so nothing here can block input — offline,
// with the online lookup off, with an empty history, it is still a text box.
import { OSM_ATTRIBUTION } from '@shotledger/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useLocationSuggestions } from '@/features/location/use-location-suggestions';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

export interface LocationFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Whether the opt-in OpenStreetMap lookup may run (Settings, off by default). */
  onlineEnabled: boolean;
  language?: string;
}

export function LocationField({ value, onChange, onlineEnabled, language }: LocationFieldProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { recent, online } = useLocationSuggestions(value, onlineEnabled, language);

  function renderChips(values: string[], testIdPrefix: string) {
    return (
      <View style={styles.row}>
        {values.map((suggestion) => (
          <Pressable
            key={suggestion}
            accessibilityRole="button"
            testID={`${testIdPrefix}-${suggestion}`}
            onPress={() => onChange(suggestion)}
            style={[
              styles.pill,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
          >
            <ThemedText type="small" themeColor="textSecondary">
              {suggestion}
            </ThemedText>
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold">{t('session.location')}</ThemedText>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={t('session.locationPlaceholder')}
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="words"
        autoCorrect={false}
        style={[styles.input, { color: theme.text, borderColor: theme.border }]}
        testID="session-location"
      />

      {recent.length > 0 && (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {t('session.locationRecent')}
          </ThemedText>
          {renderChips(recent, 'location-recent')}
        </>
      )}

      {online.length > 0 && (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {t('session.locationOnline')}
          </ThemedText>
          {renderChips(online, 'location-online')}
          <ThemedText type="small" themeColor="textSecondary">
            {OSM_ATTRIBUTION}
          </ThemedText>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pill: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
});
