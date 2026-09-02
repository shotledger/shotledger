// Tools tab — the utilities that are not app settings: timers, the
// encrypted vault, and WebShooter. Settings had accumulated ten unrelated
// concerns and WebShooter is a feature, not a preference (plan.md
// 2026-09-03). This screen owns navigation entry points plus the WebShooter
// connection controls that used to live in Settings; the destination
// screens are unchanged.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, TextInput, View } from 'react-native';

import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';

import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/queries/settings';
import { useWebShooterConnection } from '@/features/webshooter/use-webshooter-connection';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme/tokens';

export default function ToolsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useTheme();
  const webshooter = useWebShooterConnection();
  const [wsUsername, setWsUsername] = useState('');
  const [wsPassword, setWsPassword] = useState('');
  const [wsToken, setWsToken] = useState('');
  const [devMockEnabled, setDevMockEnabled] = useState(() =>
    db ? getSetting<boolean>(db, 'webshooterDevMock', false) : false,
  );

  function onToggleDevMock(next: boolean) {
    setDevMockEnabled(next);
    if (db) setSetting<boolean>(db, 'webshooterDevMock', next);
  }

  return (
    <Screen>
      <ThemedText type="title">{t('tools.title')}</ThemedText>

      <Card>
        <ThemedText type="smallBold">{t('tools.timersSectionTitle')}</ThemedText>
        <ListRow
          title={t('timer.title')}
          subtitle={t('tools.timerSubtitle')}
          onPress={() => router.push('/timer')}
          testID="tools-open-timer"
        />
      </Card>

      <Card>
        {/* `vault.settingsRow*` keys keep their names so the vault rename
            landing in parallel does not conflict with this move. */}
        <ListRow
          title={t('vault.settingsRowTitle')}
          subtitle={t('vault.settingsRowSubtitle')}
          onPress={() => router.push('/vault')}
          testID="tools-open-vault"
        />
      </Card>

      <Card>
        <ThemedText type="smallBold">{t('webshooter.sectionTitle')}</ThemedText>
        {webshooter.connected ? (
          <>
            <ThemedText type="default" testID="webshooter-identity">
              {t('webshooter.connectedAs', { cardNumber: webshooter.cardNumber ?? '—' })}
            </ThemedText>
            <PrimaryButton
              label={t('webshooter.disconnect')}
              onPress={() => void webshooter.disconnect()}
              testID="webshooter-disconnect"
            />
          </>
        ) : (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              {t('webshooter.connectHelp')}
            </ThemedText>
            <TextInput
              value={wsUsername}
              onChangeText={setWsUsername}
              placeholder={t('webshooter.usernamePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              testID="webshooter-username"
            />
            <TextInput
              value={wsPassword}
              onChangeText={setWsPassword}
              placeholder={t('webshooter.passwordPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              testID="webshooter-password"
            />
            <PrimaryButton
              label={t('webshooter.connectWithPassword')}
              onPress={() => void webshooter.connectWithPassword(wsUsername, wsPassword)}
              testID="webshooter-connect-password"
            />
            {webshooter.error === 'spaLoginNotVerified' && (
              <ThemedText type="small" themeColor="textSecondary">
                {t('webshooter.spaLoginNotVerified')}
              </ThemedText>
            )}
            <ThemedText type="small" themeColor="textSecondary">
              {t('webshooter.tokenFallbackHelp')}
            </ThemedText>
            <TextInput
              value={wsToken}
              onChangeText={setWsToken}
              placeholder={t('webshooter.tokenPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              testID="webshooter-token"
            />
            <PrimaryButton
              label={t('webshooter.connectWithToken')}
              onPress={() => void webshooter.connectWithToken(wsToken)}
              testID="webshooter-connect-token"
            />
            {webshooter.error === 'connectFailed' && (
              <ThemedText type="small" themeColor="textSecondary">
                {t('webshooter.connectFailed')}
              </ThemedText>
            )}
          </>
        )}
        <ListRow
          title={t('webshooter.importTitle')}
          subtitle={t('webshooter.importSubtitle')}
          onPress={() => router.push('/webshooter/import')}
          testID="webshooter-open-import"
        />
        <ListRow
          title={t('webshooter.startsTitle')}
          subtitle={t('webshooter.startsSubtitle')}
          onPress={() => router.push('/webshooter/starts')}
          testID="webshooter-open-starts"
        />
      </Card>

      {__DEV__ && (
        <View style={styles.devSection}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('settings.devSection')}
          </ThemedText>
          <Card>
            <ListRow
              title={t('webshooter.devMockTitle')}
              subtitle={t('webshooter.devMockSubtitle')}
              trailing={
                <Switch
                  value={devMockEnabled}
                  onValueChange={onToggleDevMock}
                  testID="webshooter-dev-mock-toggle"
                />
              }
            />
          </Card>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  devSection: {
    gap: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
});
