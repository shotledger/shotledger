// The series photo, full screen, with its marks and group figures when it was
// scored from the photo.
//
// Route shape mirrors scan.tsx (`?pos=`), so both act on a series without
// nesting the series route.
import {
  analyzeGroup,
  analyzePointsLost,
  seriesTargetFace,
  getTargetFace,
  tenthsToScore,
} from '@shotledger/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionSheet } from '@/components/action-sheet';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { GroupStats } from '@/components/group-stats';
import { OverflowIcon } from '@/components/icons';
import { MarkCanvas } from '@/components/mark-canvas';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ShotChips } from '@/components/shot-chips';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { getSeries } from '@/db/queries/series';
import { listMarksForSeries } from '@/db/queries/shot-marks';
import type { Mark } from '@/features/photo-scoring/marks';
import { deserializeTransform } from '@/features/photo-scoring/transform';
import { loadSessionDetail } from '@/features/session/use-session-detail';
import { resolveSeriesPhotoUri } from '@/platform/sync-photos';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme/tokens';

/**
 * How far the photo's aspect ratio may differ from the one the geometry was
 * measured on before the overlay is withheld — a mismatch means the file is
 * not the one that was scored (or was rotated since), and rings drawn on it
 * would be confidently wrong.
 */
const ASPECT_TOLERANCE = 0.02;

export default function SeriesPhotoScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, pos, from } = useLocalSearchParams<{ id: string; pos?: string; from?: string }>();
  const position = Number(pos ?? '1');

  const detail = useMemo(() => loadSessionDetail(id), [id]);
  const row = detail.seriesRows.find((series) => series.position === position);
  const uri = resolveSeriesPhotoUri(row?.photoUri ?? null);

  const target = getTargetFace(
    seriesTargetFace(
      detail.session?.disciplineId ?? '',
      detail.session?.programId ?? null,
      position,
    ) ?? '',
  );

  // Marks exist only where the series was scored by tapping holes on the
  // photo, so their presence is what distinguishes the two ways a score got
  // here — a photo can be attached to a keypad-entered series too.
  const scored = useMemo(() => {
    if (!db || !row) return null;
    const stored = listMarksForSeries(db, row.id);
    if (stored.length === 0) return null;
    const marks: Mark[] = stored.map((m) => ({
      id: m.shotId,
      xMm: m.xMm,
      yMm: m.yMm,
      caliberMm: m.caliberMm,
      isInnerTen: m.isInnerTen,
      calledRingLabel: null,
      moved: false,
      suggested: false,
    }));
    return {
      marks,
      analysis: analyzeGroup(marks),
      pointsLost: target ? analyzePointsLost(marks, target) : null,
      // Series scored before the geometry was stored have none: stats only.
      geometry: deserializeTransform(getSeries(db, row.id)?.photoGeometry),
    };
  }, [row, target]);

  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const theme = useTheme();

  const geometry = scored?.geometry ?? null;
  const aspectMatches =
    geometry !== null &&
    natural !== null &&
    Math.abs(
      natural.width / natural.height - geometry.geometry.imageWidth / geometry.geometry.imageHeight,
    ) <=
      ASPECT_TOLERANCE * (geometry.geometry.imageWidth / geometry.geometry.imageHeight);
  // The original is drawn in a box sized to the geometry image; both have the
  // same aspect, so geometry px scale onto it with the one fit factor.
  const overlay = geometry && target && aspectMatches ? geometry : null;
  const imageWidth = geometry?.geometry.imageWidth ?? natural?.width ?? 1;
  const imageHeight = geometry?.geometry.imageHeight ?? natural?.height ?? 1;

  if (!uri) {
    return (
      <Screen>
        <Card>
          <ThemedText type="subtitle">{t('session.photoMissingTitle')}</ThemedText>
          <ThemedText themeColor="textSecondary">{t('session.photoMissingBody')}</ThemedText>
        </Card>
        <PrimaryButton label={t('common.close')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <View style={styles.titleRow}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('session.seriesTitle', { position })}
        </ThemedText>
        {/* Re-scoring is the series view's business. From the gallery this is
            a picture you are looking at, so the action is offered only where
            you arrived with a series in hand. */}
        {from !== 'gallery' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('photoScoring.menuLabel')}
            testID="photo-menu"
            onPress={() => setMenuOpen(true)}
            style={styles.menuTrigger}
          >
            <OverflowIcon color={theme.primary} />
          </Pressable>
        )}
      </View>
      <MarkCanvas
        style={styles.stage}
        testID="series-photo"
        readOnly
        photoUri={uri}
        imageWidth={imageWidth}
        imageHeight={imageHeight}
        transform={overlay?.transform}
        target={overlay ? target : undefined}
        marks={overlay ? scored?.marks : undefined}
        onImageSize={(width, height) => setNatural({ width, height })}
      />
      {/* What the photo was worth. Arriving from the gallery you are
          browsing, not scoring, and a bare "Score from This Photo" answered
          a question nobody asked (maintainer, on device 2026-09-11). */}
      {row && !row.isSighter && (
        <View style={styles.scoreRow}>
          <ThemedText type="subtitle" testID="photo-score">
            {t('photoScoring.scoreLine', {
              total: tenthsToScore(row.totalTenths),
              x: row.shots.filter((shot) => shot.isInnerTen).length,
            })}
          </ThemedText>
          <Chip label={t(scored ? 'session.scoredFromPhoto' : 'session.scoredManually')} />
        </View>
      )}
      {row && row.shots.length > 0 && (
        <ShotChips shots={row.shots} mode={detail.scoringMode} testIDPrefix="photo-shot" />
      )}
      {scored?.analysis && (
        <GroupStats
          analysis={scored.analysis}
          pointsLost={scored.pointsLost}
          testIDPrefix="photo-stat"
        />
      )}
      {scored && !geometry && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('photoScoring.groupNeedsGeometry')}
        </ThemedText>
      )}

      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={[
          {
            key: 'rescore',
            label: t('session.photoRescore'),
            onPress: () => router.replace(`/session/${id}/scan?pos=${position}`),
          },
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuTrigger: {
    // Material's 48dp touch-target floor, as the scan screen's.
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  stage: {
    flex: 1,
    marginVertical: Spacing.two,
  },
});
