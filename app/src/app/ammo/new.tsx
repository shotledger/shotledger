// New ammo lot form (§4 M4): factory fields always shown; the handload
// recipe section (powder/charge/primer/brass/COL/crimp) toggles with
// isHandload (§3).
import { muzzleEnergyJoules, powerFactor, TEXT_LIMITS } from '@shotledger/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';

import { CaliberPicker } from '@/components/caliber-picker';
import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { createAmmoLot } from '@/db/queries/ammo-lots';
import { Spacing } from '@/theme/tokens';

function numberOrNull(value: string): number | null {
  const n = Number(value);
  return value.trim() && Number.isFinite(n) ? n : null;
}

export default function NewAmmoLotScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [label, setLabel] = useState('');
  const [caliber, setCaliber] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [purchasedOn, setPurchasedOn] = useState('');
  const [isHandload, setIsHandload] = useState(false);

  const [brand, setBrand] = useState('');
  const [product, setProduct] = useState('');
  const [lotNumber, setLotNumber] = useState('');

  const [bulletMake, setBulletMake] = useState('');
  const [bulletModel, setBulletModel] = useState('');
  const [bulletWeightGr, setBulletWeightGr] = useState('');
  const [velocityMps, setVelocityMps] = useState('');

  const [powder, setPowder] = useState('');
  const [powderChargeGr, setPowderChargeGr] = useState('');
  const [primer, setPrimer] = useState('');
  const [brass, setBrass] = useState('');
  const [colMm, setColMm] = useState('');
  const [crimpMm, setCrimpMm] = useState('');
  const [notes, setNotes] = useState('');

  const canCreate = label.trim().length > 0;
  const derivedPowerFactor = powerFactor(numberOrNull(bulletWeightGr), numberOrNull(velocityMps));
  const derivedEnergy = muzzleEnergyJoules(numberOrNull(bulletWeightGr), numberOrNull(velocityMps));

  function onCreate() {
    if (!db || !canCreate) return;
    createAmmoLot(db, {
      label: label.trim(),
      caliber,
      quantity: numberOrNull(quantity),
      purchasedOn: purchasedOn.trim() || null,
      isHandload,
      brand: isHandload ? null : brand.trim() || null,
      product: isHandload ? null : product.trim() || null,
      lotNumber: isHandload ? null : lotNumber.trim() || null,
      bulletMake: bulletMake.trim() || null,
      bulletModel: bulletModel.trim() || null,
      bulletWeightGr: numberOrNull(bulletWeightGr),
      velocityMps: numberOrNull(velocityMps),
      powder: isHandload ? powder.trim() || null : null,
      powderChargeGr: isHandload ? numberOrNull(powderChargeGr) : null,
      primer: isHandload ? primer.trim() || null : null,
      brass: isHandload ? brass.trim() || null : null,
      colMm: isHandload ? numberOrNull(colMm) : null,
      crimpMm: isHandload ? numberOrNull(crimpMm) : null,
      notes: notes.trim() || null,
    });
    router.back();
  }

  return (
    <Screen>
      <Card>
        <ThemedText type="smallBold">{t('ammo.label')}</ThemedText>
        <TextField
          value={label}
          onChangeText={setLabel}
          maxLength={TEXT_LIMITS.ammo_lots.label}
          testID="ammo-label"
        />
        <CaliberPicker label={t('ammo.caliber')} value={caliber} onChange={setCaliber} />
        <ThemedText type="smallBold">{t('ammo.quantity')}</ThemedText>
        <TextField value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
        <ThemedText type="smallBold">{t('ammo.purchasedOn')}</ThemedText>
        <TextField
          value={purchasedOn}
          onChangeText={setPurchasedOn}
          maxLength={TEXT_LIMITS.ammo_lots.purchased_on}
          placeholder="YYYY-MM-DD"
        />
        <View style={styles.switchRow}>
          <ThemedText type="small">{t('ammo.isHandload')}</ThemedText>
          <Switch value={isHandload} onValueChange={setIsHandload} testID="handload-toggle" />
        </View>
      </Card>

      {!isHandload && (
        <Card>
          <ThemedText type="smallBold">{t('ammo.brand')}</ThemedText>
          <TextField
            value={brand}
            onChangeText={setBrand}
            maxLength={TEXT_LIMITS.ammo_lots.brand}
          />
          <ThemedText type="smallBold">{t('ammo.product')}</ThemedText>
          <TextField
            value={product}
            onChangeText={setProduct}
            maxLength={TEXT_LIMITS.ammo_lots.product}
          />
          <ThemedText type="smallBold">{t('ammo.lotNumber')}</ThemedText>
          <TextField
            value={lotNumber}
            onChangeText={setLotNumber}
            maxLength={TEXT_LIMITS.ammo_lots.lot_number}
          />
        </Card>
      )}

      <Card>
        <ThemedText type="smallBold">{t('ammo.bulletMake')}</ThemedText>
        <TextField
          value={bulletMake}
          onChangeText={setBulletMake}
          maxLength={TEXT_LIMITS.ammo_lots.bullet_make}
        />
        <ThemedText type="smallBold">{t('ammo.bulletModel')}</ThemedText>
        <TextField
          value={bulletModel}
          onChangeText={setBulletModel}
          maxLength={TEXT_LIMITS.ammo_lots.bullet_model}
        />
        <ThemedText type="smallBold">{t('ammo.bulletWeightGr')}</ThemedText>
        <TextField
          value={bulletWeightGr}
          onChangeText={setBulletWeightGr}
          keyboardType="decimal-pad"
        />
        <ThemedText type="smallBold">{t('ammo.velocityMps')}</ThemedText>
        <TextField
          value={velocityMps}
          onChangeText={setVelocityMps}
          keyboardType="decimal-pad"
          testID="ammo-velocity"
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t('ammo.velocityHint')}
        </ThemedText>
        {derivedPowerFactor != null && (
          <>
            {/* Side by side: both come from the same weight and velocity, so
                they are two readings of one load rather than two settings. */}
            <View style={styles.derivedRow}>
              <View style={styles.derivedCell}>
                <ThemedText type="smallBold">{t('ammo.powerFactor')}</ThemedText>
                <ThemedText testID="ammo-power-factor">{String(derivedPowerFactor)}</ThemedText>
              </View>
              <View style={styles.derivedCell}>
                <ThemedText type="smallBold">{t('ammo.muzzleEnergy')}</ThemedText>
                <ThemedText testID="ammo-muzzle-energy">
                  {derivedEnergy == null ? '–' : t('ammo.joules', { value: derivedEnergy })}
                </ThemedText>
              </View>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {t('ammo.powerFactorHint')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('ammo.muzzleEnergyHint')}
            </ThemedText>
          </>
        )}
      </Card>

      {isHandload && (
        <Card testID="handload-recipe">
          <ThemedText type="smallBold">{t('ammo.recipeTitle')}</ThemedText>
          <ThemedText type="small">{t('ammo.powder')}</ThemedText>
          <TextField
            value={powder}
            onChangeText={setPowder}
            maxLength={TEXT_LIMITS.ammo_lots.powder}
            testID="ammo-powder"
          />
          <ThemedText type="small">{t('ammo.powderChargeGr')}</ThemedText>
          <TextField
            value={powderChargeGr}
            onChangeText={setPowderChargeGr}
            keyboardType="decimal-pad"
          />
          <ThemedText type="small">{t('ammo.primer')}</ThemedText>
          <TextField
            value={primer}
            onChangeText={setPrimer}
            maxLength={TEXT_LIMITS.ammo_lots.primer}
          />
          <ThemedText type="small">{t('ammo.brass')}</ThemedText>
          <TextField
            value={brass}
            onChangeText={setBrass}
            maxLength={TEXT_LIMITS.ammo_lots.brass}
          />
          <ThemedText type="small">{t('ammo.colMm')}</ThemedText>
          <TextField value={colMm} onChangeText={setColMm} keyboardType="decimal-pad" />
          <ThemedText type="small">{t('ammo.crimpMm')}</ThemedText>
          <TextField value={crimpMm} onChangeText={setCrimpMm} keyboardType="decimal-pad" />
        </Card>
      )}

      <Card>
        <ThemedText type="smallBold">{t('ammo.notes')}</ThemedText>
        <TextField
          value={notes}
          onChangeText={setNotes}
          maxLength={TEXT_LIMITS.ammo_lots.notes}
          multiline
        />
      </Card>

      <PrimaryButton
        label={t('ammo.create')}
        onPress={onCreate}
        disabled={!canCreate}
        testID="create-ammo"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  derivedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  // Equal halves, so the two readings line up rather than one being pushed
  // to the edge by the length of the other's label.
  derivedCell: {
    flex: 1,
    gap: Spacing.one,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
});
