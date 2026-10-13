// Edit-firearm form (§5 /firearms/[id]/edit) — same fields as new.tsx, seeded
// from the existing row.
import { TEXT_LIMITS } from '@shotledger/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

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

  function onSave() {
    if (!firearm) return;
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
      </Card>

      <Card>
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

      <Card>
        <ThemedText type="smallBold">{t('firearms.serialNumber')}</ThemedText>
        <TextField
          accessibilityLabel={t('firearms.serialNumber')}
          value={serialNumber}
          onChangeText={setSerialNumber}
          maxLength={TEXT_LIMITS.firearms.serial_number}
        />
        <ThemedText type="smallBold">{t('firearms.vapenId')}</ThemedText>
        <TextField
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
      </Card>

      <Card>
        <ThemedText type="smallBold">{t('firearms.notes')}</ThemedText>
        <TextField
          accessibilityLabel={t('firearms.notes')}
          value={notes}
          onChangeText={setNotes}
          maxLength={TEXT_LIMITS.firearms.notes}
          multiline
        />
      </Card>

      <PrimaryButton label={t('firearms.save')} onPress={onSave} testID="save-firearm" />
    </Screen>
  );
}
