// New-firearm form (§4 M4 §5 /firearms/new). Weapon groups, license, and
// maintenance are managed on the detail screen after creation — the same
// append-as-you-go pattern M3 used for series (§4 M3).
import { TEXT_LIMITS } from '@shotledger/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

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
import { createFirearm, type WeaponType } from '@/db/queries/firearms';
import { refreshMaintenanceTimeReminders } from '@/features/firearms/maintenance';
import {
  parseMaintenanceInterval,
  parseMaintenanceIntervalMonths,
} from '@/features/firearms/round-adjustment';
import { useFeatures } from '@/features/settings/feature-visibility';

const WEAPON_TYPES: WeaponType[] = ['pistol', 'revolver', 'rifle', 'airgun'];

export default function NewFirearmScreen() {
  const { t } = useTranslation();
  const features = useFeatures();
  const router = useRouter();

  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [caliber, setCaliber] = useState<string | null>(null);
  const [weaponType, setWeaponType] = useState<WeaponType>('pistol');
  // A new firearm is overwhelmingly the shooter's own, and this is on screen
  // before they save — unlike an existing row, which no migration may guess at.
  const [isOwn, setIsOwn] = useState(true);
  const [serialNumber, setSerialNumber] = useState('');
  const [vapenId, setVapenId] = useState('');
  const [loadSystem, setLoadSystem] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [maintenanceIntervalRounds, setMaintenanceIntervalRounds] = useState('');
  const [maintenanceIntervalMonths, setMaintenanceIntervalMonths] = useState('');

  // The same rules as the detail screen's interval fields: blank, or a
  // positive whole number of rounds; blank, or 1–120 months (#800).
  const interval = parseMaintenanceInterval(maintenanceIntervalRounds);
  const months = parseMaintenanceIntervalMonths(maintenanceIntervalMonths);
  const canCreate = make.trim().length > 0 && model.trim().length > 0 && interval.ok && months.ok;

  function onCreate() {
    if (!canCreate || !interval.ok || !months.ok) return;
    const firearm = createFirearm(db, {
      make: make.trim(),
      model: model.trim(),
      caliber,
      weaponType,
      isOwn,
      serialNumber: serialNumber.trim() || null,
      vapenId: vapenId.trim() || null,
      loadSystem,
      notes: notes.trim() || null,
      maintenanceIntervalRounds: interval.interval,
      maintenanceIntervalMonths: months.months,
    });
    if (months.months !== null) {
      void refreshMaintenanceTimeReminders({ request: true });
    }
    router.replace(`/firearms/${firearm.id}`);
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

      {/* Maintenance hidden (#801): the firearm is saved with no interval. */}
      {features.maintenance && (
        <Card>
          <ThemedText type="smallBold">{t('firearms.maintenanceInterval')}</ThemedText>
          <TextField
            accessibilityLabel={t('firearms.maintenanceInterval')}
            value={maintenanceIntervalRounds}
            onChangeText={setMaintenanceIntervalRounds}
            keyboardType="number-pad"
          />
          {interval.ok ? null : (
            <ThemedText type="small" themeColor="danger" testID="interval-error">
              {t('firearms.intervalInvalid')}
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary">
            {t('firearms.maintenanceIntervalHelp')}
          </ThemedText>
          <ThemedText type="smallBold">{t('firearms.maintenanceIntervalMonths')}</ThemedText>
          <TextField
            accessibilityLabel={t('firearms.maintenanceIntervalMonths')}
            value={maintenanceIntervalMonths}
            onChangeText={setMaintenanceIntervalMonths}
            keyboardType="number-pad"
            testID="new-firearm-interval-months"
          />
          {months.ok ? null : (
            <ThemedText type="small" themeColor="danger" testID="new-firearm-interval-months-error">
              {t('firearms.intervalMonthsInvalid')}
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary">
            {t('firearms.maintenanceIntervalMonthsHelp')}
          </ThemedText>
        </Card>
      )}

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

      <PrimaryButton
        label={t('firearms.create')}
        onPress={onCreate}
        disabled={!canCreate}
        testID="create-firearm"
      />
    </Screen>
  );
}
