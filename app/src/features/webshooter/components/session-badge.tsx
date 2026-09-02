// Session detail: official placement/medal + a WebShooter badge when
// external_ref is present (integration spec §A.5). Deliberately a single,
// self-contained component — see app/src/app/session/[id]/index.tsx for
// the one-line insertion point, kept minimal to avoid colliding with the
// concurrent photo-scoring agent's edits to that same file.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

export interface WebShooterSessionBadgeProps {
  session: {
    externalSource: string | null;
    officialPlacement: number | null;
    officialStandardmedalj: 'none' | 'brons' | 'silver' | 'guld' | null;
  };
}

/**
 * `null` when the session has no external_source — callers render this
 * unconditionally and let it decide, so the insertion point in
 * session/[id]/index.tsx never needs an extra if-check of its own.
 */
export function WebShooterSessionBadge({ session }: WebShooterSessionBadgeProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  if (session.externalSource !== 'webshooter') return null;

  return (
    <View
      style={[styles.container, { backgroundColor: theme.backgroundElement }]}
      testID="webshooter-session-badge"
    >
      <ThemedText type="small" themeColor="primary">
        {t('webshooter.badge')}
      </ThemedText>
      {session.officialPlacement !== null && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('webshooter.officialPlacement', { placement: session.officialPlacement })}
        </ThemedText>
      )}
      {session.officialStandardmedalj && session.officialStandardmedalj !== 'none' && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('webshooter.officialMedal', {
            medal: t(`webshooter.medal.${session.officialStandardmedalj}`),
          })}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radius.medium,
  },
});
