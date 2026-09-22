// Shot-detection diagnostics — a data-collection screen for the range, not a
// feature. The current detector triggers on bare amplitude; this gathers the
// measurements needed to decide whether the ~60 ms metering envelope carries
// enough about an event's *duration* to tell a shot from a snap. The shooter
// meters, taps Mark Shot as they fire, and exports the whole sample log.
//
// All rules live in shared/src/timer/mic-diagnostics.ts; the microphone and
// the clock live in features/timer/use-mic-diagnostics.ts. This file renders.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ScreenTitle } from '@/components/screen-title';
import { Card } from '@/components/card';
import { useKeepAwakeOnScreen } from '@/features/timer/use-keep-awake-on-screen';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { StatTile } from '@/components/stat-tile';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useMicDiagnostics } from '@/features/timer/use-mic-diagnostics';
import { Spacing } from '@/theme/tokens';

const DASH = '–';

function db(value: number | null): string {
  return value === null ? DASH : value.toFixed(1);
}

export default function ShotDiagnosticsScreen() {
  const { t } = useTranslation();
  // The point of this screen is to sit on a bench at the range for minutes
  // at a time; locking loses the run.
  useKeepAwakeOnScreen('shot-diagnostics-screen');
  const [note, setNote] = useState('');
  const diagnostics = useMicDiagnostics();
  const { stats } = diagnostics;

  const excessDb = stats.currentDb === null ? null : stats.currentDb - stats.noiseFloorDb;
  const lastMark = stats.lastMark;

  return (
    <Screen>
      <ScreenTitle>{t('shotDiagnostics.title')}</ScreenTitle>
      <ThemedText type="small" themeColor="textSecondary">
        {t('shotDiagnostics.intro')}
      </ThemedText>

      <Card testID="diagnostics-meter">
        <ThemedText type="smallBold">{t('shotDiagnostics.liveTitle')}</ThemedText>
        <View style={styles.tileRow}>
          <StatTile
            label={t('shotDiagnostics.level')}
            value={db(stats.currentDb)}
            align="center"
            testID="diagnostics-level"
          />
          <StatTile
            label={t('shotDiagnostics.peak')}
            value={db(stats.peakDb)}
            align="center"
            testID="diagnostics-peak"
          />
        </View>
        <View style={styles.tileRow}>
          <StatTile
            label={t('shotDiagnostics.noiseFloor')}
            value={db(stats.noiseFloorDb)}
            align="center"
            testID="diagnostics-floor"
          />
          <StatTile
            label={t('shotDiagnostics.excess')}
            value={db(excessDb)}
            align="center"
            testID="diagnostics-excess"
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {t('shotDiagnostics.unitHint')}
        </ThemedText>
        <View style={styles.linkRow}>
          <Pressable
            accessibilityRole="button"
            onPress={diagnostics.resetPeak}
            testID="diagnostics-reset-peak"
          >
            <ThemedText type="linkPrimary">{t('shotDiagnostics.resetPeak')}</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={diagnostics.clear}
            testID="diagnostics-clear"
          >
            <ThemedText type="linkPrimary">{t('shotDiagnostics.clearRecording')}</ThemedText>
          </Pressable>
        </View>
      </Card>

      <PrimaryButton
        label={diagnostics.recording ? t('shotDiagnostics.stop') : t('shotDiagnostics.start')}
        onPress={() => {
          void (diagnostics.recording ? diagnostics.stop() : diagnostics.start());
        }}
        testID="diagnostics-toggle"
      />

      {diagnostics.error !== null && (
        <ThemedText type="small" themeColor="danger" testID="diagnostics-error">
          {t(`shotDiagnostics.errors.${diagnostics.error}` as const)}
        </ThemedText>
      )}

      <Card testID="diagnostics-marks">
        <ThemedText type="smallBold">{t('shotDiagnostics.markTitle')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('shotDiagnostics.markHint')}
        </ThemedText>
        <PrimaryButton
          label={t('shotDiagnostics.markShot')}
          onPress={diagnostics.markShot}
          disabled={!diagnostics.recording}
          testID="diagnostics-mark"
        />
        <ThemedText type="default" testID="diagnostics-mark-count">
          {t('shotDiagnostics.markCount', { marks: stats.markCount })}
        </ThemedText>
        {lastMark !== null && (
          <ThemedText type="small" themeColor="textSecondary" testID="diagnostics-last-mark">
            {t('shotDiagnostics.lastMark', {
              peak: db(lastMark.peakDb),
              excess: db(lastMark.excessDb),
              count: lastMark.samplesAboveFloor,
            })}
          </ThemedText>
        )}
      </Card>

      <Card testID="diagnostics-export">
        <ThemedText type="smallBold">{t('shotDiagnostics.exportTitle')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" testID="diagnostics-sample-count">
          {t('shotDiagnostics.sampleCount', {
            samples: stats.sampleCount,
            max: diagnostics.maxSamples,
          })}
        </ThemedText>
        {stats.droppedSampleCount > 0 && (
          <ThemedText type="small" themeColor="textSecondary" testID="diagnostics-dropped">
            {t('shotDiagnostics.dropped', { dropped: stats.droppedSampleCount })}
          </ThemedText>
        )}
        <ThemedText type="smallBold">{t('shotDiagnostics.noteLabel')}</ThemedText>
        <TextField
          value={note}
          onChangeText={setNote}
          placeholder={t('shotDiagnostics.notePlaceholder')}
          testID="diagnostics-note"
        />
        <PrimaryButton
          label={t('shotDiagnostics.export')}
          onPress={() => {
            void diagnostics.exportRecording(note);
          }}
          disabled={stats.sampleCount === 0}
          testID="diagnostics-export-button"
        />
        {diagnostics.exportStatus !== 'idle' && (
          <ThemedText type="small" themeColor="textSecondary" testID="diagnostics-export-status">
            {t(`shotDiagnostics.exportStatus.${diagnostics.exportStatus}` as const)}
          </ThemedText>
        )}
      </Card>

      <ThemedText type="small" themeColor="textSecondary">
        {t('timer.shots.privacyNote')}
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tileRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
