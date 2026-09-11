// Connecting to an external site. Lives in Settings (ADR 0010): connecting
// is a preference-shaped, once-in-a-while act, and leaving it in Tools made
// Tools a login screen.
//
// The form renders from the provider's declared `authMethods`, so a site
// that only takes a pasted token shows no password fields rather than
// fields that cannot work.
import type { ProviderDescriptor } from '@shotledger/shared/src/integrations/providers/registry';
import { WEBSHOOTER_PROVIDER_ID } from '@shotledger/shared/src/integrations/providers/registry';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, StyleSheet } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { CalendarPicker } from '@/features/webshooter/calendar-picker';
import { useWebshooterConnection } from '@/features/webshooter/use-webshooter-connection';
import { Spacing } from '@/theme/tokens';

export interface ProviderConnectionProps {
  provider: ProviderDescriptor;
}

export function ProviderConnection({ provider }: ProviderConnectionProps) {
  const { t } = useTranslation();
  // One provider today. When the second lands this becomes a lookup, not a
  // longer branch — the hook shape is the seam (ADR 0010).
  const connection = useWebshooterConnection();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');

  if (provider.id !== WEBSHOOTER_PROVIDER_ID) return null;

  if (connection.connected) {
    const identityMissing = connection.cardNumber === null;
    return (
      <View style={styles.section}>
        <ThemedText type="default" testID={`provider-${provider.id}-identity`}>
          {identityMissing
            ? t('webshooter.connectedNoCardNumber')
            : t('webshooter.connectedAs', { cardNumber: connection.cardNumber })}
        </ThemedText>
        {/* Signed in but with no card number is a real state, not a glitch:
            the token stores before identity is resolved, so a failure there
            leaves an account that works for nothing. Retrying needs no
            password — the token is already good. */}
        {identityMissing && (
          <PrimaryButton
            label={t('webshooter.retryIdentity')}
            onPress={() => void connection.retryIdentity()}
            testID={`provider-${provider.id}-retry-identity`}
          />
        )}
        {connection.error !== null && (
          <>
            <ThemedText type="small" themeColor="danger" testID="webshooter-login-error">
              {t(`webshooter.${connection.error}` as const)}
            </ThemedText>
            {connection.errorDetail !== null && (
              <ThemedText
                type="small"
                themeColor="textSecondary"
                testID="webshooter-login-error-detail"
              >
                {connection.errorDetail}
              </ThemedText>
            )}
          </>
        )}
        {/* Only offered once connected: choosing a calendar for starts you
            cannot fetch yet would be a setting about nothing. */}
        <CalendarPicker />
        <PrimaryButton
          label={t('webshooter.disconnect')}
          onPress={() => void connection.disconnect()}
          testID={`provider-${provider.id}-disconnect`}
        />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      {provider.authMethods.includes('password') && (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {t('webshooter.connectHelp')}
          </ThemedText>
          <TextField
            value={username}
            onChangeText={setUsername}
            placeholder={t('webshooter.usernamePlaceholder')}
            autoCapitalize="none"
            testID="webshooter-username"
          />
          <TextField
            value={password}
            onChangeText={setPassword}
            placeholder={t('webshooter.passwordPlaceholder')}
            secureTextEntry
            testID="webshooter-password"
          />
          <PrimaryButton
            label={t('webshooter.connectWithPassword')}
            onPress={() => void connection.connectWithPassword(username, password)}
            testID="webshooter-connect-password"
          />
        </>
      )}

      {provider.authMethods.includes('token') && (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {t('webshooter.tokenFallbackHelp')}
          </ThemedText>
          <TextField
            value={token}
            onChangeText={setToken}
            placeholder={t('webshooter.tokenPlaceholder')}
            autoCapitalize="none"
            testID="webshooter-token"
          />
          <PrimaryButton
            label={t('webshooter.connectWithToken')}
            onPress={() => void connection.connectWithToken(token)}
            testID="webshooter-connect-token"
          />
        </>
      )}

      {connection.error !== null && (
        <>
          <ThemedText type="small" themeColor="danger" testID="webshooter-login-error">
            {t(`webshooter.${connection.error}` as const)}
          </ThemedText>
          {/* The reason, verbatim. Nobody reads it until the day someone
              has to, and then it is the whole report. */}
          {connection.errorDetail !== null && (
            <ThemedText
              type="small"
              themeColor="textSecondary"
              testID="webshooter-login-error-detail"
            >
              {connection.errorDetail}
            </ThemedText>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
});
