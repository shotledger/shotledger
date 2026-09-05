// New-firearm form (§4 M4 §5 /firearms/new). Weapon groups, license, and
// maintenance are managed on the detail screen after creation — the same
// append-as-you-go pattern M3 used for series (§4 M3).
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { createFirearm, type WeaponType } from '@/db/queries/firearms';

const WEAPON_TYPES: WeaponType[] = ['pistol', 'revolver', 'rifle', 'airgun'];

export default function NewFirearmScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [caliber, setCaliber] = useState('');
  const [weaponType, setWeaponType] = useState<WeaponType>('pistol');
  const [serialNumber, setSerialNumber] = useState('');
  const [vapenId, setVapenId] = useState('');
  const [loadSystem, setLoadSystem] = useState('');
  const [notes, setNotes] = useState('');
  const [maintenanceIntervalRounds, setMaintenanceIntervalRounds] = useState('');

  const canCreate = make.trim().length > 0 && model.trim().length > 0;

  function onCreate() {
    if (!db || !canCreate) return;
    const interval = Number(maintenanceIntervalRounds);
    const firearm = createFirearm(db, {
      make: make.trim(),
      model: model.trim(),
      caliber: caliber.trim() || null,
      weaponType,
      serialNumber: serialNumber.trim() || null,
      vapenId: vapenId.trim() || null,
      loadSystem: loadSystem.trim() || null,
      notes: notes.trim() || null,
      maintenanceIntervalRounds:
        maintenanceIntervalRounds.trim() && Number.isFinite(interval) ? interval : null,
    });
    router.replace(`/firearms/${firearm.id}`);
  }

  return (
    <Screen>
      <Card>
        <ThemedText type="smallBold">{t('firearms.make')}</ThemedText>
        <TextField value={make} onChangeText={setMake} testID="firearm-make" />
        <ThemedText type="smallBold">{t('firearms.model')}</ThemedText>
        <TextField value={model} onChangeText={setModel} testID="firearm-model" />
        <ThemedText type="smallBold">{t('firearms.caliber')}</ThemedText>
        <TextField value={caliber} onChangeText={setCaliber} />
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
        <ThemedText type="smallBold">{t('firearms.loadSystem')}</ThemedText>
        <TextField value={loadSystem} onChangeText={setLoadSystem} />
      </Card>

      <Card>
        <ThemedText type="smallBold">{t('firearms.maintenanceInterval')}</ThemedText>
        <TextField
          value={maintenanceIntervalRounds}
          onChangeText={setMaintenanceIntervalRounds}
          keyboardType="number-pad"
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t('firearms.maintenanceIntervalHelp')}
        </ThemedText>
      </Card>

      <Card>
        <ThemedText type="smallBold">{t('firearms.notes')}</ThemedText>
        <TextField value={notes} onChangeText={setNotes} multiline />
      </Card>

      <PrimaryButton
        label={t('firearms.create')}
        onPress={onCreate}
        disabled={!canCreate}
        testID="create-firearm"
      />
    </Screen>
  );
}
