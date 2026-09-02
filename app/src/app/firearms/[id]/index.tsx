// Firearm detail (§4 M4 §5 /firearms/[id]): weapon groups (federation-scoped,
// one default per group), license register (append-only history + status),
// maintenance (interval, rounds-since indicator, event log, manual adjust).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
import {
  GENERIC_WEAPON_GROUPS,
  licenseExpiryNotifications,
  SPSF_WEAPON_GROUPS,
  shouldNotifyMaintenanceDue,
  weaponGroupCode,
  type WeaponGroup,
} from '@shotledger/shared';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { ListRow } from '@/components/list-row';
import { OptionPicker } from '@/components/option-picker';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { addFirearmGroup, setDefaultFirearmGroup } from '@/db/queries/firearm-groups';
import { updateFirearm } from '@/db/queries/firearms';
import { addLicense } from '@/db/queries/licenses';
import { adjustFirearmRoundCount, logMaintenanceEvent } from '@/db/queries/maintenance-events';
import { useFirearmDetail } from '@/features/firearms/use-firearm-detail';
import { useTheme } from '@/hooks/use-theme';
import {
  notifyMaintenanceDue,
  scheduleLicenseExpiryNotifications,
} from '@/platform/notifications';
import { Spacing } from '@/theme/tokens';

const ALL_GROUPS: readonly WeaponGroup[] = [...SPSF_WEAPON_GROUPS, ...GENERIC_WEAPON_GROUPS];

const MAINTENANCE_TONE: Record<string, 'neutral' | 'primary'> = {
  green: 'neutral',
  amber: 'primary',
  red: 'primary',
};

