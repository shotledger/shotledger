// Edit-firearm form (§5 /firearms/[id]/edit) — same fields as new.tsx, seeded
// from the existing row.
import { TEXT_LIMITS } from '@shotledger/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ScreenTitle } from '@/components/screen-title';
import { CaliberPicker } from '@/components/caliber-picker';
import { Card } from '@/components/card';
import { LoadSystemPicker } from '@/components/load-system-picker';
import { OwnershipPicker } from '@/components/ownership-picker';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { Spacing } from '@/theme/tokens';
import { DetailsDisclosure } from '@/features/session-entry/details-disclosure';
import { getFirearm, updateFirearm, type WeaponType } from '@/db/queries/firearms';

const WEAPON_TYPES: WeaponType[] = ['pistol', 'revolver', 'rifle', 'airgun'];

export default function EditFirearmScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const firearm = getFirearm(db, id);

  const [make, setMake] = useState(firearm?.make ?? '');
  const [model, setModel] = useState(firearm?.model ?? '');
  const [caliber, setCaliber] = useState<string | null>(firearm?.caliber ?? null);
  const [weaponType, setWeaponType] = useState<WeaponType>(
    (firearm?.weaponType as WeaponType) ?? 'pistol',
  );
  const [isOwn, setIsOwn] = useState(firearm?.isOwn ?? true);
  const [serialNumber, setSerialNumber] = useState(firearm?.serialNumber ?? '');
  const [vapenId, setVapenId] = useState(firearm?.vapenId ?? '');
  const [loadSystem, setLoadSystem] = useState<string | null>(firearm?.loadSystem ?? null);
  const [notes, setNotes] = useState(firearm?.notes ?? '');

  if (!firearm) {
    return (
      <Screen scroll={false}>
        <ScreenTitle>{t('firearms.editFirearm')}</ScreenTitle>
      </Screen>
    );
  }

  // As on New Firearm: a firearm always has a make and a model.
  const canSave = make.trim().length > 0 && model.trim().length > 0;

  function onSave() {
    if (!firearm || !canSave) return;
    updateFirearm(db, firearm.id, {
      make: make.trim(),
      model: model.trim(),
      caliber,
      weaponType,
      isOwn,
      serialNumber: serialNumber.trim() || null,
      vapenId: vapenId.trim() || null,
      loadSystem,
      notes: notes.trim() || null,
    });
    router.back();
  }

  return (
    <Screen>
      <Card>
        <ThemedText type="smallBold">{t('firearms.make')}</ThemedText>
        <TextField
          accessibilityLabel={t('firearms.make')}
          value={make}
          onChangeText={setMake}
          maxLength={TEXT_LIMITS.firearms.make}
          testID="firearm-make"
        />
        <ThemedText type="smallBold">{t('firearms.model')}</ThemedText>
        <TextField
          accessibilityLabel={t('firearms.model')}
          value={model}
          onChangeText={setModel}
          maxLength={TEXT_LIMITS.firearms.model}
          testID="firearm-model"
        />
        <CaliberPicker label={t('firearms.caliber')} value={caliber} onChange={setCaliber} />
        <ThemedText type="smallBold">{t('firearms.weaponType')}</ThemedText>
        <SegmentedControl
          options={WEAPON_TYPES.map((value) => ({
            value,
            label: t(`firearms.weaponType${value.charAt(0).toUpperCase()}${value.slice(1)}`),
          }))}
          value={weaponType}
          onChange={setWeaponType}
        />
        <OwnershipPicker value={isOwn} onChange={setIsOwn} />
      </Card>

      {/* Everything below is optional, so it folds (#822). */}
      <DetailsDisclosure
        title={t('formsA.details')}
        summary={t('formsA.firearmEditDetailsSummary')}
        testID="firearm-details"
      >
        <View style={styles.fields}>
          <ThemedText type="smallBold">{t('firearms.serialNumber')}</ThemedText>
          <TextField
            placeholder={t('formsA.optional')}
            accessibilityLabel={t('firearms.serialNumber')}
            value={serialNumber}
            onChangeText={setSerialNumber}
            maxLength={TEXT_LIMITS.firearms.serial_number}
          />
          <ThemedText type="smallBold">{t('firearms.vapenId')}</ThemedText>
          <TextField
            placeholder={t('formsA.optional')}
            accessibilityLabel={t('firearms.vapenId')}
            value={vapenId}
            onChangeText={setVapenId}
            maxLength={TEXT_LIMITS.firearms.vapen_id}
          />
          <LoadSystemPicker
            label={t('firearms.loadSystem')}
            value={loadSystem}
            onChange={setLoadSystem}
          />

          <ThemedText type="smallBold">{t('firearms.notes')}</ThemedText>
          <TextField
            placeholder={t('formsA.optional')}
            accessibilityLabel={t('firearms.notes')}
            value={notes}
            onChangeText={setNotes}
            maxLength={TEXT_LIMITS.firearms.notes}
            multiline
          />
        </View>
      </DetailsDisclosure>

      <PrimaryButton
        label={t('firearms.save')}
        onPress={onSave}
        disabled={!canSave}
        testID="save-firearm"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Label-to-field spacing inside the fold, as in the cards above it.
  fields: {
    gap: Spacing.two,
  },
});
