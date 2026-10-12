// Account & sync (docs/specs/sync-app-spec.md §1, §7). Everything here is
// optional: the app is fully usable with no account, and this screen is the
// only place that changes.
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Alert } from 'react-native';

import { ScreenTitle } from '@/components/screen-title';
import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { apiBaseUrl } from '@/constants/backend';
import { useAccount } from '@/features/account/use-account';
import { useSync } from '@/features/sync/use-sync';
import { useDateFormat } from '@/features/dates/use-date-format';

type Mode = 'signIn' | 'signUp';

export default function AccountScreen() {
  const { t } = useTranslation();
  const dates = useDateFormat();
  const account = useAccount();
  const { status, syncNow } = useSync(account.signedIn);

  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function onSubmit() {
    if (mode === 'signUp') void account.signUp(email, password);
    else void account.signIn(email, password);
  }

  function onDelete() {
    Alert.alert(t('account.deleteTitle'), t('account.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('account.deleteConfirm'),
        style: 'destructive',
        onPress: () => {
          void account.deleteAccount().then((ok) => {
            if (ok) Alert.alert(t('account.deletedTitle'), t('account.deletedBody'));
          });
        },
      },
    ]);
  }

  const lastSynced =
    status.lastSyncedAt === null ? t('account.neverSynced') : dates.dateTime(status.lastSyncedAt);

  return (
    <Screen>
      <ScreenTitle>{t('account.title')}</ScreenTitle>

      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          {t('account.intro')}
        </ThemedText>
      </Card>

      {account.signedIn ? (
        <>
          <Card>
            <ThemedText type="smallBold">{t('account.signedInAs')}</ThemedText>
            <ThemedText type="default" testID="account-email">
              {account.email ?? '—'}
            </ThemedText>
            <PrimaryButton
              label={t('account.signOut')}
              onPress={() => void account.signOut()}
              testID="account-sign-out"
            />
          </Card>

          <Card>
            <ThemedText type="smallBold">{t('account.syncTitle')}</ThemedText>
            <ThemedText type="default" testID="sync-status">
              {t(`account.syncState.${status.state}`)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" testID="sync-last-synced">
              {t('account.lastSynced', { when: lastSynced })}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" testID="sync-pending">
              {t('account.pendingChanges', { count: status.pendingCount })}
            </ThemedText>
            {status.errorKey && (
              <ThemedText type="small" themeColor="textSecondary" testID="sync-error">
                {t(`account.syncError.${status.errorKey}`)}
              </ThemedText>
            )}
            <PrimaryButton
              label={t('account.syncNow')}
              onPress={syncNow}
              testID="account-sync-now"
            />
          </Card>

          <Card>
            <ListRow
              title={t('account.deleteTitle')}
              subtitle={t('account.deleteSubtitle')}
              onPress={onDelete}
              testID="account-delete"
            />
          </Card>
        </>
      ) : (
        <Card>
          <SegmentedControl
            options={[
              { value: 'signIn' as Mode, label: t('account.signIn') },
              { value: 'signUp' as Mode, label: t('account.signUp') },
            ]}
            value={mode}
            onChange={setMode}
            testID="account-mode"
          />
          <TextField
            value={email}
            onChangeText={setEmail}
            placeholder={t('account.emailPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            testID="account-email-input"
          />
          <TextField
            value={password}
            onChangeText={setPassword}
            placeholder={t('account.passwordPlaceholder')}
            secureTextEntry
            autoCapitalize="none"
            testID="account-password-input"
          />
          <PrimaryButton
            label={mode === 'signUp' ? t('account.signUp') : t('account.signIn')}
            onPress={onSubmit}
            disabled={account.loading}
            testID="account-submit"
          />
          {account.error && (
            <ThemedText type="small" themeColor="textSecondary" testID="account-error">
              {t(`account.error.${account.error}`)}
            </ThemedText>
          )}
        </Card>
      )}

      <Card>
        <ThemedText type="small" themeColor="textSecondary" testID="account-server">
          {t('account.server', { url: apiBaseUrl() })}
        </ThemedText>
      </Card>
    </Screen>
  );
}
