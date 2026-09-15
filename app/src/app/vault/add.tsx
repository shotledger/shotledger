import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Switch, View } from 'react-native';
import { licenseExpiryNotifications, type ParsedLicenseCard } from '@shotledger/shared';

import { Card } from '@/components/card';
import { InfoButton } from '@/components/info-button';
import { OptionPicker } from '@/components/option-picker';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { listFirearms } from '@/db/queries/firearms';
import { addLicense } from '@/db/queries/licenses';
import {
  countRecognizedFields,
  scanLicenseCard,
  type ScanSource,
} from '@/features/licenses/scan-license-card';
import { addPhotoDocument, addTextDocument } from '@/features/vault/vault-store';
import {
  pickVaultPhotoFromCamera,
  pickVaultPhotoFromLibrary,
} from '@/features/vault/pick-vault-photo';
import type { VaultDocumentKind } from '@/features/vault/types';
import { scheduleLicenseExpiryNotifications } from '@/platform/notifications';
import { deleteScannedImage } from '@/platform/text-recognition';
import { Spacing } from '@/theme/tokens';

type ContentType = 'photo' | 'text';

const KINDS: VaultDocumentKind[] = ['license', 'membershipCard', 'doorCode', 'other'];

/** ML Kit is a native module (platform/text-recognition.web.ts is a stub), so
 *  the web preview offers plain photo storage only, same as the firearm form. */
const SCAN_SUPPORTED = Platform.OS !== 'web';

type ScanState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'error'; reason: 'denied' | 'failed' | 'unsupported' | 'nothing' }
  | { status: 'done'; count: number; parsed: ParsedLicenseCard };

export default function AddVaultDocumentScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [contentType, setContentType] = useState<ContentType>('photo');
  const [kind, setKind] = useState<VaultDocumentKind>('license');
  const [label, setLabel] = useState('');
  const [text, setText] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [saving, setSaving] = useState(false);

  const [scan, setScan] = useState<ScanState>({ status: 'idle' });
  // Firearms don't change while this screen is open; no need to refetch.
  const [firearms] = useState<ReturnType<typeof listFirearms>>(() => (db ? listFirearms(db) : []));
  const [createLicense, setCreateLicense] = useState(false);
  const [selectedFirearmId, setSelectedFirearmId] = useState<string | null>(null);

  const canSave =
    label.trim().length > 0 &&
    !saving &&
    (contentType === 'text' ? text.trim().length > 0 : photoUri !== null) &&
    !(createLicense && !selectedFirearmId);

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

  /** Scanning never replaces the plain camera/library buttons above — it only
   *  offers to also read the card. A failed/unsupported/empty scan deletes
   *  its own picked image (scanLicenseCard's usual behaviour); the user can
   *  still fall back to "Take photo" / "Choose from library" to store the
   *  photo without OCR. */
  async function onScanCard(source: ScanSource) {
    setScan({ status: 'busy' });
    const result = await scanLicenseCard(source);
    if (result.status === 'cancelled') return setScan({ status: 'idle' });
    if (result.status !== 'scanned') return setScan({ status: 'error', reason: result.status });

    const count = countRecognizedFields(result.parsed);
    if (count === 0) {
      void deleteScannedImage(result.imageUri);
      return setScan({ status: 'error', reason: 'nothing' });
    }

    setPermissionDenied(false);
    setPhotoUri(result.imageUri);
    setScan({ status: 'done', count, parsed: result.parsed });
  }

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      if (contentType === 'photo' && photoUri) {
        const meta = await addPhotoDocument(photoUri, kind, label.trim());

        if (
          db &&
          kind === 'license' &&
          scan.status === 'done' &&
          createLicense &&
          selectedFirearmId
        ) {
          const firearm = firearms.find((f) => f.id === selectedFirearmId);
          const parsed = scan.parsed;
          const license = addLicense(db, {
            firearmId: selectedFirearmId,
            licenseNumber: parsed.licenseNumber,
            purpose: parsed.purpose,
            decidedOn: parsed.decidedOn,
            validUntil: parsed.validUntilIndefinite ? null : parsed.validUntil,
            conditions: parsed.conditions,
            authority: parsed.authority,
            vaultDocumentId: meta.id,
          });
          if (firearm) {
            void scheduleLicenseExpiryNotifications(
              license.id,
              `${firearm.make} ${firearm.model}`,
              licenseExpiryNotifications(license.validUntil),
            );
          }
        }
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
        <TextField
          value={label}
          onChangeText={setLabel}
          placeholder={t('vault.addLabelPlaceholder')}
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

            {kind === 'license' && SCAN_SUPPORTED ? (
              <>
                <View style={styles.headerRow}>
                  <ThemedText type="smallBold" style={styles.headerLabel}>
                    {t('vault.scanTitle')}
                  </ThemedText>
                  <InfoButton
                    title={t('vault.scanTitle')}
                    body={t('vault.scanHint')}
                    testID="vault-scan-info"
                  />
                </View>
                <PrimaryButton
                  label={t('vault.scanFromCamera')}
                  onPress={() => void onScanCard('camera')}
                  disabled={scan.status === 'busy'}
                  testID="vault-scan-camera"
                />
                <PrimaryButton
                  label={t('vault.scanFromLibrary')}
                  onPress={() => void onScanCard('library')}
                  disabled={scan.status === 'busy'}
                  testID="vault-scan-library"
                />
                {scan.status === 'busy' ? (
                  <ThemedText type="small" themeColor="textSecondary" testID="vault-scan-busy">
                    {t('vault.scanBusy')}
                  </ThemedText>
                ) : null}
                {scan.status === 'error' ? (
                  <ThemedText type="small" themeColor="danger" testID="vault-scan-error">
                    {t(`vault.scanError${capitalize(scan.reason)}`)}
                  </ThemedText>
                ) : null}
                {scan.status === 'done' ? (
                  <>
                    <ThemedText type="small" testID="vault-scan-result">
                      {t('vault.scanRecognized', { recognized: scan.count })}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('vault.scanCheckNotice')}
                    </ThemedText>
                    {firearms.length > 0 ? (
                      <>
                        <View style={styles.switchRow}>
                          <ThemedText type="small">{t('vault.scanCreateLicense')}</ThemedText>
                          <Switch
                            value={createLicense}
                            onValueChange={setCreateLicense}
                            testID="vault-scan-create-license"
                          />
                        </View>
                        {createLicense ? (
                          <OptionPicker
                            label={t('vault.scanFirearmLabel')}
                            options={firearms.map((f) => ({
                              value: f.id,
                              label: `${f.make} ${f.model}`,
                              testID: `vault-scan-firearm-${f.id}`,
                            }))}
                            value={selectedFirearmId}
                            onChange={setSelectedFirearmId}
                          />
                        ) : null}
                      </>
                    ) : (
                      <ThemedText
                        type="small"
                        themeColor="textSecondary"
                        testID="vault-scan-no-firearms"
                      >
                        {t('vault.scanNoFirearms')}
                      </ThemedText>
                    )}
                  </>
                ) : null}
              </>
            ) : null}
          </>
        ) : (
          <TextField
            value={text}
            onChangeText={setText}
            placeholder={t('vault.addTextPlaceholder')}
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

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  headerLabel: {
    flexShrink: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
});
