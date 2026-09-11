// Which calendar WebShooter starts are written to.
//
// Before this, `upsertCalendarEvent` took the first writable calendar the
// device happened to return — so the app wrote into the shooter's diary
// without asking and without saying where (maintainer, 2026-09-11: "I
// didn't get to choose either"). A device typically offers several: a
// personal Google calendar, a work one, birthdays, a shared family one.
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/queries/settings';
import { CALENDAR_ID_SETTING_KEY } from '@/features/webshooter/use-webshooter-starts';
import { listWritableCalendars, type WritableCalendar } from '@/platform/calendar';
import { Spacing } from '@/theme/tokens';

export function CalendarPicker() {
  const { t } = useTranslation();
  const [calendars, setCalendars] = useState<WritableCalendar[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(() =>
    db ? getSetting<string | null>(db, CALENDAR_ID_SETTING_KEY, null) : null,
  );
  const [denied, setDenied] = useState(false);

  // Loaded on demand rather than on mount: listing calendars prompts for
  // permission, and a shooter who never adds a start should never be asked.
  const loadCalendars = useCallback(async () => {
    try {
      setCalendars(await listWritableCalendars());
      setDenied(false);
    } catch {
      setDenied(true);
    }
  }, []);

  function choose(id: string) {
    setChosen(id);
    if (db) setSetting<string>(db, CALENDAR_ID_SETTING_KEY, id);
  }

  if (calendars === null) {
    return (
      <View style={styles.section}>
        <Pressable onPress={() => void loadCalendars()} testID="webshooter-calendar-choose">
          <ThemedText type="small" themeColor="primary">
            {t('webshooter.chooseCalendar')}
          </ThemedText>
        </Pressable>
        {denied && (
          <ThemedText type="small" themeColor="danger">
            {t('webshooter.calendarPermissionDenied')}
          </ThemedText>
        )}
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('webshooter.chooseCalendarHint')}
      </ThemedText>
      <View style={styles.chips}>
        {calendars.map((calendar) => (
          <Pressable
            key={calendar.id}
            onPress={() => choose(calendar.id)}
            testID={`webshooter-calendar-${calendar.id}`}
          >
            <Chip
              label={
                calendar.account === '' ? calendar.title : `${calendar.title} · ${calendar.account}`
              }
              tone={chosen === calendar.id ? 'primary' : 'neutral'}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.one,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
});
