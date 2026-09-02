// Edit-firearm form (§5 /firearms/[id]/edit) — same fields as new.tsx, seeded
// from the existing row.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput } from 'react-native';

import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { getFirearm, updateFirearm, type WeaponType } from '@/db/queries/firearms';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme/tokens';

const WEAPON_TYPES: WeaponType[] = ['pistol', 'revolver', 'rifle', 'airgun'];

export default function EditFirearmScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const firearm = db ? getFirearm(db, id) : undefined;

  const [make, setMake] = useState(firearm?.make ?? '');
  const [model, setModel] = useState(firearm?.model ?? '');
  const [caliber, setCaliber] = useState(firearm?.caliber ?? '');
  const [weaponType, setWeaponType] = useState<WeaponType>((firearm?.weaponType as WeaponType) ?? 'pistol');
  const [serialNumber, setSerialNumber] = useState(firearm?.serialNumber ?? '');
  const [vapenId, setVapenId] = useState(firearm?.vapenId ?? '');
  const [loadSystem, setLoadSystem] = useState(firearm?.loadSystem ?? '');
  const [notes, setNotes] = useState(firearm?.notes ?? '');

  if (!db || !firearm) {
    return (
      <Screen scroll={false}>
        <ThemedText type="title">{t('firearms.editFirearm')}</ThemedText>
      </Screen>
    );
  }

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.border }];

  function onSave() {
    if (!db || !firearm) return;
    updateFirearm(db, firearm.id, {
      make: make.trim(),
      model: model.trim(),
      caliber: caliber.trim() || null,
      weaponType,
      serialNumber: serialNumber.trim() || null,
      vapenId: vapenId.trim() || null,
      loadSystem: loadSystem.trim() || null,
      notes: notes.trim() || null,
    });
    router.back();
  }

  return (
    <Screen>
      <Card>
        <ThemedText type="smallBold">{t('firearms.make')}</ThemedText>
        <TextInput value={make} onChangeText={setMake} style={inputStyle} testID="firearm-make" />
        <ThemedText type="smallBold">{t('firearms.model')}</ThemedText>
        <TextInput value={model} onChangeText={setModel} style={inputStyle} testID="firearm-model" />
        <ThemedText type="smallBold">{t('firearms.caliber')}</ThemedText>
        <TextInput value={caliber} onChangeText={setCaliber} style={inputStyle} />
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
        <TextInput value={serialNumber} onChangeText={setSerialNumber} style={inputStyle} />
        <ThemedText type="smallBold">{t('firearms.vapenId')}</ThemedText>
        <TextInput value={vapenId} onChangeText={setVapenId} style={inputStyle} />
        <ThemedText type="smallBold">{t('firearms.loadSystem')}</ThemedText>
        <TextInput value={loadSystem} onChangeText={setLoadSystem} style={inputStyle} />
      </Card>

      <Card>
        <ThemedText type="smallBold">{t('firearms.notes')}</ThemedText>
        <TextInput value={notes} onChangeText={setNotes} style={inputStyle} multiline />
      </Card>

      <PrimaryButton label={t('firearms.save')} onPress={onSave} testID="save-firearm" />
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
