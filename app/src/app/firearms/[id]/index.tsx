// Firearm detail (§4 M4 §5 /firearms/[id]): weapon groups (federation-scoped,
// one default per group), sight settings (#114: free-text label, click
// counts, turns-to-switch from the currently active one), license register
// (append-only history + status), maintenance (interval, rounds-since
// indicator, event log, manual adjust).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import {
  canonicalCaliber,
  licenseExpiryNotifications,
  resolveActiveSightSetting,
  selectableWeaponGroups,
  shouldNotifyMaintenanceDue,
  sightTurnsBetween,
  weaponGroupLabel,
  type ParsedLicenseCard,
  type WeaponGroup,
} from '@shotledger/shared';

import { ScreenTitle } from '@/components/screen-title';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { InfoButton } from '@/components/info-button';
import { ListRow } from '@/components/list-row';
import { OptionPicker } from '@/components/option-picker';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { Slider } from '@/components/slider';
import { formatLocalDate } from '@/features/session/labels';
import { Stepper } from '@/components/stepper';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { addFirearmGroup, setDefaultFirearmGroup } from '@/db/queries/firearm-groups';
import { updateFirearm } from '@/db/queries/firearms';
import { addLicense } from '@/db/queries/licenses';
import { adjustFirearmRoundCount, logMaintenanceEvent } from '@/db/queries/maintenance-events';
import {
  createSightSetting,
  setActiveSightSetting,
  softDeleteSightSetting,
  updateSightSetting,
} from '@/db/queries/sight-settings';
import { useComplianceProfile } from '@/features/compliance/use-compliance-profile';
import { useFirearmDetail } from '@/features/firearms/use-firearm-detail';
import {
  SIGHT_CLICK_MAX,
  SIGHT_CLICK_MIN,
  SIGHT_SLIDER_WINDOW_STEP,
  expandedSightWindow,
  sightClicksForSave,
} from '@/features/firearms/sight-clicks';
import {
  sightClicksDirectionText,
  sightClicksText,
  sightTurnsText,
} from '@/features/firearms/sight-turns-text';
import {
  countRecognizedFields,
  licenseFormValues,
  scanLicenseCard,
  type ScanSource,
} from '@/features/licenses/scan-license-card';
import { notifyMaintenanceDue, scheduleLicenseExpiryNotifications } from '@/platform/notifications';
import { deleteScannedImage } from '@/platform/text-recognition';
import { Spacing } from '@/theme/tokens';

/** Only groups a session can actually be logged under — see
 *  `selectableWeaponGroups`. Offering M1-M9 here would promise a
 *  Magnumprecision session the app cannot create yet. */
const ALL_GROUPS: readonly WeaponGroup[] = selectableWeaponGroups();

/** ML Kit is a native module (platform/text-recognition.web.ts is a stub), so
 *  the web preview shows the manual form only. */
const SCAN_SUPPORTED = Platform.OS !== 'web';

/** Card-scan progress for the licence form. `error.reason` maps 1:1 to a
 *  `firearms.scan*` string, so the screen never composes a message. */
type ScanState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'error'; reason: 'denied' | 'failed' | 'unsupported' | 'nothing' }
  | { status: 'done'; count: number; parsed: ParsedLicenseCard };

const LICENCE_ACTIVITY_TONE: Record<string, 'neutral' | 'primary'> = {
  green: 'neutral',
  amber: 'primary',
  red: 'primary',
};

const MAINTENANCE_TONE: Record<string, 'neutral' | 'primary'> = {
  green: 'neutral',
  amber: 'primary',
  red: 'primary',
};

