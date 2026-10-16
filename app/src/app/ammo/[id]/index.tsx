// Ammo lot detail/edit (§4 M4 §5): usage (sessions x shots) at top, then
// the same fields as new.tsx, editable in place — label, caliber and
// quantity first, the optional rest folded under "Details" (#822). No separate detail vs
// edit route — lot-vs-lot comparison stays v3, so a form is the whole screen.
import { muzzleEnergyJoules, powerFactor, TEXT_LIMITS } from '@shotledger/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ScreenTitle } from '@/components/screen-title';
import { CaliberPicker } from '@/components/caliber-picker';
import { Card } from '@/components/card';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { OptionPicker } from '@/components/option-picker';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SecondaryButton } from '@/components/secondary-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Toggle } from '@/components/toggle';
import { DetailsDisclosure } from '@/features/session-entry/details-disclosure';
import { db } from '@/db/client';
import { getAmmoLot, listAmmoLots, mergeAmmoLots, updateAmmoLot } from '@/db/queries/ammo-lots';
import { getAmmoLotUsage } from '@/db/queries/ammo-usage';
import { parseMeasure, parseQuantity } from '@/features/ammo/quantity';
import { readTrackedInputs } from '@/features/settings/tracked-inputs';
import { Spacing } from '@/theme/tokens';

export default function AmmoLotDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const lot = getAmmoLot(db, id);
  const usage = lot ? getAmmoLotUsage(db, lot.id) : { sessionCount: 0, shotCount: 0 };

  const [label, setLabel] = useState(lot?.label ?? '');
  const [caliber, setCaliber] = useState<string | null>(lot?.caliber ?? null);
  const [quantity, setQuantity] = useState(lot?.quantity != null ? String(lot.quantity) : '');
  const [purchasedOn, setPurchasedOn] = useState(lot?.purchasedOn ?? '');
  const [isHandload, setIsHandload] = useState(lot?.isHandload === 1);
  const tracked = useMemo(() => readTrackedInputs(db), []);
  const [brand, setBrand] = useState(lot?.brand ?? '');
  const [product, setProduct] = useState(lot?.product ?? '');
  const [lotNumber, setLotNumber] = useState(lot?.lotNumber ?? '');
  const [bulletMake, setBulletMake] = useState(lot?.bulletMake ?? '');
  const [bulletModel, setBulletModel] = useState(lot?.bulletModel ?? '');
  const [bulletWeightGr, setBulletWeightGr] = useState(
    lot?.bulletWeightGr != null ? String(lot.bulletWeightGr) : '',
  );
  const [velocityMps, setVelocityMps] = useState(
    lot?.velocityMps != null ? String(lot.velocityMps) : '',
  );
  const [powder, setPowder] = useState(lot?.powder ?? '');
  const [powderChargeGr, setPowderChargeGr] = useState(
    lot?.powderChargeGr != null ? String(lot.powderChargeGr) : '',
  );
  const [primer, setPrimer] = useState(lot?.primer ?? '');
  const [brass, setBrass] = useState(lot?.brass ?? '');
  const [colMm, setColMm] = useState(lot?.colMm != null ? String(lot.colMm) : '');
  const [crimpMm, setCrimpMm] = useState(lot?.crimpMm != null ? String(lot.crimpMm) : '');
  const [notes, setNotes] = useState(lot?.notes ?? '');
  // Merge Into Another Lot (docs/specs/ammo-lot-merge-spec.md M5).
  const otherLots = useMemo(() => listAmmoLots(db).filter((other) => other.id !== id), [id]);
  const [merging, setMerging] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);

  const derivedPowerFactor = powerFactor(parseMeasure(bulletWeightGr), parseMeasure(velocityMps));
  const derivedEnergy = muzzleEnergyJoules(parseMeasure(bulletWeightGr), parseMeasure(velocityMps));

  if (!lot) {
    return (
      <Screen scroll={false}>
        <ScreenTitle>{t('ammo.editLot')}</ScreenTitle>
      </Screen>
    );
  }

  function onSave() {
    if (!lot) return;
    updateAmmoLot(db, lot.id, {
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

  const target = otherLots.find((other) => other.id === mergeTarget);
  function onConfirmMerge() {
    if (!lot || !target) return;
    mergeAmmoLots(db, lot.id, target.id);
    setMergeTarget(null);
    router.back();
  }

  return (
    <Screen>
      {/* One line, not a card: it groups nothing (#822). */}
      <View style={styles.usage}>
        <ThemedText type="smallBold">{t('ammo.usage')}</ThemedText>
        <ThemedText testID="ammo-usage">
          {t('ammo.usageCount', { sessions: usage.sessionCount, shots: usage.shotCount })}
        </ThemedText>
      </View>

      <Card>
        <ThemedText type="smallBold">{t('ammo.label')}</ThemedText>
        <TextField
          accessibilityLabel={t('ammo.label')}
          value={label}
          onChangeText={setLabel}
          maxLength={TEXT_LIMITS.ammo_lots.label}
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
          {/* Hidden by Optional Fields (#569) unless this lot already is one. */}
          {(tracked.handloads || lot?.isHandload === 1) && (
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
            // Side by side: both come from the same weight and velocity, so
            // they are two readings of one load rather than two settings.
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

      <PrimaryButton label={t('ammo.save')} onPress={onSave} testID="save-ammo" />

      {otherLots.length > 0 &&
        (merging ? (
          <Card>
            <OptionPicker
              label={t('ammo.mergeInto')}
              options={otherLots.map((other) => ({
                value: other.id,
                label: other.caliber
                  ? t('ammo.lotWithCaliber', { label: other.label, caliber: other.caliber })
                  : other.label,
                testID: `merge-into-${other.label}`,
              }))}
              value={mergeTarget}
              onChange={setMergeTarget}
            />
          </Card>
        ) : (
          <SecondaryButton
            label={t('ammo.mergeInto')}
            onPress={() => setMerging(true)}
            testID="merge-ammo"
          />
        ))}
      <ConfirmSheet
        visible={target !== undefined}
        title={t('ammo.mergeConfirmTitle')}
        body={t('ammo.mergeConfirmBody', {
          count: usage.sessionCount,
          duplicate: lot.label,
          kept: target?.label ?? '',
        })}
        confirmLabel={t('ammo.mergeConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={onConfirmMerge}
        onCancel={() => setMergeTarget(null)}
        destructive
        testID="merge-ammo-confirm"
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
  usage: {
    gap: Spacing.half,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
});
