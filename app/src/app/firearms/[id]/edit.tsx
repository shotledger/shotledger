// Edit-firearm form (§5 /firearms/[id]/edit) — same fields as new.tsx, seeded
// from the existing row.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ScreenTitle } from '@/components/screen-title';
import { CaliberPicker } from '@/components/caliber-picker';
import { Card } from '@/components/card';
import { LoadSystemPicker } from '@/components/load-system-picker';
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
  const firearm = db ? getFirearm(db, id) : undefined;

  const [make, setMake] = useState(firearm?.make ?? '');
  const [model, setModel] = useState(firearm?.model ?? '');
  const [caliber, setCaliber] = useState<string | null>(firearm?.caliber ?? null);
  const [weaponType, setWeaponType] = useState<WeaponType>(
    (firearm?.weaponType as WeaponType) ?? 'pistol',
  );
  const [serialNumber, setSerialNumber] = useState(firearm?.serialNumber ?? '');
  const [vapenId, setVapenId] = useState(firearm?.vapenId ?? '');
  const [loadSystem, setLoadSystem] = useState<string | null>(firearm?.loadSystem ?? null);
  const [notes, setNotes] = useState(firearm?.notes ?? '');

  if (!db || !firearm) {
    return (
      <Screen scroll={false}>
        <ScreenTitle>{t('firearms.editFirearm')}</ScreenTitle>
      </Screen>
    );
  }

  function onSave() {
    if (!db || !firearm) return;
    updateFirearm(db, firearm.id, {
      make: make.trim(),
      model: model.trim(),
      caliber,
      weaponType,
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
        <TextField value={make} onChangeText={setMake} testID="firearm-make" />
        <ThemedText type="smallBold">{t('firearms.model')}</ThemedText>
        <TextField value={model} onChangeText={setModel} testID="firearm-model" />
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
      </Card>

      <Card>
        <ThemedText type="smallBold">{t('firearms.serialNumber')}</ThemedText>
        <TextField value={serialNumber} onChangeText={setSerialNumber} />
        <ThemedText type="smallBold">{t('firearms.vapenId')}</ThemedText>
        <TextField value={vapenId} onChangeText={setVapenId} />
        <LoadSystemPicker
          label={t('firearms.loadSystem')}
          value={loadSystem}
          onChange={setLoadSystem}
        />
      </Card>

      <Card>
        <ThemedText type="smallBold">{t('firearms.notes')}</ThemedText>
        <TextField value={notes} onChangeText={setNotes} multiline />
      </Card>

      <PrimaryButton label={t('firearms.save')} onPress={onSave} testID="save-firearm" />
    </Screen>
  );
}