export default function FirearmDetailScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useComplianceProfile();
  const { detail, refresh } = useFirearmDetail(id, profile);

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

  const [scan, setScan] = useState<ScanState>({ status: 'idle' });
  const [scannedImageUri, setScannedImageUri] = useState<string | null>(null);
  const [applyFirearmDetails, setApplyFirearmDetails] = useState(false);

  const [showLogEvent, setShowLogEvent] = useState(false);
  const [eventKind, setEventKind] = useState('');
  const [eventNotes, setEventNotes] = useState('');
  // `performed_at` has always been required by the column; the form simply
  // never offered it, so everything was stamped "now" and work done last week
  // could not be logged truthfully (#138).
  const [eventPerformedAt, setEventPerformedAt] = useState(() => new Date().toISOString());
  const [eventDatePickerOpen, setEventDatePickerOpen] = useState(false);

  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  const [intervalInput, setIntervalInput] = useState<string | null>(null);

  const [showSightForm, setShowSightForm] = useState(false);
  const [editingSightId, setEditingSightId] = useState<string | null>(null);
  const [sightLabel, setSightLabel] = useState('');
  // `null` is "not recorded" — the columns are nullable and the stepper keeps
  // that state reachable.
  const [sightElevation, setSightElevation] = useState<number | null>(null);
  const [sightWindage, setSightWindage] = useState<number | null>(null);
  // The slider's visible range grows with the value and never shrinks while
  // one setting is being edited — see expandedSightWindow.
  const [windageWindow, setWindageWindow] = useState(SIGHT_SLIDER_WINDOW_STEP);
  const [sightNotes, setSightNotes] = useState('');

  const { firearm } = detail;
  if (!db || !firearm) {
    return (
      <Screen scroll={false}>
        <ScreenTitle>{t('firearms.detailTitle')}</ScreenTitle>
      </Screen>
    );
  }

  const usedGroupIds = new Set(detail.groups.map((g) => g.groupId));
  const availableGroups = ALL_GROUPS.filter((g) => !usedGroupIds.has(g.id));
  const newGroupLabel = availableGroups.find((g) => g.id === newGroupId)?.label ?? null;
  const intervalValue = intervalInput ?? String(firearm.maintenanceIntervalRounds ?? '');
  const currentSightSetting = resolveActiveSightSetting(detail.sightSettings);
  const editingIsCurrentSightSetting =
    editingSightId != null && currentSightSetting?.id === editingSightId;

  function onAddGroup() {
    if (!db || !newGroupId) return;
    addFirearmGroup(db, {
      firearmId: firearm!.id,
      groupId: newGroupId,
      isDefaultForGroup: newGroupDefault,
    });
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

  /**
   * Pick, recognise, parse — then pre-fill. Nothing reaches the database
   * here: the parse only fills the form's inputs, which the user edits and
   * confirms with the existing Save button.
   */
  async function onScanCard(source: ScanSource) {
    setScan({ status: 'busy' });
    const previous = scannedImageUri;
    const result = await scanLicenseCard(source);
    if (previous) void deleteScannedImage(previous);
    setScannedImageUri(null);

    if (result.status === 'cancelled') return setScan({ status: 'idle' });
    if (result.status !== 'scanned') return setScan({ status: 'error', reason: result.status });

    const count = countRecognizedFields(result.parsed);
    if (count === 0) {
      void deleteScannedImage(result.imageUri);
      return setScan({ status: 'error', reason: 'nothing' });
    }

    const next = licenseFormValues(result.parsed, {
      licenseNumber,
      purpose,
      decidedOn,
      validUntil,
      conditions,
      authority,
    });
    setLicenseNumber(next.licenseNumber);
    setPurpose(next.purpose);
    setDecidedOn(next.decidedOn);
    setValidUntil(next.validUntil);
    setConditions(next.conditions);
    setAuthority(next.authority);
    setScannedImageUri(result.imageUri);
    setScan({ status: 'done', count, parsed: result.parsed });
  }

  function resetScan() {
    setScan({ status: 'idle' });
    setScannedImageUri(null);
    setApplyFirearmDetails(false);
  }

  async function onAddLicense() {
    if (!db) return;
    // The scan only ever fed the form; the image itself is not kept.
    const uri = scannedImageUri;
    if (uri) {
      void deleteScannedImage(uri);
      setScannedImageUri(null);
    }

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
    void scheduleLicenseExpiryNotifications(
      license.id,
      `${firearm!.make} ${firearm!.model}`,
      notifications,
    );

    // The card also carries the firearm's own identity; applying it is the
    // user's separate, opt-in confirmation.
    if (applyFirearmDetails && scan.status === 'done') {
      const { make, model, caliber, vapenId } = scan.parsed;
      // The card writes the caliber however the authority spelled it; store
      // the preset it means so it matches what the picker offers.
      const canonical = canonicalCaliber(caliber) ?? caliber;
      updateFirearm(db, firearm!.id, {
        ...(make ? { make } : {}),
        ...(model ? { model } : {}),
        ...(canonical ? { caliber: canonical } : {}),
        ...(vapenId ? { vapenId } : {}),
      });
    }

    setLicenseNumber('');
    setPurpose('');
    setDecidedOn('');
    setValidUntil('');
    setConditions('');
    setAuthority('');
    setShowAddLicense(false);
    resetScan();
    refresh();
  }

  function onLogEvent() {
    if (!db || !eventKind.trim()) return;
    logMaintenanceEvent(db, {
      firearmId: firearm!.id,
      performedAt: eventPerformedAt,
      kind: eventKind.trim(),
      notes: eventNotes.trim() || null,
    });
    setEventKind('');
    setEventNotes('');
    setEventPerformedAt(new Date().toISOString());
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

  function onAddSightSetting() {
    setEditingSightId(null);
    setSightLabel('');
    setSightElevation(null);
    setSightWindage(null);
    setWindageWindow(SIGHT_SLIDER_WINDOW_STEP);
    setSightNotes('');
    setShowSightForm(true);
  }

  function onEditSightSetting(setting: (typeof detail.sightSettings)[number]) {
    setEditingSightId(setting.id);
    setSightLabel(setting.label);
    setSightElevation(setting.elevationClicks ?? null);
    setSightWindage(setting.windageClicks ?? null);
    setWindageWindow(expandedSightWindow(SIGHT_SLIDER_WINDOW_STEP, setting.windageClicks ?? null));
    setSightNotes(setting.notes ?? '');
    setShowSightForm(true);
  }

  function closeSightForm() {
    setShowSightForm(false);
    setEditingSightId(null);
  }

  function onSaveSightSetting() {
    if (!db || !sightLabel.trim()) return;
    const elevationClicks = sightClicksForSave(sightElevation);
    const windageClicks = sightClicksForSave(sightWindage);
    const notes = sightNotes.trim() || null;
    if (editingSightId) {
      updateSightSetting(db, editingSightId, {
        label: sightLabel.trim(),
        elevationClicks,
        windageClicks,
        notes,
      });
    } else {
      createSightSetting(db, {
        firearmId: firearm!.id,
        label: sightLabel.trim(),
        elevationClicks,
        windageClicks,
        notes,
      });
    }
    closeSightForm();
    refresh();
  }

  function onSetCurrentSightSetting() {
    if (!db || !editingSightId) return;
    setActiveSightSetting(db, firearm!.id, editingSightId);
    closeSightForm();
    refresh();
  }

  function onDeleteSightSetting() {
    if (!db || !editingSightId) return;
    softDeleteSightSetting(db, editingSightId);
    closeSightForm();
    refresh();
  }

  return (
    <Screen>
      <View>
        <ScreenTitle>
          {firearm.make} {firearm.model}
        </ScreenTitle>
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

      {/* M6 (§6.6): hidden entirely when the compliance profile is 'none'. */}
      {profile && detail.licenceActivities.length > 0 && (
        <Card>
          <ThemedText type="smallBold">{t('compliance.licenceActivityTitle')}</ThemedText>
          <View style={styles.chipsRow}>
            {detail.licenceActivities.map((b) => (
              <Chip
                key={b.weaponGroups.join(',')}
                testID={`firearm-barometer-${b.weaponGroups[0]}`}
                label={t(`compliance.licenceActivity${capitalize(b.status)}`, {
                  count: b.activityCount,
                  required: b.requiredActivities,
                })}
                tone={LICENCE_ACTIVITY_TONE[b.status]}
              />
            ))}
          </View>
          {detail.licenceActivities.map((b) => (
            <ThemedText
              key={`detail-${b.weaponGroups.join(',')}`}
              type="small"
              themeColor="textSecondary"
              testID={`firearm-barometer-detail-${b.weaponGroups[0]}`}
            >
              {t('compliance.licenceActivityDetail', {
                done: b.activityCount,
                required: b.requiredActivities,
                months: b.windowMonths,
              })}
            </ThemedText>
          ))}
          {/* Which case is in effect is never silently applied — it is on
              screen wherever the number it produced is. */}
          <ThemedText type="small" themeColor="textSecondary" testID="compliance-barometer-case">
            {t(`compliance.licenceActivityCase.${profile.variantId}`)}
          </ThemedText>
          {!profile.verified && (
            <ThemedText type="small" themeColor="textSecondary" testID="compliance-unverified-hint">
              {t('compliance.unverifiedHint')}
            </ThemedText>
          )}
        </Card>
      )}

      {/* Weapon groups */}
      <Card>
        <View style={styles.sectionHeader}>
          <ThemedText type="smallBold" style={styles.headerLabel}>
            {t('firearms.groupsTitle')}
          </ThemedText>
          <InfoButton
            title={t('firearms.groupsTitle')}
            body={t('firearms.groupsHint')}
            testID="groups-info"
          />
        </View>
        {detail.groups.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('firearms.noGroups')}
          </ThemedText>
        ) : (
          detail.groups.map((group) => (
            <ListRow
              key={group.id}
              title={weaponGroupLabel(group.groupId)}
              // Scoped on purpose: a firearm can be the default for several
              // groups, so two rows each reading a bare "Default" looked like
              // a bug (maintainer, third review).
              subtitle={
                group.isDefaultForGroup
                  ? t('firearms.defaultForGroup', { group: weaponGroupLabel(group.groupId) })
                  : undefined
              }
              onPress={group.isDefaultForGroup ? undefined : () => onSetDefaultGroup(group.id)}
              testID={`group-${group.groupId}`}
              trailing={
                !group.isDefaultForGroup ? (
                  <ThemedText type="small">{t('firearms.setDefault')}</ThemedText>
                ) : undefined
              }
            />
          ))
        )}
        {showAddGroup ? (
          <>
            <OptionPicker
              label={t('firearms.group')}
              options={availableGroups.map((g) => ({
                value: g.id,
                label: g.label,
                testID: `pick-group-${g.id}`,
              }))}
              value={newGroupId}
              onChange={setNewGroupId}
            />
            <View style={styles.switchRow}>
              <ThemedText type="small">
                {newGroupLabel
                  ? t('firearms.defaultForGroup', { group: newGroupLabel })
                  : t('firearms.defaultForThisGroup')}
              </ThemedText>
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

      {/* Sight settings (#114) */}
      <Card>
        <View style={styles.sectionHeader}>
          <ThemedText type="smallBold" style={styles.headerLabel}>
            {t('firearms.sightSettingsTitle')}
          </ThemedText>
          <InfoButton
            title={t('firearms.sightSettingsTitle')}
            body={t('firearms.sightSettingsHint')}
            testID="sight-settings-info"
          />
        </View>
        {detail.sightSettings.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('firearms.noSightSettings')}
          </ThemedText>
        ) : (
          detail.sightSettings.map((setting) => {
            const isCurrent = currentSightSetting?.id === setting.id;
            const summary = t('firearms.sightSummary', {
              elevation: sightClicksText(setting.elevationClicks),
              windage: sightClicksText(setting.windageClicks),
            });
            const turns = isCurrent
              ? ''
              : sightTurnsText(t, sightTurnsBetween(currentSightSetting, setting));
            return (
              <ListRow
                key={setting.id}
                title={setting.label}
                subtitle={
                  turns ? `${summary}\n${t('firearms.sightSwitchHint', { turns })}` : summary
                }
                trailing={
                  isCurrent ? <Chip label={t('firearms.sightCurrent')} tone="primary" /> : undefined
                }
                onPress={() => onEditSightSetting(setting)}
                testID={`sight-row-${setting.id}`}
              />
            );
          })
        )}
        {showSightForm ? (
          <>
            <ThemedText type="small">{t('firearms.sightLabel')}</ThemedText>
            <TextField
              value={sightLabel}
              onChangeText={setSightLabel}
              placeholder={t('firearms.sightLabelPlaceholder')}
              testID="sight-label"
            />
            <View style={styles.sectionHeader}>
              <ThemedText type="small" style={styles.headerLabel}>
                {t('firearms.sightElevation')}
              </ThemedText>
              <InfoButton
                title={t('firearms.sightElevation')}
                body={t('firearms.sightElevationHint')}
                testID="sight-elevation-info"
              />
            </View>
            <Stepper
              value={sightElevation}
              onChange={setSightElevation}
              min={SIGHT_CLICK_MIN}
              max={SIGHT_CLICK_MAX}
              decrementLabel={t('firearms.sightElevationDecrease')}
              incrementLabel={t('firearms.sightElevationIncrease')}
              clearLabel={t('firearms.sightClicksClear')}
              format={(clicks) =>
                clicks === null
                  ? t('firearms.sightClicksNotRecorded')
                  : sightClicksDirectionText(t, clicks, 'elevation')
              }
              testID="sight-elevation"
            />
            <View style={styles.sectionHeader}>
              <ThemedText type="small" style={styles.headerLabel}>
                {t('firearms.sightWindage')}
              </ThemedText>
              <InfoButton
                title={t('firearms.sightWindage')}
                body={t('firearms.sightWindageHint')}
                testID="sight-windage-info"
              />
            </View>
            {/* Slider trial (#138): windage only, so it can be compared
                against the elevation stepper directly above it. */}
            <View style={styles.sectionHeader}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('firearms.sightWindageRange', { value: windageWindow })}
              </ThemedText>
              <ThemedText type="smallBold" testID="sight-windage-value">
                {sightWindage === null
                  ? t('firearms.sightClicksNotRecorded')
                  : sightClicksDirectionText(t, sightWindage, 'windage')}
              </ThemedText>
            </View>
            <Slider
              value={sightWindage ?? 0}
              min={-windageWindow}
              max={windageWindow}
              onChange={(clicks) => {
                setSightWindage(clicks);
                setWindageWindow((current) => expandedSightWindow(current, clicks));
              }}
              accessibilityLabel={t('firearms.sightWindage')}
              testID="sight-windage"
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setSightWindage(null)}
              disabled={sightWindage === null}
              testID="sight-windage-clear"
            >
              <ThemedText
                type="small"
                themeColor={sightWindage === null ? 'textSecondary' : 'primary'}
              >
                {t('firearms.sightClicksClear')}
              </ThemedText>
            </Pressable>
            <ThemedText type="small">{t('firearms.notes')}</ThemedText>
            <TextField value={sightNotes} onChangeText={setSightNotes} testID="sight-notes" />
            <PrimaryButton
              label={t('common.save')}
              onPress={onSaveSightSetting}
              testID="save-sight-setting"
            />
            {editingSightId && !editingIsCurrentSightSetting ? (
              <PrimaryButton
                label={t('firearms.sightSetCurrent')}
                onPress={onSetCurrentSightSetting}
                testID="sight-set-current"
              />
            ) : null}
            {editingSightId ? (
              <PrimaryButton
                label={t('firearms.sightDelete')}
                onPress={onDeleteSightSetting}
                testID="sight-delete"
              />
            ) : null}
          </>
        ) : (
          <PrimaryButton
            label={t('firearms.addSightSetting')}
            onPress={onAddSightSetting}
            testID="add-sight-setting"
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
              testID={`license-${license.id}`}
            />
          ))
        )}
        {showAddLicense ? (
          <>
            {SCAN_SUPPORTED ? (
              <>
                <ThemedText type="smallBold">{t('firearms.scanTitle')}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('firearms.scanHint')}
                </ThemedText>
                <PrimaryButton
                  label={t('firearms.scanFromCamera')}
                  onPress={() => void onScanCard('camera')}
                  disabled={scan.status === 'busy'}
                  testID="scan-card-camera"
                />
                <PrimaryButton
                  label={t('firearms.scanFromLibrary')}
                  onPress={() => void onScanCard('library')}
                  disabled={scan.status === 'busy'}
                  testID="scan-card-library"
                />
                {scan.status === 'busy' ? (
                  <ThemedText type="small" themeColor="textSecondary" testID="scan-busy">
                    {t('firearms.scanBusy')}
                  </ThemedText>
                ) : null}
                {scan.status === 'error' ? (
                  <ThemedText type="small" themeColor="danger" testID="scan-error">
                    {t(`firearms.scanError${capitalize(scan.reason)}`)}
                  </ThemedText>
                ) : null}
                {scan.status === 'done' ? (
                  <>
                    <ThemedText type="small" testID="scan-result">
                      {t('firearms.scanRecognized', { recognized: scan.count })}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('firearms.scanCheckNotice')}
                    </ThemedText>
                    {scanFirearmSummary(scan.parsed) ? (
                      <View style={styles.switchRow}>
                        <ThemedText type="small" testID="scan-firearm-summary">
                          {t('firearms.scanApplyFirearm', {
                            details: scanFirearmSummary(scan.parsed),
                          })}
                        </ThemedText>
                        <Switch
                          value={applyFirearmDetails}
                          onValueChange={setApplyFirearmDetails}
                          testID="scan-apply-firearm"
                        />
                      </View>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
            <ThemedText type="small">{t('firearms.licenseNumber')}</ThemedText>
            <TextField
              value={licenseNumber}
              onChangeText={setLicenseNumber}
              testID="license-number"
            />
            <ThemedText type="small">{t('firearms.purpose')}</ThemedText>
            <TextField value={purpose} onChangeText={setPurpose} />
            <ThemedText type="small">{t('firearms.decidedOn')}</ThemedText>
            <TextField value={decidedOn} onChangeText={setDecidedOn} placeholder="YYYY-MM-DD" />
            <ThemedText type="small">{t('firearms.validUntil')}</ThemedText>
            <TextField
              value={validUntil}
              onChangeText={setValidUntil}
              placeholder="YYYY-MM-DD"
              testID="license-valid-until"
            />
            <ThemedText type="small">{t('firearms.conditions')}</ThemedText>
            <TextField value={conditions} onChangeText={setConditions} />
            <ThemedText type="small">{t('firearms.authority')}</ThemedText>
            <TextField value={authority} onChangeText={setAuthority} />
            <PrimaryButton
              label={t('common.save')}
              onPress={() => void onAddLicense()}
              testID="save-license"
            />
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
        <TextField
          value={intervalValue}
          onChangeText={setIntervalInput}
          keyboardType="number-pad"
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
            <ThemedText type="small">{t('firearms.eventDate')}</ThemedText>
            <PrimaryButton
              label={formatLocalDate(eventPerformedAt, i18n.language)}
              onPress={() => setEventDatePickerOpen(true)}
              testID="event-date"
            />
            {eventDatePickerOpen && (
              <DateTimePicker
                testID="event-date-picker"
                value={new Date(eventPerformedAt)}
                mode="date"
                maximumDate={new Date()}
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(_event, selected) => {
                  setEventDatePickerOpen(false);
                  if (selected) setEventPerformedAt(selected.toISOString());
                }}
              />
            )}
            <ThemedText type="small">{t('firearms.kind')}</ThemedText>
            <TextField
              value={eventKind}
              onChangeText={setEventKind}
              placeholder={t('firearms.kindPlaceholder')}
              testID="event-kind"
            />
            <ThemedText type="small">{t('firearms.notes')}</ThemedText>
            <TextField value={eventNotes} onChangeText={setEventNotes} />
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
            <TextField
              value={adjustDelta}
              onChangeText={setAdjustDelta}
              keyboardType="numbers-and-punctuation"
              testID="adjust-delta"
            />
            <ThemedText type="small">{t('firearms.adjustReason')}</ThemedText>
            <TextField
              value={adjustReason}
              onChangeText={setAdjustReason}
              placeholder={t('firearms.adjustReasonPlaceholder')}
              testID="adjust-reason"
            />
            <PrimaryButton
              label={t('firearms.adjustSave')}
              onPress={onAdjust}
              testID="save-adjust"
            />
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

/** The firearm identity the card carried, for the "also update the firearm"
 *  row. Empty when the card gave none — the row is then not offered. */
function scanFirearmSummary(parsed: ParsedLicenseCard): string {
  return [parsed.make, parsed.model, parsed.caliber, parsed.vapenId].filter(Boolean).join(' · ');
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
  headerLabel: {
    flexShrink: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
});
