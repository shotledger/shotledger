// Which calendar WebShooter starts are written to.
//
// Before this, `upsertCalendarEvent` took the first writable calendar the
// device happened to return — so the app wrote into the shooter's diary
// without asking and without saying where (maintainer, 2026-09-11: "I
// didn't get to choose either"). A device typically offers several: a
// personal Google calendar, a work one, birthdays, a shared family one.
//
// One row, showing the current choice, opening a sheet — not a wall of
// chips. The row reads as settled or unset at a glance, which is the whole
// job of a setting you touch once.
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ActionSheet, type ActionSheetAction } from '@/components/action-sheet';
import { DrillDownRow } from '@/components/drill-down-row';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/queries/settings';
import { CALENDAR_ID_SETTING_KEY } from '@/features/webshooter/use-webshooter-starts';
import { listWritableCalendars, type WritableCalendar } from '@/platform/calendar';

const CALENDAR_TITLE_SETTING_KEY = 'webshooterCalendarTitle';

function calendarLabel(calendar: WritableCalendar): string {
  return calendar.account === '' ? calendar.title : `${calendar.title} · ${calendar.account}`;
}

export function CalendarPicker() {
  const { t } = useTranslation();
  const [calendars, setCalendars] = useState<WritableCalendar[]>([]);
  const [open, setOpen] = useState(false);
  const [denied, setDenied] = useState(false);
  // The label is remembered alongside the id so the row can say which
  // calendar is chosen without asking for calendar permission just to
  // render a settings screen.
  const [chosenLabel, setChosenLabel] = useState<string | null>(() =>
    db ? getSetting<string | null>(db, CALENDAR_TITLE_SETTING_KEY, null) : null,
  );
  const [chosenId, setChosenId] = useState<string | null>(() =>
    db ? getSetting<string | null>(db, CALENDAR_ID_SETTING_KEY, null) : null,
  );

  const openSheet = useCallback(async () => {
    try {
      // Listing prompts for permission, so it happens on the tap rather
      // than on mount: a shooter who never uses this is never asked.
      setCalendars(await listWritableCalendars());
      setDenied(false);
      setOpen(true);
    } catch {
      setDenied(true);
    }
  }, []);

  function choose(calendar: WritableCalendar) {
    setChosenId(calendar.id);
    setChosenLabel(calendarLabel(calendar));
    if (db) {
      setSetting<string>(db, CALENDAR_ID_SETTING_KEY, calendar.id);
      setSetting<string>(db, CALENDAR_TITLE_SETTING_KEY, calendarLabel(calendar));
    }
  }

  const actions: ActionSheetAction[] = calendars.map((calendar) => ({
    key: calendar.id,
    label: calendarLabel(calendar),
    selected: calendar.id === chosenId,
    onPress: () => choose(calendar),
  }));

  return (
    <>
      <DrillDownRow
        title={t('webshooter.calendarRowTitle')}
        value={chosenLabel ?? t('webshooter.calendarNotSelected')}
        onPress={() => void openSheet()}
        testID="webshooter-calendar-row"
      />
      {denied && (
        <ThemedText type="small" themeColor="danger" testID="webshooter-calendar-denied">
          {t('webshooter.calendarPermissionDenied')}
        </ThemedText>
      )}
      <ActionSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={t('webshooter.calendarRowTitle')}
        actions={actions}
      />
    </>
  );
}
