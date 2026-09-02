// Decrypts a document to memory only — never writes plaintext to disk. A
// photo is rendered via a `data:` URI built directly from the decrypted
// bytes (app/src/platform/base64.ts); a text secret is held only in
// component state and cleared on unmount (React garbage-collects it, no
// explicit disk cleanup needed since nothing was ever written).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, StyleSheet } from 'react-native';

import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { deleteDocument, getDocumentContent } from '@/features/vault/vault-store';
import type { VaultDocumentMeta } from '@/features/vault/types';
import { bytesToBase64 } from '@/platform/base64';

export default function VaultDocumentScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [meta, setMeta] = useState<VaultDocumentMeta | null>(null);
  const [imageDataUri, setImageDataUri] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDocumentContent(id).then((content) => {
      if (cancelled || !content) return;
      setMeta(content.meta);
      if (content.meta.contentType === 'image') {
        setImageDataUri(`data:image/jpeg;base64,${bytesToBase64(content.bytes)}`);
      } else {
        setText(new TextDecoder().decode(content.bytes));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function onDelete() {
    Alert.alert(t('vault.detailDeleteConfirmTitle'), t('vault.detailDeleteConfirmBody'), [
      { text: t('vault.detailDeleteConfirmCancel'), style: 'cancel' },
      {
        text: t('vault.detailDeleteConfirmConfirm'),
        style: 'destructive',
        onPress: async () => {
          await deleteDocument(id);
          router.back();
        },
      },
    ]);
  }

  if (!meta) {
    return (
      <Screen>
        <ThemedText type="default" themeColor="textSecondary">
          …
        </ThemedText>
      </Screen>
    );
  }

  return (
    <Screen>
      <ThemedText type="title">{meta.label}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('vault.detailAddedOn', { date: new Date(meta.addedAt).toLocaleDateString() })}
      </ThemedText>

      <Card>
        {imageDataUri ? (
          <Image source={{ uri: imageDataUri }} style={styles.image} resizeMode="contain" />
        ) : (
          <ThemedText type="default" selectable testID="vault-document-text">
            {text}
          </ThemedText>
        )}
      </Card>

      <PrimaryButton
        label={t('vault.detailDelete')}
        onPress={onDelete}
        testID="vault-document-delete"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    aspectRatio: 1,
  },
});