export default function FirearmDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { detail, refresh } = useFirearmDetail(id);

  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupId, setNewGroupId] = useState<string | null>(null);
  const [newGroupDefault, setNewGroupDefault] = useState(false);

  const [showAddLicense, setShowAddLicense] = useState(false);
  const [licenseNumber, setLicenseNumber] = useState('');
  const [purpose, setPurpose] = useState('');
  const [decidedOn, setDecidedOn] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [conditions, setConditions] = useState('');
  const [authority, setAuthority] = useState('');

  const [showLogEvent, setShowLogEvent] = useState(false);
  const [eventKind, setEventKind] = useState('');
  const [eventNotes, setEventNotes] = useState('');

  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  const [intervalInput, setIntervalInput] = useState<string | null>(null);

  const { firearm } = detail;
  if (!db || !firearm) {
    return (
      <Screen scroll={false}>
        <ThemedText type="title">{t('firearms.detailTitle')}</ThemedText>
      </Screen>
    );
  }

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.border }];
  const usedGroupIds = new Set(detail.groups.map((g) => g.groupId));
  const availableGroups = ALL_GROUPS.filter((g) => !usedGroupIds.has(g.id));
  const intervalValue = intervalInput ?? String(firearm.maintenanceIntervalRounds ?? '');

  function onAddGroup() {
    if (!db || !newGroupId) return;
    addFirearmGroup(db, { firearmId: firearm!.id, groupId: newGroupId, isDefaultForGroup: newGroupDefault });
    setNewGroupId(null);
    setNewGroupDefault(false);
    setShowAddGroup(false);
    refresh();
  }

  function onSetDefaultGroup(groupRowId: string) {
    if (!db) return;
    setDefaultFirearmGroup(db, groupRowId);
    refresh();
  }

  function onAddLicense() {
    if (!db) return;
    const license = addLicense(db, {
      firearmId: firearm!.id,
      licenseNumber: licenseNumber.trim() || null,
      purpose: purpose.trim() || null,
      decidedOn: decidedOn.trim() || null,
      validUntil: validUntil.trim() || null,
      conditions: conditions.trim() || null,
      authority: authority.trim() || null,
    });
    const notifications = licenseExpiryNotifications(license.validUntil);
    void scheduleLicenseExpiryNotifications(license.id, `${firearm!.make} ${firearm!.model}`, notifications);
    setLicenseNumber('');
    setPurpose('');
    setDecidedOn('');
    setValidUntil('');
    setConditions('');
    setAuthority('');
    setShowAddLicense(false);
    refresh();
  }

  function onLogEvent() {
    if (!db || !eventKind.trim()) return;
    logMaintenanceEvent(db, {
      firearmId: firearm!.id,
      performedAt: new Date().toISOString(),
      kind: eventKind.trim(),
      notes: eventNotes.trim() || null,
    });
    setEventKind('');
    setEventNotes('');
    setShowLogEvent(false);
    refresh();
  }

  function onAdjust() {
    if (!db) return;
    const delta = Number(adjustDelta);
    if (!Number.isFinite(delta) || !adjustReason.trim()) return;
    adjustFirearmRoundCount(db, firearm!.id, delta, adjustReason.trim());
    setAdjustDelta('');
    setAdjustReason('');
    setShowAdjust(false);
    refresh();
  }

  function onSaveInterval() {
    if (!db) return;
    const previous = firearm!.roundsSinceMaintenance;
    const interval = intervalInput?.trim() ? Number(intervalInput) : null;
    updateFirearm(db, firearm!.id, {
      maintenanceIntervalRounds: interval && Number.isFinite(interval) ? interval : null,
    });
    if (shouldNotifyMaintenanceDue(0, previous, interval)) {
      void notifyMaintenanceDue(`${firearm!.make} ${firearm!.model}`);
    }
    setIntervalInput(null);
    refresh();
  }

  return (
    <Screen>
      <View>
        <ThemedText type="title">
          {firearm.make} {firearm.model}
        </ThemedText>
        <View style={styles.chipsRow}>
          {firearm.weaponType && (
            <Chip label={t(`firearms.weaponType${capitalize(firearm.weaponType)}`)} />
          )}
          {firearm.caliber && <Chip label={firearm.caliber} />}
          {firearm.vapenId && <Chip label={firearm.vapenId} />}
        </View>
      </View>

      <PrimaryButton
        label={t('common.edit')}
        onPress={() => router.push(`/firearms/${firearm.id}/edit`)}
        testID="edit-firearm"
      />

      <Card>
        <View style={styles.statsRow}>
          <View>
            <ThemedText type="subtitle" testID="round-count">
              {firearm.roundCount}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('firearms.roundCount')}
            </ThemedText>
          </View>
          <View>
            <ThemedText type="subtitle" testID="rounds-since-maintenance">
              {firearm.roundsSinceMaintenance}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('firearms.roundsSinceMaintenance')}
            </ThemedText>
          </View>
        </View>
        {detail.maintenanceStatus !== 'unknown' && (
          <Chip
            testID="maintenance-status"
            label={t(`firearms.maintenanceStatus${capitalize(detail.maintenanceStatus)}`)}
            tone={MAINTENANCE_TONE[detail.maintenanceStatus]}
          />
        )}
      </Card>

      {/* Weapon groups */}
      <Card>
        <ThemedText type="smallBold">{t('firearms.groupsTitle')}</ThemedText>
        {detail.groups.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('firearms.noGroups')}
          </ThemedText>
        ) : (
          detail.groups.map((group) => (
            <ListRow
              key={group.id}
              title={weaponGroupCode(group.groupId)}
              subtitle={group.isDefaultForGroup ? t('firearms.default') : undefined}
              onPress={group.isDefaultForGroup ? undefined : () => onSetDefaultGroup(group.id)}
              testID={`group-${group.groupId}`}
              trailing={
                !group.isDefaultForGroup ? <ThemedText type="small">{t('firearms.setDefault')}</ThemedText> : undefined
              }
            />
          ))
        )}
        {showAddGroup ? (
          <>
            <OptionPicker
              label={t('firearms.group')}
              options={availableGroups.map((g) => ({ value: g.id, label: g.code, testID: `pick-group-${g.id}` }))}
              value={newGroupId}
              onChange={setNewGroupId}
            />
            <View style={styles.switchRow}>
              <ThemedText type="small">{t('firearms.default')}</ThemedText>
              <Switch value={newGroupDefault} onValueChange={setNewGroupDefault} />
            </View>
            <PrimaryButton
              label={t('firearms.addGroup')}
              onPress={onAddGroup}
              disabled={!newGroupId}
              testID="save-group"
            />
          </>
        ) : (
          <PrimaryButton
            label={t('firearms.addGroup')}
            onPress={() => setShowAddGroup(true)}
            testID="add-group"
          />
        )}
      </Card>

      {/* License register */}
      <Card>
        <View style={styles.sectionHeader}>
          <ThemedText type="smallBold">{t('firearms.licenseTitle')}</ThemedText>
          <Chip
            testID="license-status"
            label={t(`firearms.licenseStatus${capitalize(detail.licenseStatus)}`)}
          />
        </View>
        {detail.licenses.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('firearms.noLicenses')}
          </ThemedText>
        ) : (
          detail.licenses.map((license) => (
            <ListRow
              key={license.id}
              title={license.licenseNumber ?? t('firearms.licenseTitle')}
              subtitle={license.validUntil ?? t('firearms.tillsVidare')}
            />
          ))
        )}
        {showAddLicense ? (
          <>
            <ThemedText type="small">{t('firearms.licenseNumber')}</ThemedText>
            <TextInput value={licenseNumber} onChangeText={setLicenseNumber} style={inputStyle} testID="license-number" />
            <ThemedText type="small">{t('firearms.purpose')}</ThemedText>
            <TextInput value={purpose} onChangeText={setPurpose} style={inputStyle} />
            <ThemedText type="small">{t('firearms.decidedOn')}</ThemedText>
            <TextInput
              value={decidedOn}
              onChangeText={setDecidedOn}
              placeholder="YYYY-MM-DD"
              style={inputStyle}
            />
            <ThemedText type="small">{t('firearms.validUntil')}</ThemedText>
            <TextInput
              value={validUntil}
              onChangeText={setValidUntil}
              placeholder="YYYY-MM-DD"
              style={inputStyle}
              testID="license-valid-until"
            />
            <ThemedText type="small">{t('firearms.conditions')}</ThemedText>
            <TextInput value={conditions} onChangeText={setConditions} style={inputStyle} />
            <ThemedText type="small">{t('firearms.authority')}</ThemedText>
            <TextInput value={authority} onChangeText={setAuthority} style={inputStyle} />
            <PrimaryButton label={t('common.save')} onPress={onAddLicense} testID="save-license" />
          </>
        ) : (
          <PrimaryButton
            label={t('firearms.addLicense')}
            onPress={() => setShowAddLicense(true)}
            testID="add-license"
          />
        )}
      </Card>

      {/* Maintenance */}
      <Card>
        <ThemedText type="smallBold">{t('firearms.maintenanceTitle')}</ThemedText>
        <ThemedText type="small">{t('firearms.maintenanceInterval')}</ThemedText>
        <TextInput
          value={intervalValue}
          onChangeText={setIntervalInput}
          keyboardType="number-pad"
          style={inputStyle}
          testID="maintenance-interval"
        />
        <PrimaryButton label={t('common.save')} onPress={onSaveInterval} testID="save-interval" />

        {detail.maintenanceEvents.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('firearms.noMaintenanceEvents')}
          </ThemedText>
        ) : (
          detail.maintenanceEvents.map((event) => (
            <ListRow key={event.id} title={event.kind} subtitle={event.performedAt.slice(0, 10)} />
          ))
        )}

        {showLogEvent ? (
          <>
            <ThemedText type="small">{t('firearms.kind')}</ThemedText>
            <TextInput
              value={eventKind}
              onChangeText={setEventKind}
              placeholder={t('firearms.kindPlaceholder')}
              style={inputStyle}
              testID="event-kind"
            />
            <ThemedText type="small">{t('firearms.notes')}</ThemedText>
            <TextInput value={eventNotes} onChangeText={setEventNotes} style={inputStyle} />
            <PrimaryButton label={t('common.save')} onPress={onLogEvent} testID="save-event" />
          </>
        ) : (
          <PrimaryButton
            label={t('firearms.logEvent')}
            onPress={() => setShowLogEvent(true)}
            testID="log-maintenance"
          />
        )}

        {showAdjust ? (
          <>
            <ThemedText type="small">{t('firearms.adjustDelta')}</ThemedText>
            <TextInput
              value={adjustDelta}
              onChangeText={setAdjustDelta}
              keyboardType="numbers-and-punctuation"
              style={inputStyle}
              testID="adjust-delta"
            />
            <ThemedText type="small">{t('firearms.adjustReason')}</ThemedText>
            <TextInput
              value={adjustReason}
              onChangeText={setAdjustReason}
              placeholder={t('firearms.adjustReasonPlaceholder')}
              style={inputStyle}
              testID="adjust-reason"
            />
            <PrimaryButton label={t('firearms.adjustSave')} onPress={onAdjust} testID="save-adjust" />
          </>
        ) : (
          <PrimaryButton
            label={t('firearms.adjustRoundCount')}
            onPress={() => setShowAdjust(true)}
            testID="adjust-round-count"
          />
        )}
      </Card>
    </Screen>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
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
