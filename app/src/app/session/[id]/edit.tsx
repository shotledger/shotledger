// Edit-session metadata (§4 fix batch, 2026-09-03): the fields the new-session
// form (session/new.tsx) collects up front but the detail screen never let
// the shooter revisit afterwards — name, date, location, notes, competition
// details, weapon group/class, firearm, ammo lot, tags — plus the Share
// action that used to sit on the detail screen's body. Discipline/program
// and type are not editable here (they drive the series skeleton and are
// excluded from `UpdateSessionInput` on purpose).
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import {
  formatShooterClass,
  shooterClassesForDiscipline,
  weaponGroupsForDiscipline,
} from '@shotledger/shared';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { OptionPicker, type PickerOption } from '@/components/option-picker';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { listAmmoLots } from '@/db/queries/ammo-lots';
import { listFirearms } from '@/db/queries/firearms';
import { getSession, updateSession } from '@/db/queries/sessions';
import {
  addSessionTag,
  getOrCreateTag,
  listTagsForSession,
  removeSessionTag,
} from '@/db/queries/tags';
import {
  COMPETITION_LEVELS,
  formatLocalDate,
  type CompetitionLevel,
} from '@/features/session/labels';
import { Spacing } from '@/theme/tokens';

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default function EditSessionScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = db ? getSession(db, id) : undefined;

  const [name, setName] = useState(session?.name ?? '');
  const [startedAt, setStartedAt] = useState(session?.startedAt ?? new Date().toISOString());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [location, setLocation] = useState(session?.location ?? '');
  const [notes, setNotes] = useState(session?.notes ?? '');
  const [competitionName, setCompetitionName] = useState(session?.competitionName ?? '');
  const [level, setLevel] = useState<CompetitionLevel>(
    (session?.competitionLevel as CompetitionLevel | null) ?? 'forening',
  );
  const [isChampionship, setIsChampionship] = useState(session?.isChampionship === 1);
  const [weaponGroup, setWeaponGroup] = useState<string | null>(session?.weaponGroup ?? null);
  const [shooterClass, setShooterClass] = useState<string | null>(session?.shooterClass ?? null);
  const [firearmId, setFirearmId] = useState<string | null>(session?.firearmId ?? null);
  const [ammoLotId, setAmmoLotId] = useState<string | null>(session?.ammoLotId ?? null);
  const [tags, setTags] = useState(() => (db ? listTagsForSession(db, id) : []));
  const [newTag, setNewTag] = useState('');

  if (!db || !session) {
    return (
      <Screen scroll={false}>
        <ThemedText type="title">{t('session.editTitle')}</ThemedText>
      </Screen>
    );
  }

  const isCompetition = session.type === 'competition';
  const groups = weaponGroupsForDiscipline(session.disciplineId);
  const classes = shooterClassesForDiscipline(session.disciplineId);
  const firearms = listFirearms(db);
  const ammoLots = listAmmoLots(db);

  const toOptions = <T extends string>(
    values: readonly { value: T; label: string }[],
    prefix: string,
  ): PickerOption<T>[] =>
    values.map((option) => ({ ...option, testID: `${prefix}-${option.value}` }));

  function onAddTag() {
    if (!db) return;
    const trimmed = newTag.trim();
    if (!trimmed) return;
    const tag = getOrCreateTag(db, trimmed);
    addSessionTag(db, id, tag.id);
    setTags(listTagsForSession(db, id));
    setNewTag('');
  }

  function onRemoveTag(tagId: string) {
    if (!db) return;
    removeSessionTag(db, id, tagId);
    setTags(listTagsForSession(db, id));
  }

  function onSave() {
    if (!db || !session) return;
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
      firearmId,
      ammoLotId,
    });
    router.back();
  }

  return (
    <Screen>
      <Card>
        <ThemedText type="smallBold">{t('session.name')}</ThemedText>
        <TextField value={name} onChangeText={setName} testID="edit-name" />

        <ThemedText type="smallBold">{t('session.date')}</ThemedText>
        <PrimaryButton
          label={formatLocalDate(startedAt, i18n.language)}
          onPress={() => setDatePickerOpen(true)}
          testID="edit-date"
        />
        {datePickerOpen && (
          <DateTimePicker
            testID="edit-date-picker"
            value={new Date(toDateOnly(new Date(startedAt)))}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(_event, selected) => {
              setDatePickerOpen(false);
              if (!selected) return;
              setStartedAt(selected.toISOString());
            }}
          />
        )}

        <ThemedText type="smallBold">{t('session.location')}</ThemedText>
        <TextField value={location} onChangeText={setLocation} testID="edit-location" />

        <ThemedText type="smallBold">{t('session.notes')}</ThemedText>
        <TextField value={notes} onChangeText={setNotes} multiline testID="edit-notes" />
      </Card>

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
            <Switch
              value={isChampionship}
              onValueChange={setIsChampionship}
              testID="edit-championship-toggle"
            />
          </View>
          <ThemedText type="smallBold">{t('session.competitionName')}</ThemedText>
          <TextField
            value={competitionName}
            onChangeText={setCompetitionName}
            placeholder={t('session.competitionNamePlaceholder')}
            testID="edit-competition-name"
          />
        </Card>
      )}

      <Card>
        <OptionPicker
          label={t('session.weaponGroup')}
          options={toOptions(
            groups.map((g) => ({ value: g.id, label: g.code })),
            'edit-group',
          )}
          value={weaponGroup}
          onChange={setWeaponGroup}
          emptyLabel={t('session.none')}
        />
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
      </Card>

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
            placeholder={t('session.tagPlaceholder')}
            style={styles.tagInput}
            onSubmitEditing={onAddTag}
            testID="edit-tag-input"
          />
          <PrimaryButton label={t('session.addTag')} onPress={onAddTag} testID="edit-tag-add" />
        </View>
      </Card>

      <PrimaryButton
        label={t('share.share')}
        onPress={() => router.push(`/session/${id}/share`)}
        testID="edit-share"
      />

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
