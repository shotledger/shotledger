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
  parseLocalDay,
  resolveActiveSightSetting,
  selectableWeaponGroups,
  shouldNotifyMaintenanceDue,
  sightTurnsBetween,
  weaponGroupLabel,
  type ParsedLicenseCard,
  type WeaponGroup,
  TEXT_LIMITS,
} from '@shotledger/shared';

import { ScreenTitle } from '@/components/screen-title';
import { CaliberPicker } from '@/components/caliber-picker';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { InfoButton } from '@/components/info-button';
import { ListRow } from '@/components/list-row';
import { OptionPicker } from '@/components/option-picker';
import { PrimaryButton } from '@/components/primary-button';
import { SecondaryButton } from '@/components/secondary-button';
import { TextButton } from '@/components/text-button';
import { Screen } from '@/components/screen';
import { Slider } from '@/components/slider';
import { licenseActivityKey } from '@/features/compliance/activity-key';
import { nextSessionDeadline } from '@/features/compliance/next-session';
import { missingFirearmFields, requiresLicense } from '@/features/firearms/completeness';
import { Stepper } from '@/components/stepper';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { addFirearmCaliber, softDeleteFirearmCaliber } from '@/db/queries/firearm-calibers';
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
import {
  archiveFirearmAndReminders,
  restoreFirearmAndReminders,
} from '@/features/firearms/archive-firearm';
import {
  maintenanceEventLines,
  maintenanceEventTitle,
} from '@/features/firearms/maintenance-event-lines';
import {
  parseMaintenanceInterval,
  parseRoundAdjustment,
  roundAdjustmentErrors,
} from '@/features/firearms/round-adjustment';
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
import { useDateFormat } from '@/features/dates/use-date-format';

/** Only groups a session can actually be logged under — see
 *  `selectableWeaponGroups`. */
const ALL_GROUPS: readonly WeaponGroup[] = selectableWeaponGroups();

/** ML Kit is a native module (platform/text-recognition.web.ts is a stub), so
 *  the web preview shows the manual form only. */
const SCAN_SUPPORTED = Platform.OS !== 'web';

/** Card-scan progress for the license form. `error.reason` maps 1:1 to a
 *  `firearms.scan*` string, so the screen never composes a message. */
type ScanState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'error'; reason: 'denied' | 'failed' | 'unsupported' | 'nothing' }
  | { status: 'done'; count: number; parsed: ParsedLicenseCard };

