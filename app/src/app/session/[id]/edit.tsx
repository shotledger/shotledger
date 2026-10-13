// Edit-session metadata (§4 fix batch, 2026-09-03): the fields the new-session
// form (session/new.tsx) collects up front but the detail screen never let
// the shooter revisit afterwards — name, date, location, notes, competition
// details, weapon group/class, firearm, ammo lot, tags. Share is NOT here:
// beside Save it read as "save and share" on a form with unsaved changes
// (maintainer, 2026-09-15), and the session ⋮ menu already owns it.
// Discipline and type are not editable here (they drive the series skeleton and
// are excluded from `UpdateSessionInput` on purpose). The match format is, but
// only until the first result (#475, db/queries/match-format.ts).
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import {
  categoryKey,
  eventsForDiscipline,
  findEvent,
  formatShooterClass,
  getProgram,
  placementOnlyStandardMedal,
  programsForDiscipline,
  shooterClassesForDiscipline,
  weaponGroupsForDiscipline,
  TEXT_LIMITS,
} from '@shotledger/shared';
import { effectiveRegulationIds } from '@shotledger/shared/src/regulations/registry';

import { ScreenTitle } from '@/components/screen-title';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { OptionPicker, type PickerOption } from '@/components/option-picker';
import { SegmentedControl } from '@/components/segmented-control';
import type { SeriesEntryMode } from '@/features/session/series-entry-choice';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Toggle } from '@/components/toggle';
import { db } from '@/db/client';
import { enabledRegulationIds } from '@/features/regulations/use-regulations';
import { listAmmoLots } from '@/db/queries/ammo-lots';
import { listFirearms } from '@/db/queries/firearms';
import { canChangeMatchFormat, changeMatchFormat } from '@/db/queries/match-format';
import { getSession, updateSession } from '@/db/queries/sessions';
import {
  addSessionTag,
  getOrCreateTag,
  listTagsForSession,
  removeSessionTag,
} from '@/db/queries/tags';
import {
  COMPETITION_LEVELS,
  matchFormatHint,
  matchFormatLabel,
  type CompetitionLevel,
} from '@/features/session/labels';
import { withLocalDay } from '@/features/session/with-local-day';
import { readTrackedInputs } from '@/features/settings/tracked-inputs';
import { Spacing } from '@/theme/tokens';
import { useDateFormat } from '@/features/dates/use-date-format';

// The picker's value for Free Format, as on the new-session form.
const FREE_FORMAT = 'none';

type OfficialMedalChoice = 'none' | 'brons' | 'silver';
const OFFICIAL_MEDAL_CHOICES: readonly OfficialMedalChoice[] = ['none', 'brons', 'silver'];

