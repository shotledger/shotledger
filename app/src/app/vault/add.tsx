import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput } from 'react-native';

import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { addPhotoDocument, addTextDocument } from '@/features/vault/vault-store';
import {
  pickVaultPhotoFromCamera,
  pickVaultPhotoFromLibrary,
} from '@/features/vault/pick-vault-photo';
import type { VaultDocumentKind } from '@/features/vault/types';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme/tokens';

type ContentType = 'photo' | 'text';

const KINDS: VaultDocumentKind[] = ['license', 'membershipCard', 'doorCode', 'other'];

export default function AddVaultDocumentScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();

  const [contentType, setContentType] = useState<ContentType>('photo');
  const [kind, setKind] = useState<VaultDocumentKind>('license');
  const [label, setLabel] = useState('');
  const [text, setText] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSave =
    label.trim().length > 0 &&
    !saving &&
    (contentType === 'text' ? text.trim().length > 0 : photoUri !== null);

  async function onPickFromLibrary() {
    const result = await pickVaultPhotoFromLibrary();
    if (result === 'denied') return setPermissionDenied(true);
    if (result) {
      setPermissionDenied(false);
      setPhotoUri(result);
    }
  }

  async function onPickFromCamera() {
    const result = await pickVaultPhotoFromCamera();
    if (result === 'denied') return setPermissionDenied(true);
    if (result) {
      setPermissionDenied(false);
      setPhotoUri(result);
    }
  }

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      if (contentType === 'photo' && photoUri) {
        await addPhotoDocument(photoUri, kind, label.trim());
      } else {
        await addTextDocument(text, kind, label.trim());
      }
      router.back();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Card>
        <ThemedText type="smallBold">{t('vault.addLabelPlaceholder')}</ThemedText>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder={t('vault.addLabelPlaceholder')}
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, borderColor: theme.border }]}
          testID="vault-add-label"
        />
      </Card>

      <Card>
        <ThemedText type="smallBold">{t('vault.addTitle')}</ThemedText>
        <SegmentedControl
          options={KINDS.map((k) => ({
            value: k,
            label: t(`vault.kind${k.charAt(0).toUpperCase()}${k.slice(1)}`),
          }))}
          value={kind}
          onChange={setKind}
        />
      </Card>

      <Card>
        <SegmentedControl
          options={[
            { value: 'photo' as ContentType, label: t('vault.addTypePhoto') },
            { value: 'text' as ContentType, label: t('vault.addTypeText') },
          ]}
          value={contentType}
          onChange={setContentType}
        />

        {contentType === 'photo' ? (
          <>
            <PrimaryButton
              label={t('vault.addFromCamera')}
              onPress={onPickFromCamera}
              testID="vault-add-camera"
            />
            <PrimaryButton
              label={t('vault.addFromLibrary')}
              onPress={onPickFromLibrary}
              testID="vault-add-library"
            />
            {photoUri ? (
              <ThemedText type="small" themeColor="textSecondary">
                {photoUri.split('/').pop()}
              </ThemedText>
            ) : null}
            {permissionDenied ? (
              <ThemedText type="small" themeColor="danger">
                {t('vault.addPermissionDenied')}
              </ThemedText>
            ) : null}
          </>
        ) : (
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('vault.addTextPlaceholder')}
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            testID="vault-add-text"
          />
        )}
      </Card>

      <PrimaryButton
        label={t('vault.addSave')}
        onPress={onSave}
        disabled={!canSave}
        testID="vault-add-save"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
});