const LICENSE_ACTIVITY_TONE: Record<string, 'neutral' | 'primary'> = {
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
  const { t } = useTranslation();
  const dates = useDateFormat();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useComplianceProfile();
  const { detail, refresh } = useFirearmDetail(id, profile);

  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupId, setNewGroupId] = useState<string | null>(null);
  const [newGroupDefault, setNewGroupDefault] = useState(false);

  const [showAddCaliber, setShowAddCaliber] = useState(false);
  const [newCaliber, setNewCaliber] = useState<string | null>(null);

  const [showAddLicense, setShowAddLicense] = useState(false);
  const [licenseNumber, setLicenseNumber] = useState('');
  const [purpose, setPurpose] = useState('');
  const [decidedOn, setDecidedOn] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [conditions, setConditions] = useState('');
  const [authority, setAuthority] = useState('');
  // Empty is "tills vidare"; anything else must be a real YYYY-MM-DD, or the
  // license would read expired and schedule no reminders.
  const validUntilInvalid = validUntil.trim() !== '' && parseLocalDay(validUntil.trim()) === null;
  const [licenseSaveAttempted, setLicenseSaveAttempted] = useState(false);

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
  const [adjustAttempted, setAdjustAttempted] = useState(false);

  const [intervalInput, setIntervalInput] = useState<string | null>(null);
  const [intervalStatus, setIntervalStatus] = useState<'idle' | 'saved' | 'invalid'>('idle');

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

  const [confirmArchive, setConfirmArchive] = useState(false);

  const { firearm } = detail;
  if (!firearm) {
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
  const adjustErrors = roundAdjustmentErrors(adjustDelta, adjustReason);

  // A firearm that isn't the shooter's own needs no license of theirs, so a
  // missing one is not a gap to prompt about.
  const licenseExempt = !requiresLicense(firearm.weaponType) && detail.licenses.length === 0;
  const missingFields = missingFirearmFields({
    weaponType: firearm.weaponType,
    caliber: firearm.caliber,
    hasLicense: detail.licenses.length > 0,
  }).filter((field) => firearm.isOwn || field !== 'license');
  const currentSightSetting = resolveActiveSightSetting(detail.sightSettings);
  const editingIsCurrentSightSetting =
    editingSightId != null && currentSightSetting?.id === editingSightId;
  const isArchived = firearm.archivedAt != null;

  async function onConfirmArchive() {
    setConfirmArchive(false);
    await archiveFirearmAndReminders(firearm!.id);
    refresh();
  }

  async function onRestore() {
    await restoreFirearmAndReminders(firearm!.id);
    refresh();
  }

  function onAddCaliber() {
    if (!newCaliber) return;
    addFirearmCaliber(db, { firearmId: firearm!.id, caliber: newCaliber });
    setNewCaliber(null);
    setShowAddCaliber(false);
    refresh();
  }

  function onRemoveCaliber(id: string) {
    softDeleteFirearmCaliber(db, id);
    refresh();
  }

  function onAddGroup() {
    if (!newGroupId) return;
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
    setDefaultFirearmGroup(db, groupRowId);
    refresh();
  }

  /**
   * Pick, recognize, parse — then pre-fill. Nothing reaches the database
   * here: the parse only fills the form's inputs, which the user edits and
   * confirms with the existing Save button.
   */
  async function onScanCard(source: ScanSource) {
    setScan({ status: 'busy' });
    const previous = scannedImageUri;
    const result = await scanLicenseCard(source);
    if (previous) void deleteScannedImage(previous);
    setScannedImageUri(null);

    if (result.status === 'canceled') return setScan({ status: 'idle' });
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
    if (validUntilInvalid) return setLicenseSaveAttempted(true);
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
    setLicenseSaveAttempted(false);
    setShowAddLicense(false);
    resetScan();
    refresh();
  }

  function onLogEvent() {
    if (!eventKind.trim()) return;
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
    const delta = parseRoundAdjustment(adjustDelta);
    if (delta === null || !adjustReason.trim()) {
      setAdjustAttempted(true);
      return;
    }
    adjustFirearmRoundCount(db, firearm!.id, delta, adjustReason.trim());
    setAdjustDelta('');
    setAdjustReason('');
    setAdjustAttempted(false);
    setShowAdjust(false);
    refresh();
  }

  function onSaveInterval() {
    const previous = firearm!.roundsSinceMaintenance;
    const parsed = parseMaintenanceInterval(intervalValue);
    if (!parsed.ok) {
      setIntervalStatus('invalid');
      return;
    }
    updateFirearm(db, firearm!.id, { maintenanceIntervalRounds: parsed.interval });
    if (
      parsed.interval !== firearm!.maintenanceIntervalRounds &&
      shouldNotifyMaintenanceDue(0, previous, parsed.interval)
    ) {
      void notifyMaintenanceDue(`${firearm!.make} ${firearm!.model}`);
    }
    setIntervalInput(null);
    setIntervalStatus('saved');
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
    if (!sightLabel.trim()) return;
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
    if (!editingSightId) return;
    setActiveSightSetting(db, firearm!.id, editingSightId);
    closeSightForm();
    refresh();
  }

  function onDeleteSightSetting() {
    if (!editingSightId) return;
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
          <Chip label={t(firearm.isOwn ? 'firearms.ownershipOwn' : 'firearms.ownershipBorrowed')} />
          {firearm.caliber && <Chip label={firearm.caliber} />}
          {firearm.vapenId && <Chip label={firearm.vapenId} />}
        </View>
      </View>

      {/* Archived (#799): hidden from the list and the session pickers, its
          history kept. Said here, with the way back, so the screen never
          looks like an ordinary firearm that went missing from the list. */}
      {isArchived && (
        <Card>
          <ThemedText type="smallBold" testID="firearm-archived-title">
            {t('firearms.archivedTitle')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" testID="firearm-archived-body">
            {t('firearms.archivedBody', { date: dates.date(firearm.archivedAt!) })}
          </ThemedText>
          <SecondaryButton
            label={t('firearms.restore')}
            onPress={() => void onRestore()}
            testID="restore-firearm"
          />
        </Card>
      )}

      <PrimaryButton
        label={t('common.edit')}
        onPress={() => router.push(`/firearms/${firearm.id}/edit`)}
        testID="edit-firearm"
      />

      {/* An imported firearm arrives as a make and a model and nothing else,
          then presents identically to one deliberately recorded that way. The
          difference decides the FAP 551-3 case, so name the gap rather than
          letting "No License" stand as a fact about the shooter (#320). */}
      {missingFields.length > 0 && (
        <Card>
          <ThemedText type="smallBold" testID="firearm-incomplete-title">
            {t('firearms.incompleteTitle')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" testID="firearm-incomplete-body">
            {t('firearms.incompleteBody', {
              fields: missingFields.map((field) => t(`firearms.missing.${field}`)).join(', '),
            })}
          </ThemedText>
        </Card>
      )}

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

      {/* M6 (§6.6): hidden entirely when the compliance profile is 'none'.
          Also for an archived firearm (#799): a firearm the shooter no longer
          has needs no activity to keep its licence. */}
      {profile && !isArchived && detail.licenseActivities.length > 0 && (
        <Card>
          <ThemedText type="smallBold">{t('compliance.licenseActivityTitle')}</ThemedText>
          <View style={styles.chipsRow}>
            {detail.licenseActivities.map((b) => (
              <Chip
                key={licenseActivityKey(b)}
                testID={`firearm-barometer-${licenseActivityKey(b)}`}
                label={t(`compliance.licenseActivity${capitalize(b.status)}`, {
                  count: b.activityCount,
                  required: b.requiredActivities,
                })}
                tone={LICENSE_ACTIVITY_TONE[b.status]}
              />
            ))}
          </View>
          {detail.licenseActivities.map((b, index) => (
            <View key={`detail-${licenseActivityKey(b)}`}>
              <ThemedText
                type="small"
                themeColor="textSecondary"
                testID={`firearm-barometer-detail-${licenseActivityKey(b)}`}
              >
                {t('compliance.licenseActivityDetail', {
                  done: b.activityCount,
                  required: b.requiredActivities,
                  months: b.windowMonths,
                })}
              </ThemedText>
              {/* A number on a firearm card that is not about that firearm has
                  to say so, or it reads as this gun's activity (#319). */}
              <ThemedText
                type="small"
                themeColor="textSecondary"
                testID={`firearm-barometer-scope-${licenseActivityKey(b)}`}
              >
                {b.scope === 'shooter'
                  ? t('compliance.licenseActivityScopeShooter')
                  : t('compliance.licenseActivityScopeGroups', {
                      count: b.skippedSessionCount,
                    })}
              </ThemedText>
              <NextSessionLine
                lapseIso={detail.licenseActivityLapses[index]}
                labelKey="compliance.nextSessionBy"
                testID={`firearm-barometer-next-session-${licenseActivityKey(b)}`}
              />
            </View>
          ))}
          {/* Which case is in effect is never silently applied — it is on
              screen wherever the number it produced is. */}
          <ThemedText type="small" themeColor="textSecondary" testID="compliance-barometer-case">
            {t(`compliance.licenseActivityCase.${profile.variantId}`)}
          </ThemedText>
          {!profile.verified && (
            <ThemedText type="small" themeColor="textSecondary" testID="compliance-unverified-hint">
              {t('compliance.unverifiedHint')}
            </ThemedText>
          )}
        </Card>
      )}

      {/* The two "Intyget avser" boxes that cover THIS firearm (#329). Shown
          separately from License Activity above because they are a different
          claim: that one counts every session whatever it was shot with, these
          count only sessions logged with this gun. Not for an archived
          firearm (#799): it is neither held nor up for renewal. */}
      {profile && !isArchived && detail.firearmCriteria.length > 0 && (
        <Card>
          <ThemedText type="smallBold">{t('compliance.firearmCriteriaTitle')}</ThemedText>
          {detail.firearmCriteria.map((criterion, index) => (
            <View key={criterion.criterionId} style={styles.criterionBlock}>
              <View style={styles.chipsRow}>
                <Chip
                  testID={`firearm-criterion-${criterion.criterionId}`}
                  label={t(
                    criterion.met ? 'compliance.criterionMet' : 'compliance.criterionNotMet',
                    { name: t(`compliance.criterion.${criterion.criterionId}`) },
                  )}
                  tone={LICENSE_ACTIVITY_TONE[criterion.status]}
                />
              </View>
              {criterion.periods.map((period) => (
                <ThemedText
                  key={period.startIso}
                  type="small"
                  themeColor="textSecondary"
                  testID={`firearm-criterion-period-${criterion.criterionId}-${period.startIso}`}
                >
                  {t('compliance.criterionPeriod', {
                    done: period.activityCount,
                    required: criterion.requiredActivities,
                    from: dates.date(period.startIso),
                    to: dates.date(period.endIso),
                  })}
                </ThemedText>
              ))}
              <NextSessionLine
                lapseIso={detail.firearmCriteriaLapses[index]}
                labelKey="compliance.criterionNextSessionBy"
                testID={`firearm-criterion-next-session-${criterion.criterionId}`}
              />
              <ThemedText type="small" themeColor="textSecondary">
                {t(`compliance.criterionHint.${criterion.criterionId}`)}
              </ThemedText>
              {/* A criterion counting 2 where the shooter logged 40 has to say
                  why, or the number reads as a bug. */}
              {criterion.otherFirearmSessionCount > 0 && (
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  testID={`firearm-criterion-other-${criterion.criterionId}`}
                >
                  {t('compliance.criterionOtherFirearm', {
                    count: criterion.otherFirearmSessionCount,
                  })}
                </ThemedText>
              )}
              {criterion.unattributedSessionCount > 0 && (
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  testID={`firearm-criterion-unattributed-${criterion.criterionId}`}
                >
                  {t('compliance.criterionUnattributed', {
                    count: criterion.unattributedSessionCount,
                  })}
                </ThemedText>
              )}
            </View>
          ))}
          {/* On a paper log a row is evidence once someone signs it. The app
              has no equivalent and must not imply one (#308). */}
          <ThemedText type="small" themeColor="textSecondary" testID="firearm-criteria-attestation">
            {t('compliance.criterionNotAttested')}
          </ThemedText>
        </Card>
      )}

      {/* Calibers (#312). The chambering lives on the firearm; this is what
          else it may be fed — a .357 Magnum revolver shot with .38 Special is
          the ordinary case, not an exotic one. */}
      <Card>
        <View style={styles.sectionHeader}>
          <ThemedText type="smallBold" style={styles.headerLabel}>
            {t('firearms.calibersTitle')}
          </ThemedText>
          <View style={styles.headerActions}>
            <InfoButton
              title={t('firearms.calibersTitle')}
              body={t('firearms.calibersHint')}
              testID="calibers-info"
            />
            {!showAddCaliber && (
              <TextButton
                label={t('firearms.addCaliber')}
                onPress={() => setShowAddCaliber(true)}
                testID="add-caliber"
              />
            )}
          </View>
        </View>
        <ListRow
          title={firearm.caliber ?? t('firearms.noChambering')}
          subtitle={t('firearms.chambering')}
          testID="firearm-chambering"
        />
        {detail.calibers.map((row) => (
          <ListRow
            key={row.id}
            title={row.caliber}
            subtitle={t('firearms.alsoShoots')}
            testID={`firearm-caliber-${row.caliber}`}
            trailing={
              <Pressable
                accessibilityRole="button"
                onPress={() => onRemoveCaliber(row.id)}
                testID={`remove-caliber-${row.caliber}`}
              >
                <ThemedText type="small">{t('common.remove')}</ThemedText>
              </Pressable>
            }
          />
        ))}
        {showAddCaliber && (
          <>
            <CaliberPicker
              label={t('firearms.caliber')}
              value={newCaliber}
              onChange={setNewCaliber}
            />
            <SecondaryButton
              label={t('firearms.addCaliber')}
              onPress={onAddCaliber}
              disabled={!newCaliber}
              testID="save-caliber"
            />
          </>
        )}
      </Card>

      {/* Weapon groups */}
      <Card>
        <View style={styles.sectionHeader}>
          <ThemedText type="smallBold" style={styles.headerLabel}>
            {t('firearms.groupsTitle')}
          </ThemedText>
          <View style={styles.headerActions}>
            <InfoButton
              title={t('firearms.groupsTitle')}
              body={t('firearms.groupsHint')}
              testID="groups-info"
            />
            {!showAddGroup && (
              <TextButton
                label={t('firearms.addGroup')}
                onPress={() => setShowAddGroup(true)}
                testID="add-group"
              />
            )}
          </View>
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
        {showAddGroup && (
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
            <SecondaryButton
              label={t('firearms.addGroup')}
              onPress={onAddGroup}
              disabled={!newGroupId}
              testID="save-group"
            />
          </>
        )}
      </Card>

      {/* Sight settings (#114) */}
      <Card>
        <View style={styles.sectionHeader}>
          <ThemedText type="smallBold" style={styles.headerLabel}>
            {t('firearms.sightSettingsTitle')}
          </ThemedText>
          <View style={styles.headerActions}>
            <InfoButton
              title={t('firearms.sightSettingsTitle')}
              body={t('firearms.sightSettingsHint')}
              testID="sight-settings-info"
            />
            {!showSightForm && (
              <TextButton
                label={t('firearms.addSightSetting')}
                onPress={onAddSightSetting}
                testID="add-sight-setting"
              />
            )}
          </View>
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
        {showSightForm && (
          <>
            <ThemedText type="small">{t('firearms.sightLabel')}</ThemedText>
            <TextField
              value={sightLabel}
              onChangeText={setSightLabel}
              maxLength={TEXT_LIMITS.sight_settings.label}
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
            <TextField
              value={sightNotes}
              onChangeText={setSightNotes}
              maxLength={TEXT_LIMITS.sight_settings.notes}
              testID="sight-notes"
            />
            <SecondaryButton
              label={t('common.save')}
              onPress={onSaveSightSetting}
              testID="save-sight-setting"
            />
            {editingSightId && !editingIsCurrentSightSetting ? (
              <SecondaryButton
                label={t('firearms.sightSetCurrent')}
                onPress={onSetCurrentSightSetting}
                testID="sight-set-current"
              />
            ) : null}
            {editingSightId ? (
              <SecondaryButton
                tone="danger"
                label={t('firearms.sightDelete')}
                onPress={onDeleteSightSetting}
                testID="sight-delete"
              />
            ) : null}
          </>
        )}
      </Card>

      {/* License register */}
      <Card>
        <View style={styles.sectionHeader}>
          <ThemedText type="smallBold">{t('firearms.licenseTitle')}</ThemedText>
          {/* An air weapon that is effektbegränsat needs no licence, so
              "No License" would name a gap that does not exist (#365). The
              card stays, because a powerful air rifle above the limit does
              need one and the app cannot tell them apart. */}
          <View style={styles.headerActions}>
            {/* Chip pins itself to the top of its row; its own View centres it
                beside the text button. */}
            <View>
              <Chip
                testID="license-status"
                label={
                  licenseExempt
                    ? t('firearms.licenseNotRequired')
                    : t(`firearms.licenseStatus${capitalize(detail.licenseStatus)}`)
                }
              />
            </View>
            {!showAddLicense && (
              <TextButton
                label={t('firearms.addLicense')}
                onPress={() => setShowAddLicense(true)}
                testID="add-license"
              />
            )}
          </View>
        </View>
        {detail.licenses.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {licenseExempt ? t('firearms.licenseNotRequiredBody') : t('firearms.noLicenses')}
          </ThemedText>
        ) : (
          detail.licenses.map((license) => (
            <ListRow
              key={license.id}
              title={license.licenseNumber ?? t('firearms.licenseTitle')}
              subtitle={
                license.validUntil ? dates.day(license.validUntil) : t('firearms.tillsVidare')
              }
              testID={`license-${license.id}`}
            />
          ))
        )}
        {showAddLicense && (
          <>
            {SCAN_SUPPORTED ? (
              <>
                <ThemedText type="smallBold">{t('firearms.scanTitle')}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('firearms.scanHint')}
                </ThemedText>
                <SecondaryButton
                  label={t('firearms.scanFromCamera')}
                  onPress={() => void onScanCard('camera')}
                  disabled={scan.status === 'busy'}
                  testID="scan-card-camera"
                />
                <SecondaryButton
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
              maxLength={TEXT_LIMITS.licenses.license_number}
              testID="license-number"
            />
            <ThemedText type="small">{t('firearms.purpose')}</ThemedText>
            <TextField
              value={purpose}
              onChangeText={setPurpose}
              maxLength={TEXT_LIMITS.licenses.purpose}
            />
            <ThemedText type="small">{t('firearms.decidedOn')}</ThemedText>
            <TextField
              value={decidedOn}
              onChangeText={setDecidedOn}
              maxLength={TEXT_LIMITS.licenses.decided_on}
              placeholder="YYYY-MM-DD"
            />
            <ThemedText type="small">{t('firearms.validUntil')}</ThemedText>
            <TextField
              value={validUntil}
              onChangeText={setValidUntil}
              maxLength={TEXT_LIMITS.licenses.valid_until}
              placeholder="YYYY-MM-DD"
              testID="license-valid-until"
            />
            {licenseSaveAttempted && validUntilInvalid ? (
              <ThemedText type="small" themeColor="danger" testID="license-valid-until-error">
                {t('firearms.validUntilInvalid')}
              </ThemedText>
            ) : null}
            <ThemedText type="small">{t('firearms.conditions')}</ThemedText>
            <TextField
              value={conditions}
              onChangeText={setConditions}
              maxLength={TEXT_LIMITS.licenses.conditions}
            />
            <ThemedText type="small">{t('firearms.authority')}</ThemedText>
            <TextField
              value={authority}
              onChangeText={setAuthority}
              maxLength={TEXT_LIMITS.licenses.authority}
            />
            <SecondaryButton
              label={t('common.save')}
              onPress={() => void onAddLicense()}
              testID="save-license"
            />
          </>
        )}
      </Card>

      {/* Maintenance */}
      <Card>
        <View style={styles.sectionHeader}>
          <ThemedText type="smallBold" style={styles.headerLabel}>
            {t('firearms.maintenanceTitle')}
          </ThemedText>
          {!showLogEvent && (
            <TextButton
              label={t('firearms.logEvent')}
              onPress={() => setShowLogEvent(true)}
              testID="log-maintenance"
            />
          )}
        </View>
        <ThemedText type="small">{t('firearms.maintenanceInterval')}</ThemedText>
        <TextField
          value={intervalValue}
          onChangeText={(text) => {
            setIntervalInput(text);
            setIntervalStatus('idle');
          }}
          keyboardType="number-pad"
          testID="maintenance-interval"
        />
        {intervalStatus === 'invalid' ? (
          <ThemedText type="small" themeColor="danger" testID="interval-error">
            {t('firearms.intervalInvalid')}
          </ThemedText>
        ) : null}
        <SecondaryButton label={t('common.save')} onPress={onSaveInterval} testID="save-interval" />
        {intervalStatus === 'saved' ? (
          <ThemedText
            type="small"
            themeColor="textSecondary"
            accessibilityLiveRegion="polite"
            testID="interval-saved"
          >
            {t('firearms.intervalSaved')}
          </ThemedText>
        ) : null}

        {detail.maintenanceEvents.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('firearms.noMaintenanceEvents')}
          </ThemedText>
        ) : (
          detail.maintenanceEvents.map((event) => (
            <ListRow
              key={event.id}
              title={maintenanceEventTitle(event, t('firearms.adjustmentEvent'))}
              subtitle={maintenanceEventLines(event, dates.date)}
            />
          ))
        )}

        {showLogEvent && (
          <>
            <ThemedText type="small">{t('firearms.eventDate')}</ThemedText>
            <SecondaryButton
              label={dates.date(eventPerformedAt)}
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
              maxLength={TEXT_LIMITS.maintenance_events.kind}
              placeholder={t('firearms.kindPlaceholder')}
              testID="event-kind"
            />
            <ThemedText type="small">{t('firearms.notes')}</ThemedText>
            <TextField
              value={eventNotes}
              onChangeText={setEventNotes}
              maxLength={TEXT_LIMITS.maintenance_events.notes}
            />
            <SecondaryButton label={t('common.save')} onPress={onLogEvent} testID="save-event" />
          </>
        )}

        {showAdjust ? (
          <>
            <ThemedText type="small">{t('firearms.adjustDelta')}</ThemedText>
            <TextField
              value={adjustDelta}
              onChangeText={setAdjustDelta}
              // `numeric` is the one numeric pad with a minus key on both platforms.
              keyboardType="numeric"
              testID="adjust-delta"
            />
            {adjustAttempted && adjustErrors.includes('invalidDelta') ? (
              <ThemedText type="small" themeColor="danger" testID="adjust-delta-error">
                {t('firearms.adjustDeltaInvalid')}
              </ThemedText>
            ) : null}
            <ThemedText type="small">{t('firearms.adjustReason')}</ThemedText>
            <TextField
              value={adjustReason}
              onChangeText={setAdjustReason}
              maxLength={TEXT_LIMITS.maintenance_events.notes}
              placeholder={t('firearms.adjustReasonPlaceholder')}
              testID="adjust-reason"
            />
            {adjustAttempted && adjustErrors.includes('missingReason') ? (
              <ThemedText type="small" themeColor="danger" testID="adjust-reason-error">
                {t('firearms.adjustReasonRequired')}
              </ThemedText>
            ) : null}
            <SecondaryButton
              label={t('firearms.adjustSave')}
              onPress={onAdjust}
              testID="save-adjust"
            />
          </>
        ) : (
          <SecondaryButton
            label={t('firearms.adjustRoundCount')}
            onPress={() => setShowAdjust(true)}
            testID="adjust-round-count"
          />
        )}
      </Card>

      {!isArchived && (
        <>
          <SecondaryButton
            label={t('firearms.archive')}
            onPress={() => setConfirmArchive(true)}
            testID="archive-firearm"
          />
          <ThemedText type="small" themeColor="textSecondary">
            {t('firearms.archiveHint')}
          </ThemedText>
        </>
      )}

      <ConfirmSheet
        visible={confirmArchive}
        title={t('firearms.archiveConfirmTitle')}
        body={t('firearms.archiveConfirmBody')}
        confirmLabel={t('firearms.archive')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void onConfirmArchive()}
        onCancel={() => setConfirmArchive(false)}
        testID="archive-firearm-confirm"
      />
    </Screen>
  );
}

/** The firearm identity the card carried, for the "also update the firearm"
 *  row. Empty when the card gave none — the row is then not offered. */
function scanFirearmSummary(parsed: ParsedLicenseCard): string {
  return [parsed.make, parsed.model, parsed.caliber, parsed.vapenId].filter(Boolean).join(' · ');
}

/** "Next session by …" under a met requirement; nothing when it is not met (#795). */
function NextSessionLine({
  lapseIso,
  labelKey,
  testID,
}: {
  lapseIso: string | null | undefined;
  labelKey: 'compliance.nextSessionBy' | 'compliance.criterionNextSessionBy';
  testID: string;
}) {
  const { t } = useTranslation();
  const dates = useDateFormat();
  if (!lapseIso) return null;
  return (
    <ThemedText type="small" themeColor="textSecondary" testID={testID}>
      {t(labelKey, { date: dates.date(nextSessionDeadline(lapseIso)) })}
    </ThemedText>
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
  criterionBlock: {
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
});
