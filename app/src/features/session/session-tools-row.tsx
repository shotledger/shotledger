// The two things a shooter reaches for mid-session, as a pair of text
// buttons rather than a pair of permanent panels. Text, not outlined: they
// are tools beside the result, and outlined buttons between the session's
// name and its result read as the screen's main actions (#822, finding
// "Order on session detail"); the screen puts them under the result.
//
// The stopwatch used to sit expanded at the top of the session view. Many
// shooters bring their own — a phone stopwatch, a wrist timer, the range
// clock — so for most sessions it was a block of screen that did nothing but
// push the series list down (maintainer, 2026-09-12). Behind a button it
// costs one row and opens over the session when it is actually wanted.
//
// Sights sits next to it for the same reason it left the ⋮ menu: adjusting
// the sight setting is something you do AT the firing point, between series,
// and a menu is the wrong depth for a thing done that often.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Button } from '@/components/button';
import { db } from '@/db/client';
import { listSightSettings } from '@/db/queries/sight-settings';
import { SessionSightsSheet } from '@/features/session/session-sights-sheet';
import { SessionStopwatch } from '@/features/session/session-stopwatch';
import { useFeatures } from '@/features/settings/feature-visibility';
import { Spacing } from '@/theme/tokens';

export interface SessionToolsRowProps {
  sessionId: string;
  /** Null when the session has no firearm, which disables the Sights button. */
  sightsFirearmId: string | null;
}

type OpenSheet = 'none' | 'stopwatch' | 'sights';

export function SessionToolsRow({ sessionId, sightsFirearmId }: SessionToolsRowProps) {
  const { t } = useTranslation();
  const [sheet, setSheet] = useState<OpenSheet>('none');
  // Sight settings hidden (#801): the stopwatch alone.
  const { sightSettings: showSights } = useFeatures();
  const [sightSettings, setSightSettings] = useState<ReturnType<typeof listSightSettings>>([]);

  function loadSights() {
    if (!sightsFirearmId) return [];
    const rows = listSightSettings(db, sightsFirearmId);
    setSightSettings(rows);
    return rows;
  }

  return (
    <>
      <View style={styles.row}>
        <Button
          variant="text"
          label={t('session.stopwatchButton')}
          onPress={() => setSheet('stopwatch')}
          testID="session-open-stopwatch"
        />
        {showSights && (
          <Button
            variant="text"
            label={t('session.menuSights')}
            onPress={() => {
              loadSights();
              setSheet('sights');
            }}
            disabled={sightsFirearmId === null}
            testID="session-open-sights"
          />
        )}
      </View>

      {/* The stopwatch keeps running when the sheet closes — it is the
          session's clock, not the sheet's, so dismissing the sheet to look at
          the series list must not stop timing. */}
      <BottomSheet
        visible={sheet === 'stopwatch'}
        onClose={() => setSheet('none')}
        title={t('session.stopwatchButton')}
        testID="session-stopwatch-sheet"
      >
        <SessionStopwatch sessionId={sessionId} />
      </BottomSheet>

      <SessionSightsSheet
        visible={sheet === 'sights'}
        onClose={() => setSheet('none')}
        firearmId={sightsFirearmId}
        settings={sightSettings}
        onChanged={loadSights}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
