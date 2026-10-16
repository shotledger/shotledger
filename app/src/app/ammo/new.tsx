// New ammo lot form (§4 M4): the label, caliber and quantity lead; every
// other field is optional and folds under "Details" (#822). Inside it the
// factory fields and the handload recipe (powder/charge/primer/brass/COL/
// crimp) swap with isHandload (§3).
import { muzzleEnergyJoules, powerFactor, TEXT_LIMITS } from '@shotledger/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { CaliberPicker } from '@/components/caliber-picker';
import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Toggle } from '@/components/toggle';
import { DetailsDisclosure } from '@/features/session-entry/details-disclosure';
import { db } from '@/db/client';
import { createAmmoLot } from '@/db/queries/ammo-lots';
import { parseMeasure, parseQuantity } from '@/features/ammo/quantity';
import { readTrackedInputs } from '@/features/settings/tracked-inputs';
import { Spacing } from '@/theme/tokens';

export default function NewAmmoLotScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [label, setLabel] = useState('');
  const [caliber, setCaliber] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [purchasedOn, setPurchasedOn] = useState('');
  const [isHandload, setIsHandload] = useState(false);
  const tracked = useMemo(() => readTrackedInputs(db), []);

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
  const derivedPowerFactor = powerFactor(parseMeasure(bulletWeightGr), parseMeasure(velocityMps));
  const derivedEnergy = muzzleEnergyJoules(parseMeasure(bulletWeightGr), parseMeasure(velocityMps));

  function onCreate() {
    if (!canCreate) return;
    createAmmoLot(db, {
      label: label.trim(),
      caliber,
      quantity: parseQuantity(quantity),
      purchasedOn: purchasedOn.trim() || null,
      isHandload,
      brand: isHandload ? null : brand.trim() || null,
      product: isHandload ? null : product.trim() || null,
      lotNumber: isHandload ? null : lotNumber.trim() || null,
      bulletMake: bulletMake.trim() || null,
      bulletModel: bulletModel.trim() || null,
      bulletWeightGr: parseMeasure(bulletWeightGr),
      velocityMps: parseMeasure(velocityMps),
      powder: isHandload ? powder.trim() || null : null,
      powderChargeGr: isHandload ? parseMeasure(powderChargeGr) : null,
      primer: isHandload ? primer.trim() || null : null,
      brass: isHandload ? brass.trim() || null : null,
      colMm: isHandload ? parseMeasure(colMm) : null,
      crimpMm: isHandload ? parseMeasure(crimpMm) : null,
      notes: notes.trim() || null,
    });
    router.back();
  }

  return (
    <Screen>
      <Card>
        <ThemedText type="smallBold">{t('ammo.label')}</ThemedText>
        <TextField
          accessibilityLabel={t('ammo.label')}
          value={label}
          onChangeText={setLabel}
          maxLength={TEXT_LIMITS.ammo_lots.label}
          testID="ammo-label"
        />
        <CaliberPicker label={t('ammo.caliber')} value={caliber} onChange={setCaliber} />
        <ThemedText type="smallBold">{t('ammo.quantity')}</ThemedText>
        <TextField
          accessibilityLabel={t('ammo.quantity')}
          placeholder={t('formsA.optional')}
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="number-pad"
        />
      </Card>

      <DetailsDisclosure
        title={t('formsA.details')}
        summary={t(isHandload ? 'formsA.ammoDetailsSummaryHandload' : 'formsA.ammoDetailsSummary')}
        testID="ammo-details"
      >
        <View style={styles.fields}>
          <ThemedText type="smallBold">{t('ammo.purchasedOn')}</ThemedText>
          <TextField
            accessibilityLabel={t('ammo.purchasedOn')}
            value={purchasedOn}
            onChangeText={setPurchasedOn}
            maxLength={TEXT_LIMITS.ammo_lots.purchased_on}
            placeholder="YYYY-MM-DD"
          />
          {tracked.handloads && (
            <View style={styles.switchRow}>
              <ThemedText type="small">{t('ammo.isHandload')}</ThemedText>
              <Toggle value={isHandload} onValueChange={setIsHandload} testID="handload-toggle" />
            </View>
          )}

          {!isHandload && (
            <>
              <ThemedText type="smallBold">{t('ammo.brand')}</ThemedText>
              <TextField
                placeholder={t('formsA.optional')}
                accessibilityLabel={t('ammo.brand')}
                value={brand}
                onChangeText={setBrand}
                maxLength={TEXT_LIMITS.ammo_lots.brand}
              />
              <ThemedText type="smallBold">{t('ammo.product')}</ThemedText>
              <TextField
                placeholder={t('formsA.optional')}
                accessibilityLabel={t('ammo.product')}
                value={product}
                onChangeText={setProduct}
                maxLength={TEXT_LIMITS.ammo_lots.product}
              />
              <ThemedText type="smallBold">{t('ammo.lotNumber')}</ThemedText>
              <TextField
                placeholder={t('formsA.optional')}
                accessibilityLabel={t('ammo.lotNumber')}
                value={lotNumber}
                onChangeText={setLotNumber}
                maxLength={TEXT_LIMITS.ammo_lots.lot_number}
              />
            </>
          )}

          <ThemedText type="smallBold">{t('ammo.bulletMake')}</ThemedText>
          <TextField
            placeholder={t('formsA.optional')}
            accessibilityLabel={t('ammo.bulletMake')}
            value={bulletMake}
            onChangeText={setBulletMake}
            maxLength={TEXT_LIMITS.ammo_lots.bullet_make}
          />
          <ThemedText type="smallBold">{t('ammo.bulletModel')}</ThemedText>
          <TextField
            placeholder={t('formsA.optional')}
            accessibilityLabel={t('ammo.bulletModel')}
            value={bulletModel}
            onChangeText={setBulletModel}
            maxLength={TEXT_LIMITS.ammo_lots.bullet_model}
          />
          <ThemedText type="smallBold">{t('ammo.bulletWeightGr')}</ThemedText>
          <TextField
            placeholder={t('formsA.optional')}
            accessibilityLabel={t('ammo.bulletWeightGr')}
            value={bulletWeightGr}
            onChangeText={setBulletWeightGr}
            keyboardType="decimal-pad"
          />
          <ThemedText type="smallBold">{t('ammo.velocityMps')}</ThemedText>
          <TextField
            placeholder={t('formsA.optional')}
            accessibilityLabel={t('ammo.velocityMps')}
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
            </>
          )}

          {isHandload && (
            <View style={styles.group} testID="handload-recipe">
              <ThemedText type="smallBold">{t('ammo.recipeTitle')}</ThemedText>
              <ThemedText type="small">{t('ammo.powder')}</ThemedText>
              <TextField
                placeholder={t('formsA.optional')}
                accessibilityLabel={t('ammo.powder')}
                value={powder}
                onChangeText={setPowder}
                maxLength={TEXT_LIMITS.ammo_lots.powder}
                testID="ammo-powder"
              />
              <ThemedText type="small">{t('ammo.powderChargeGr')}</ThemedText>
              <TextField
                placeholder={t('formsA.optional')}
                accessibilityLabel={t('ammo.powderChargeGr')}
                value={powderChargeGr}
                onChangeText={setPowderChargeGr}
                keyboardType="decimal-pad"
              />
              <ThemedText type="small">{t('ammo.primer')}</ThemedText>
              <TextField
                placeholder={t('formsA.optional')}
                accessibilityLabel={t('ammo.primer')}
                value={primer}
                onChangeText={setPrimer}
                maxLength={TEXT_LIMITS.ammo_lots.primer}
              />
              <ThemedText type="small">{t('ammo.brass')}</ThemedText>
              <TextField
                placeholder={t('formsA.optional')}
                accessibilityLabel={t('ammo.brass')}
                value={brass}
                onChangeText={setBrass}
                maxLength={TEXT_LIMITS.ammo_lots.brass}
              />
              <ThemedText type="small">{t('ammo.colMm')}</ThemedText>
              <TextField
                placeholder={t('formsA.optional')}
                accessibilityLabel={t('ammo.colMm')}
                value={colMm}
                onChangeText={setColMm}
                keyboardType="decimal-pad"
              />
              <ThemedText type="small">{t('ammo.crimpMm')}</ThemedText>
              <TextField
                placeholder={t('formsA.optional')}
                accessibilityLabel={t('ammo.crimpMm')}
                value={crimpMm}
                onChangeText={setCrimpMm}
                keyboardType="decimal-pad"
              />
            </View>
          )}

          <ThemedText type="smallBold">{t('ammo.notes')}</ThemedText>
          <TextField
            placeholder={t('formsA.optional')}
            accessibilityLabel={t('ammo.notes')}
            value={notes}
            onChangeText={setNotes}
            maxLength={TEXT_LIMITS.ammo_lots.notes}
            multiline
          />
        </View>
      </DetailsDisclosure>

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
  // Label-to-field spacing inside the fold, as in the cards above it.
  fields: {
    gap: Spacing.two,
  },
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
  group: {
    gap: Spacing.two,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
});
