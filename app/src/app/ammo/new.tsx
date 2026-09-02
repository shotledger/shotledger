// New ammo lot form (§4 M4): factory fields always shown; the handload
// recipe section (powder/charge/primer/brass/COL/crimp) toggles with
// isHandload (§3).
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, TextInput, View } from 'react-native';

import { Card } from '@/components/card';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { createAmmoLot } from '@/db/queries/ammo-lots';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme/tokens';

function numberOrNull(value: string): number | null {
  const n = Number(value);
  return value.trim() && Number.isFinite(n) ? n : null;
}

export default function NewAmmoLotScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();

  const [label, setLabel] = useState('');
  const [caliber, setCaliber] = useState('');
  const [quantity, setQuantity] = useState('');
  const [purchasedOn, setPurchasedOn] = useState('');
  const [isHandload, setIsHandload] = useState(false);

  const [brand, setBrand] = useState('');
  const [product, setProduct] = useState('');
  const [lotNumber, setLotNumber] = useState('');

  const [bulletMake, setBulletMake] = useState('');
  const [bulletModel, setBulletModel] = useState('');
  const [bulletWeightGr, setBulletWeightGr] = useState('');

  const [powder, setPowder] = useState('');
  const [powderChargeGr, setPowderChargeGr] = useState('');
  const [primer, setPrimer] = useState('');
  const [brass, setBrass] = useState('');
  const [colMm, setColMm] = useState('');
  const [crimpMm, setCrimpMm] = useState('');
  const [notes, setNotes] = useState('');

  const canCreate = label.trim().length > 0;
  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.border }];

  function onCreate() {
    if (!db || !canCreate) return;
    createAmmoLot(db, {
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
        <ThemedText type="smallBold">{t('ammo.label')}</ThemedText>
        <TextInput value={label} onChangeText={setLabel} style={inputStyle} testID="ammo-label" />
        <ThemedText type="smallBold">{t('ammo.caliber')}</ThemedText>
        <TextInput value={caliber} onChangeText={setCaliber} style={inputStyle} />
        <ThemedText type="smallBold">{t('ammo.quantity')}</ThemedText>
        <TextInput
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="number-pad"
          style={inputStyle}
        />
        <ThemedText type="smallBold">{t('ammo.purchasedOn')}</ThemedText>
        <TextInput
          value={purchasedOn}
          onChangeText={setPurchasedOn}
          placeholder="YYYY-MM-DD"
          style={inputStyle}
        />
        <View style={styles.switchRow}>
          <ThemedText type="small">{t('ammo.isHandload')}</ThemedText>
          <Switch value={isHandload} onValueChange={setIsHandload} testID="handload-toggle" />
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
        <Card testID="handload-recipe">
          <ThemedText type="smallBold">{t('ammo.recipeTitle')}</ThemedText>
          <ThemedText type="small">{t('ammo.powder')}</ThemedText>
          <TextInput
            value={powder}
            onChangeText={setPowder}
            style={inputStyle}
            testID="ammo-powder"
          />
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
          <TextInput
            value={colMm}
            onChangeText={setColMm}
            keyboardType="decimal-pad"
            style={inputStyle}
          />
          <ThemedText type="small">{t('ammo.crimpMm')}</ThemedText>
          <TextInput
            value={crimpMm}
            onChangeText={setCrimpMm}
            keyboardType="decimal-pad"
            style={inputStyle}
          />
        </Card>
      )}

      <Card>
        <ThemedText type="smallBold">{t('ammo.notes')}</ThemedText>
        <TextInput value={notes} onChangeText={setNotes} style={inputStyle} multiline />
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