export default function EditSessionScreen() {
  const { t } = useTranslation();
  const dates = useDateFormat();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = getSession(db, id);

  const [name, setName] = useState(session?.name ?? '');
  const [startedAt, setStartedAt] = useState(session?.startedAt ?? new Date().toISOString());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [location, setLocation] = useState(session?.location ?? '');
  const [seriesEntryMode, setSeriesEntryMode] = useState<SeriesEntryMode>(
    session?.seriesEntryMode ?? 'ask',
  );
  const [notes, setNotes] = useState(session?.notes ?? '');
  const [competitionName, setCompetitionName] = useState(session?.competitionName ?? '');
  const [level, setLevel] = useState<CompetitionLevel>(
    (session?.competitionLevel as CompetitionLevel | null) ?? 'forening',
  );
  const [isChampionship, setIsChampionship] = useState(session?.isChampionship === 1);
  const [officialMedal, setOfficialMedal] = useState<OfficialMedalChoice>(
    session?.officialStandardMedal === 'brons' || session?.officialStandardMedal === 'silver'
      ? session.officialStandardMedal
      : 'none',
  );
  const tracked = useMemo(() => readTrackedInputs(db), []);
  const [weaponGroup, setWeaponGroup] = useState<string | null>(session?.weaponGroup ?? null);
  const [shooterClass, setShooterClass] = useState<string | null>(session?.shooterClass ?? null);
  const [eventId, setEventId] = useState<string | null>(session?.eventId ?? null);
  const [firearmId, setFirearmId] = useState<string | null>(session?.firearmId ?? null);
  const [ammoLotId, setAmmoLotId] = useState<string | null>(session?.ammoLotId ?? null);
  const [programId, setProgramId] = useState(session?.programId ?? FREE_FORMAT);
  const [tags, setTags] = useState(() => listTagsForSession(db, id));
  const [newTag, setNewTag] = useState('');

  if (!session) {
    return (
      <Screen scroll={false}>
        <ScreenTitle>{t('session.editTitle')}</ScreenTitle>
      </Screen>
    );
  }

  const isCompetition = session.type === 'competition';
  // A placement-only medal cannot be computed from one session, so the
  // official one is recorded by hand (SHB C.5.1.2).
  const recordsOfficialMedal = isCompetition && placementOnlyStandardMedal(session.disciplineId);
  // Same rule as the new-session form: vapengrupp and klass are competition
  // concepts. Here it is one-way — a picker hides only when the session has no
  // value stored, so editing can never strand a value it stopped showing.
  // (Training sessions DO carry a derived vapengrupp, so that one stays
  // visible and correctable.)
  const groups = weaponGroupsForDiscipline(session.disciplineId);
  const classes = shooterClassesForDiscipline(session.disciplineId);
  // Unranked here, unlike the new-session screen: the discipline is fixed and
  // the shooter is correcting a past session, not being offered a default.
  // Narrowed to the regelverk in play today, plus whatever the session
  // already holds — an SvSF class logged before SvSF was switched off must
  // stay selectable, by the same one-way rule as the pickers above.
  const offered = eventsForDiscipline(
    session.disciplineId,
    effectiveRegulationIds(enabledRegulationIds()),
  );
  const stored =
    session.eventId !== null && !offered.some((event) => event.id === session.eventId)
      ? findEvent(session.eventId)
      : undefined;
  const events = stored === undefined ? offered : [...offered, stored];
  // Optional Fields (#569) hides an empty picker the shooter switched off; a
  // stored value still shows, by the same one-way rule.
  const showGroupPicker =
    groups.length > 0 && ((isCompetition && tracked.weaponGroups) || weaponGroup !== null);
  const showClassPicker =
    classes.length > 0 && ((isCompetition && tracked.shooterClass) || shooterClass !== null);
  const showEventPicker = events.length > 0 && (isCompetition || eventId !== null);
  const firearms = listFirearms(db);
  const ammoLots = listAmmoLots(db);
  const programs = session.kind === 'series' ? programsForDiscipline(session.disciplineId) : [];
  const formatEditable = canChangeMatchFormat(db, session.id);
  const chosenProgram = programId === FREE_FORMAT ? undefined : getProgram(programId);
  const programHint = chosenProgram ? matchFormatHint(t, chosenProgram) : null;

  const toOptions = <T extends string>(
    values: readonly { value: T; label: string }[],
    prefix: string,
  ): PickerOption<T>[] =>
    values.map((option) => ({ ...option, testID: `${prefix}-${option.value}` }));

  function onAddTag() {
    const trimmed = newTag.trim();
    if (!trimmed) return;
    const tag = getOrCreateTag(db, trimmed);
    addSessionTag(db, id, tag.id);
    setTags(listTagsForSession(db, id));
    setNewTag('');
  }

  function onRemoveTag(tagId: string) {
    removeSessionTag(db, id, tagId);
    setTags(listTagsForSession(db, id));
  }

  function onSave() {
    if (!session) return;
    updateSession(db, session.id, {
      name: name.trim() || session.name,
      startedAt,
      location: location.trim() || null,
      notes: notes.trim() || null,
      competitionName: isCompetition && competitionName.trim() ? competitionName.trim() : null,
      competitionLevel: isCompetition ? level : null,
      isChampionship: isCompetition && isChampionship,
      weaponGroup,
      shooterClass,
      eventId,
      firearmId,
      ammoLotId,
      seriesEntryMode,
      ...(recordsOfficialMedal
        ? { officialStandardMedal: officialMedal === 'none' ? null : officialMedal }
        : {}),
    });
    const nextProgramId = programId === FREE_FORMAT ? null : programId;
    if (nextProgramId !== session.programId) changeMatchFormat(db, session.id, nextProgramId);
    router.back();
  }

  return (
    <Screen>
      <Card>
        <ThemedText type="smallBold">{t('session.name')}</ThemedText>
        <TextField
          value={name}
          onChangeText={setName}
          maxLength={TEXT_LIMITS.sessions.name}
          testID="edit-name"
        />

        <ThemedText type="smallBold">{t('session.date')}</ThemedText>
        <PrimaryButton
          label={dates.date(startedAt)}
          onPress={() => setDatePickerOpen(true)}
          testID="edit-date"
        />
        {datePickerOpen && (
          <DateTimePicker
            testID="edit-date-picker"
            value={new Date(startedAt)}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(_event, selected) => {
              setDatePickerOpen(false);
              if (!selected) return;
              setStartedAt(withLocalDay(startedAt, selected));
            }}
          />
        )}

        <ThemedText type="smallBold">{t('session.location')}</ThemedText>
        <TextField
          value={location}
          onChangeText={setLocation}
          maxLength={TEXT_LIMITS.sessions.location}
          testID="edit-location"
        />

        <ThemedText type="smallBold">{t('session.notes')}</ThemedText>
        <TextField
          value={notes}
          onChangeText={setNotes}
          maxLength={TEXT_LIMITS.sessions.notes}
          multiline
          testID="edit-notes"
        />
      </Card>

      {programs.length > 0 && (
        <Card>
          {formatEditable ? (
            <>
              <OptionPicker
                label={t('session.matchFormat')}
                options={toOptions(
                  [
                    { value: FREE_FORMAT, label: t('session.freeFormat') },
                    ...programs.map((p) => ({
                      value: p.id,
                      label: matchFormatLabel(t, p.id, programs.length),
                    })),
                  ],
                  'edit-program',
                )}
                value={programId}
                onChange={setProgramId}
              />
              {programHint && (
                <ThemedText type="small" themeColor="textSecondary" testID="edit-program-hint">
                  {programHint}
                </ThemedText>
              )}
            </>
          ) : (
            <>
              <ThemedText type="smallBold">{t('session.matchFormat')}</ThemedText>
              <ThemedText testID="edit-program-locked">
                {matchFormatLabel(t, session.programId, programs.length)}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('session.matchFormatLocked')}
              </ThemedText>
            </>
          )}
        </Card>
      )}

      {isCompetition && (
        <Card>
          <OptionPicker
            label={t('session.competitionLevel')}
            options={toOptions(
              COMPETITION_LEVELS.map((value) => ({ value, label: t(`competitionLevel.${value}`) })),
              'edit-level',
            )}
            value={level}
            onChange={setLevel}
          />
          <View style={styles.switchRow}>
            <ThemedText type="small">{t('session.championship')}</ThemedText>
            <Toggle
              value={isChampionship}
              onValueChange={setIsChampionship}
              testID="edit-championship-toggle"
            />
          </View>
          <ThemedText type="smallBold">{t('session.competitionName')}</ThemedText>
          <TextField
            value={competitionName}
            onChangeText={setCompetitionName}
            maxLength={TEXT_LIMITS.sessions.competition_name}
            placeholder={t('session.competitionNamePlaceholder')}
            testID="edit-competition-name"
          />
          {recordsOfficialMedal && (
            <OptionPicker
              label={t('session.officialStandardMedal')}
              options={toOptions(
                OFFICIAL_MEDAL_CHOICES.map((value) => ({
                  value,
                  label: t(`webshooter.medal.${value}`),
                })),
                'edit-official-medal',
              )}
              value={officialMedal}
              onChange={setOfficialMedal}
            />
          )}
        </Card>
      )}

      <Card>
        <SegmentedControl<SeriesEntryMode>
          options={[
            { value: 'ask', label: t('session.entryMode.ask') },
            { value: 'manual', label: t('session.entryMode.manual') },
            { value: 'photo', label: t('session.entryMode.photo') },
          ]}
          value={seriesEntryMode}
          onChange={setSeriesEntryMode}
          testID="edit-series-entry-mode"
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t('session.entryModeHint')}
        </ThemedText>
      </Card>

      {(showGroupPicker || showClassPicker || showEventPicker) && (
        <Card>
          {showGroupPicker && (
            <OptionPicker
              label={t('session.weaponGroup')}
              options={toOptions(
                groups.map((g) => ({ value: g.id, label: g.label })),
                'edit-group',
              )}
              value={weaponGroup}
              onChange={setWeaponGroup}
              emptyLabel={t('session.none')}
            />
          )}
          {showClassPicker && (
            <OptionPicker
              label={t('session.shooterClass')}
              options={toOptions(
                classes.map((code) => ({ value: code, label: formatShooterClass(code) })),
                'edit-class',
              )}
              value={shooterClass}
              onChange={setShooterClass}
              emptyLabel={t('session.none')}
            />
          )}
          {showEventPicker && (
            <OptionPicker
              label={t('session.event')}
              options={toOptions(
                events.map((event) => ({
                  value: event.id,
                  label: t(`eventCategory.${categoryKey(event.category)}`),
                })),
                'edit-event',
              )}
              value={eventId}
              onChange={setEventId}
              emptyLabel={t('session.none')}
            />
          )}
        </Card>
      )}

      <Card>
        <OptionPicker
          label={t('session.firearm')}
          options={toOptions(
            firearms.map((f) => ({ value: f.id, label: `${f.make} ${f.model}` })),
            'edit-firearm',
          )}
          value={firearmId}
          onChange={setFirearmId}
          emptyLabel={t('session.none')}
        />
        <OptionPicker
          label={t('session.ammoLot')}
          options={toOptions(
            ammoLots.map((lot) => ({ value: lot.id, label: lot.label })),
            'edit-ammo',
          )}
          value={ammoLotId}
          onChange={setAmmoLotId}
          emptyLabel={t('session.none')}
        />
      </Card>

      <Card>
        <ThemedText type="smallBold">{t('session.tags')}</ThemedText>
        <View style={styles.tagRow}>
          {tags.map((tag) => (
            <Pressable
              key={tag.id}
              accessibilityRole="button"
              accessibilityLabel={t('session.removeTag', { name: tag.name })}
              onPress={() => onRemoveTag(tag.id)}
              testID={`edit-tag-${tag.name}`}
            >
              <Chip label={`${tag.name} ×`} />
            </Pressable>
          ))}
        </View>
        <View style={styles.tagAddRow}>
          <TextField
            value={newTag}
            onChangeText={setNewTag}
            maxLength={TEXT_LIMITS.tags.name}
            placeholder={t('session.tagPlaceholder')}
            style={styles.tagInput}
            onSubmitEditing={onAddTag}
            testID="edit-tag-input"
          />
          <PrimaryButton label={t('session.addTag')} onPress={onAddTag} testID="edit-tag-add" />
        </View>
      </Card>

      <PrimaryButton label={t('session.saveChanges')} onPress={onSave} testID="save-session" />
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
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tagAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  tagInput: {
    flex: 1,
  },
});
