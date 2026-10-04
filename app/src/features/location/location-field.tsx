// Plain-text location entry with suggestions. The text field is the feature;
// the suggestions only save typing, so nothing here can block input — offline,
// with the online lookup off, with an empty history, it is still a text box.
import { OSM_ATTRIBUTION, type RangeMatch, TEXT_LIMITS } from '@shotledger/shared';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useLocationSuggestions } from '@/features/location/use-location-suggestions';
import { useRangeMatch } from '@/features/location/use-range-match';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

/** Meters under a kilometer, kilometers above it — nobody reads "4812 m". */
function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

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
  const { state: rangeState, findRanges } = useRangeMatch();

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
      <TextField
        value={value}
        onChangeText={onChange}
        maxLength={TEXT_LIMITS.sessions.location}
        placeholder={t('session.locationPlaceholder')}
        autoCapitalize="words"
        autoCorrect={false}
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

      {onlineEnabled ? (
        <Pressable
          accessibilityRole="button"
          testID="location-use-my-location"
          disabled={rangeState.status === 'locating'}
          onPress={findRanges}
          style={[
            styles.pill,
            styles.locateButton,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}
        >
          {rangeState.status === 'locating' && <ActivityIndicator size="small" />}
          <ThemedText type="small">{t('session.locationUseMyLocation')}</ThemedText>
        </Pressable>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {t('session.locationRangesNeedOnline')}
        </ThemedText>
      )}

      {rangeState.status === 'matched' && (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {t('session.locationRangesNearby')}
          </ThemedText>
          <View style={styles.row}>
            {rangeState.matches.map((match: RangeMatch) => (
              <Pressable
                key={match.range.id}
                accessibilityRole="button"
                testID={`location-range-${match.range.id}`}
                onPress={() => onChange(match.label)}
                style={[
                  styles.pill,
                  {
                    backgroundColor: theme.backgroundElement,
                    // The one range we can say you are standing on is worth a
                    // different border, not a different position in the list.
                    borderColor: match.confidence === 'here' ? theme.primary : theme.border,
                  },
                ]}
              >
                <ThemedText type="small" themeColor="textSecondary">
                  {`${match.label} · ${formatDistance(match.distanceMeters)}`}
                </ThemedText>
              </Pressable>
            ))}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {OSM_ATTRIBUTION}
          </ThemedText>
        </>
      )}

      {rangeState.status === 'none' && (
        <ThemedText type="small" themeColor="textSecondary" testID="location-range-message">
          {t('session.locationRangeNone')}
        </ThemedText>
      )}
      {rangeState.status === 'denied' && (
        <ThemedText type="small" themeColor="textSecondary" testID="location-range-message">
          {t('session.locationRangeDenied')}
        </ThemedText>
      )}
      {rangeState.status === 'failed' && (
        <ThemedText type="small" themeColor="textSecondary" testID="location-range-message">
          {t('session.locationRangeFailed')}
        </ThemedText>
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
  locateButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pill: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
});
