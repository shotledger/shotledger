// Ammo lot detail/edit (§4 M4 §5): usage stats (sessions x shots) at top,
// then the same fields as new.tsx, editable in place. No separate detail vs
// edit route — lot-vs-lot comparison stays v3, so a form is the whole screen.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, TextInput, View } from 'react-native';

import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { getAmmoLot, updateAmmoLot } from '@/db/queries/ammo-lots';
import { getAmmoLotUsage } from '@/db/queries/ammo-usage';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme/tokens';

function numberOrNull(value: string): number | null {
  const n = Number(value);
  return value.trim() && Number.isFinite(n) ? n : null;
}

export default function AmmoLotDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const lot = db ? getAmmoLot(db, id) : undefined;
  const usage = db && lot ? getAmmoLotUsage(db, lot.id) : { sessionCount: 0, shotCount: 0 };

  const [label, setLabel] = useState(lot?.label ?? '');
  const [caliber, setCaliber] = useState(lot?.caliber ?? '');
  const [quantity, setQuantity] = useState(lot?.quantity != null ? String(lot.quantity) : '');
  const [purchasedOn, setPurchasedOn] = useState(lot?.purchasedOn ?? '');
  const [isHandload, setIsHandload] = useState(lot?.isHandload === 1);
  const [brand, setBrand] = useState(lot?.brand ?? '');
  const [product, setProduct] = useState(lot?.product ?? '');
  const [lotNumber, setLotNumber] = useState(lot?.lotNumber ?? '');
  const [bulletMake, setBulletMake] = useState(lot?.bulletMake ?? '');
  const [bulletModel, setBulletModel] = useState(lot?.bulletModel ?? '');
  const [bulletWeightGr, setBulletWeightGr] = useState(
    lot?.bulletWeightGr != null ? String(lot.bulletWeightGr) : '',
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

  if (!db || !lot) {
    return (
      <Screen scroll={false}>
        <ThemedText type="title">{t('ammo.editLot')}</ThemedText>
      </Screen>
    );
  }

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.border }];

  function onSave() {
    if (!db || !lot) return;
    updateAmmoLot(db, lot.id, {
      label: label.trim(),
      caliber: caliber.trim() || null,
      quantity: numberOrNull(quantity),
      purchasedOn: purchasedOn.trim() || null,
      isHandload,
      brand: isHandload ? null : brand.trim() || null,
      product: isHandload ? null : product.trim() || null,
      lotNumber: isHandload ? null : lotNumber.trim() || null,
      bulletMake: bulletMake.trim() || null,
      bulletModel: bulletModel.trim() || null,
      bulletWeightGr: numberOrNull(bulletWeightGr),
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
        <ThemedText type="smallBold">{t('ammo.usage')}</ThemedText>
        <ThemedText testID="ammo-usage">
          {t('ammo.usageCount', { sessions: usage.sessionCount, shots: usage.shotCount })}
        </ThemedText>
      </Card>

      <Card>
        <ThemedText type="smallBold">{t('ammo.label')}</ThemedText>
        <TextInput value={label} onChangeText={setLabel} style={inputStyle} />
        <ThemedText type="smallBold">{t('ammo.caliber')}</ThemedText>
        <TextInput value={caliber} onChangeText={setCaliber} style={inputStyle} />
        <ThemedText type="smallBold">{t('ammo.quantity')}</ThemedText>
        <TextInput value={quantity} onChangeText={setQuantity} keyboardType="number-pad" style={inputStyle} />
        <ThemedText type="smallBold">{t('ammo.purchasedOn')}</ThemedText>
        <TextInput value={purchasedOn} onChangeText={setPurchasedOn} style={inputStyle} />
        <View style={styles.switchRow}>
          <ThemedText type="small">{t('ammo.isHandload')}</ThemedText>
          <Switch value={isHandload} onValueChange={setIsHandload} />
        </View>
      </Card>

      {!isHandload && (
        <Card>
          <ThemedText type="smallBold">{t('ammo.brand')}</ThemedText>
          <TextInput value={brand} onChangeText={setBrand} style={inputStyle} />
          <ThemedText type="smallBold">{t('ammo.product')}</ThemedText>
          <TextInput value={product} onChangeText={setProduct} style={inputStyle} />
          <ThemedText type="smallBold">{t('ammo.lotNumber')}</ThemedText>
          <TextInput value={lotNumber} onChangeText={setLotNumber} style={inputStyle} />
        </Card>
      )}

      <Card>
        <ThemedText type="smallBold">{t('ammo.bulletMake')}</ThemedText>
        <TextInput value={bulletMake} onChangeText={setBulletMake} style={inputStyle} />
        <ThemedText type="smallBold">{t('ammo.bulletModel')}</ThemedText>
        <TextInput value={bulletModel} onChangeText={setBulletModel} style={inputStyle} />
        <ThemedText type="smallBold">{t('ammo.bulletWeightGr')}</ThemedText>
        <TextInput
          value={bulletWeightGr}
          onChangeText={setBulletWeightGr}
          keyboardType="decimal-pad"
          style={inputStyle}
        />
      </Card>

      {isHandload && (
        <Card>
          <ThemedText type="smallBold">{t('ammo.recipeTitle')}</ThemedText>
          <ThemedText type="small">{t('ammo.powder')}</ThemedText>
          <TextInput value={powder} onChangeText={setPowder} style={inputStyle} />
          <ThemedText type="small">{t('ammo.powderChargeGr')}</ThemedText>
          <TextInput
            value={powderChargeGr}
            onChangeText={setPowderChargeGr}
            keyboardType="decimal-pad"
            style={inputStyle}
          />
          <ThemedText type="small">{t('ammo.primer')}</ThemedText>
          <TextInput value={primer} onChangeText={setPrimer} style={inputStyle} />
          <ThemedText type="small">{t('ammo.brass')}</ThemedText>
          <TextInput value={brass} onChangeText={setBrass} style={inputStyle} />
          <ThemedText type="small">{t('ammo.colMm')}</ThemedText>
          <TextInput value={colMm} onChangeText={setColMm} keyboardType="decimal-pad" style={inputStyle} />
          <ThemedText type="small">{t('ammo.crimpMm')}</ThemedText>
          <TextInput value={crimpMm} onChangeText={setCrimpMm} keyboardType="decimal-pad" style={inputStyle} />
        </Card>
      )}

      <Card>
        <ThemedText type="smallBold">{t('ammo.notes')}</ThemedText>
        <TextInput value={notes} onChangeText={setNotes} style={inputStyle} multiline />
      </Card>

      <PrimaryButton label={t('ammo.save')} onPress={onSave} testID="save-ammo" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
});
