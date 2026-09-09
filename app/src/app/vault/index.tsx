// Vault list — reachable from Settings, not a tab (plan.md v2). Gated by a
// biometric/passcode prompt (useVaultGate) before anything is decrypted or
// even listed, since the index itself is an encrypted file.
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { FAB } from '@/components/fab';
import { ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useVaultGate } from '@/features/vault/use-vault-gate';
import { useVaultList } from '@/features/vault/use-vault-list';

const KIND_ICON: Record<string, string> = {
  license: '📄',
  membershipCard: '🪪',
  doorCode: '🔑',
  other: '📁',
};

export default function VaultScreen() {
  const { t } = useTranslation();

  if (Platform.OS === 'web') {
    return (
      <Screen>
        <ThemedText type="default" themeColor="textSecondary">
          {t('vault.webUnavailable')}
        </ThemedText>
      </Screen>
    );
  }

  return <VaultScreenNative />;
}

function VaultScreenNative() {
  const { t } = useTranslation();
  const router = useRouter();
  const { state, unlock } = useVaultGate(t('vault.gateTitle'));
  const unlocked = state.status === 'unlocked';
  const { documents, loaded } = useVaultList(unlocked);

  if (state.status === 'locked' || state.status === 'checking' || state.status === 'denied') {
    return (
      <Screen>
        <ThemedText type="title">{t('vault.gateTitle')}</ThemedText>
        <Card>
          <ThemedText type="default" themeColor="textSecondary">
            {t('vault.gateBody')}
          </ThemedText>
          {state.status === 'denied' ? (
            <ThemedText type="small" themeColor="danger">
              {t('vault.gateDenied')}
            </ThemedText>
          ) : null}
          <PrimaryButton
            label={t('vault.gateUnlockCta')}
            onPress={unlock}
            disabled={state.status === 'checking'}
            testID="vault-unlock"
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      fab={
        <FAB
          label={t('vault.addCta')}
          onPress={() => router.push('/vault/add')}
          testID="vault-add-fab"
        />
      }
    >
      <ThemedText type="title">{t('vault.title')}</ThemedText>

      {state.deviceUnsecured ? (
        <Card>
          <ThemedText type="small" themeColor="danger">
            {t('vault.gateDeviceUnsecuredWarning')}
          </ThemedText>
        </Card>
      ) : null}

      {loaded && documents.length === 0 ? (
        <EmptyState title={t('vault.emptyTitle')} body={t('vault.emptyBody')} />
      ) : (
        <Card>
          {documents.map((doc) => (
            <ListRow
              key={doc.id}
              title={`${KIND_ICON[doc.kind] ?? '📁'} ${doc.label}`}
              subtitle={t('vault.detailAddedOn', {
                date: new Date(doc.addedAt).toLocaleDateString(),
              })}
              onPress={() => router.push(`/vault/${doc.id}`)}
              testID={`vault-document-${doc.id}`}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
