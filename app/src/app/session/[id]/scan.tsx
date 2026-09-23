// Photo scoring phase 1: capture -> auto-geometry -> tap-to-mark -> save.
// Spec: docs/specs/photo-scoring-phase1-spec.md §5/§6.
//
// The screen is a small state machine over five phases. Everything it
// decides is delegated: `runGeometry` measures, `checkGeometryValidity`
// judges, `markReducer` owns the interaction rules, `scoreHole` owns the SHB
// edge rule. What is left here is sequencing and presentation.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { Point } from '@shotledger/shared';
import { analyzeGroup, getDiscipline, requireTargetFace } from '@shotledger/shared';
import { uuidv7 } from 'uuidv7';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { CornerAdjuster, defaultCorners } from '@/components/corner-adjuster';
import { GroupStats } from '@/components/group-stats';
import { MarkActionBar } from '@/components/mark-action-bar';
import { MarkCanvas } from '@/components/mark-canvas';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { SecondaryButton } from '@/components/secondary-button';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { getFirearm } from '@/db/queries/firearms';
import { addSeries, updateSeries } from '@/db/queries/series';
import { getSetting, SETTINGS_KEYS } from '@/db/queries/settings';
import { saveSeriesMarks } from '@/db/queries/shot-marks';
import { recordTrainingSample } from '@/db/queries/training-samples';
import { CALIBER_KEYS, caliberMmFor, resolveCaliber } from '@/features/photo-scoring/caliber';
import {
  type CapturedPhoto,
  type GeometryImage,
  capturePhoto,
  prepareGeometryImage,
} from '@/features/photo-scoring/capture';
import { transformFromCorners } from '@/features/photo-scoring/corners';
import {
  isAutoFace,
  isManualOnlyFace,
  isPhotoScoringSupported,
} from '@/features/photo-scoring/faces';
import {
  canUndo,
  createMarkState,
  markReducer,
  marksToShotMarkInputs,
  scoreMarks,
  seriesScoreLine,
} from '@/features/photo-scoring/marks';
import { proposeHolesAsync } from '@/features/photo-scoring/hole-proposals';
import { nativeMapOps } from '@/features/photo-scoring/hole-proposals-native';
import { rectifyFromHomography, runGeometry } from '@/features/photo-scoring/opencv';
import { snapToHole, type RectifiedCanvas } from '@/features/photo-scoring/tap-snap';
import {
  type TargetTransform,
  fromProjective,
  fromRectification,
  serializeTransform,
} from '@/features/photo-scoring/transform';
import { type ValidityReason, checkGeometryValidity } from '@/features/photo-scoring/validity';
import { loadSessionDetail } from '@/features/session/use-session-detail';
import { Radius, Spacing } from '@/theme/tokens';

type Phase = 'capture' | 'analyzing' | 'rejected' | 'corners' | 'marking';

const REASON_KEYS: Record<ValidityReason, string> = {
  axisRatio: 'photoScoring.reasonAxisRatio',
  zoneFraction: 'photoScoring.reasonZoneFraction',
  centerInFrame: 'photoScoring.reasonCenterInFrame',
  zoneContrast: 'photoScoring.reasonZoneContrast',
  profileScore: 'photoScoring.reasonProfileScore',
};

export default function ScanScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, pos, final } = useLocalSearchParams<{ id: string; pos?: string; final?: string }>();
  const position = Number(pos ?? '1');

  const detail = useMemo(() => loadSessionDetail(id), [id]);
  const row = detail.seriesRows.find((series) => series.position === position);
  const faceId = getDiscipline(detail.session?.disciplineId ?? '')?.targetFace ?? '';
  const supported = isPhotoScoringSupported(faceId);
  const manualOnly = isManualOnlyFace(faceId);
  const target = supported ? requireTargetFace(faceId) : undefined;

  // Caliber comes from the session's firearm; the picker is the fallback when
  // the free-text caliber string does not match a known preset.
  const firearmId = detail.session?.firearmId ?? null;
  const firearm = db && firearmId ? getFirearm(db, firearmId) : undefined;
  const initialCaliber = resolveCaliber(firearm?.caliber);

  const [phase, setPhase] = useState<Phase>('capture');
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [geometryImage, setGeometryImage] = useState<GeometryImage | null>(null);
  const [transform, setTransform] = useState<TargetTransform | null>(null);
  // Held only while marking, and dropped on retake: a few megabytes of
  // rectified gray pixels that tap-snap searches.
  const [canvas, setCanvas] = useState<RectifiedCanvas | null>(null);
  const [reasons, setReasons] = useState<readonly ValidityReason[]>([]);
  const [corners, setCorners] = useState<readonly Point[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  // Which ring the four corners are being placed on. The outermost by
  // default; changeable because a landscape crop of the 500 mm milsnabb face
  // routinely cuts the 5 ring off, and placing the corners on a visible ring
  // while the code assumes the outermost scales every measurement.
  const [cornerRing, setCornerRing] = useState<string | null>(null);
  // The detector's pass over the canvas: pending, unsure (it proposed far
  // too many to trust), or how many it proposed.
  // Null until a photo has locked; a retake resets it. `proposalRun` lets a
  // retake disown a pass that was scheduled for the previous photo.
  const [suggested, setSuggested] = useState<'pending' | 'unsure' | number | null>(null);
  const proposalRun = useRef(0);
  // A mark is being dragged: the action bar steps aside for the loupe.
  const [dragging, setDragging] = useState(false);

  const [markState, dispatch] = useReducer(
    markReducer,
    createMarkState({ maxMarks: detail.seriesLength, caliberMm: initialCaliber.caliberMm }),
  );
  // The suggestions still on the canvas, which is what the hint talks about.
  const suggestedCount = markState.marks.filter((m) => m.suggested).length;
  // Derived, not stored, so undoing a caliber change moves the chip back too.
  const caliberKey = CALIBER_KEYS.find((key) => caliberMmFor(key) === markState.caliberMm);

  const scores = target ? scoreMarks(markState.marks, target) : [];
  const line = seriesScoreLine(markState.marks, scores);
  const group =
    markState.marks.length >= 2
      ? analyzeGroup(markState.marks.map((m) => ({ xMm: m.xMm, yMm: m.yMm })))
      : null;
  const selectedIndex = markState.marks.findIndex((m) => m.id === markState.selectedId);
  const selectedScore = selectedIndex >= 0 ? scores[selectedIndex] : undefined;
  const selectedMark = selectedIndex >= 0 ? markState.marks[selectedIndex] : undefined;

  async function analyze(captured: CapturedPhoto) {
    if (!target) return;
    setPhase('analyzing');
    try {
      const image = await prepareGeometryImage(captured);
      setGeometryImage(image);
      // Set before the pipeline runs, so a pipeline throw still reaches the
      // corner screen with four handles to drag.
      setCorners(defaultCorners(image.width, image.height));
      if (manualOnly) {
        // The auto pipeline is validated for the precision face's solid
        // black disc only (spec §0); the milsnabb annulus goes straight to
        // manual corners rather than risk a confident, wrong lock.
        setPhase('corners');
        return;
      }
      const result = runGeometry({
        base64: image.base64,
        width: image.width,
        height: image.height,
        referenceDiameterMm: target.referenceDiameterMm,
        ringRadiiMm: target.rings.map((ring) => ring.diameterMm / 2),
      });
      const validity = checkGeometryValidity(result.metrics);
      if (!validity.valid) {
        setReasons(validity.reasons);
        setPhase('rejected');
        return;
      }
      setTransform(fromRectification(result.transform));
      setCanvas(result.canvas);
      setPhase('marking');
      suggestHoles(result.canvas, target);
    } catch {
      // A pipeline throw ("no dark region found") is the same product
      // outcome as a failed gate: we could not lock the target.
      setReasons(['zoneContrast']);
      setPhase('rejected');
    }
  }

  /**
   * Runs the hole detector over the rectified canvas and places what it finds
   * as suggested marks. The whole-canvas maps go to OpenCV and the rest runs
   * in yielding batches, so the marking screen paints and takes taps while it
   * works — the reducer skips a proposal that lands on a mark the shooter
   * placed meanwhile. Only the automatic path has a canvas; corners placed by
   * hand give no rectified pixels to search.
   */
  function suggestHoles(rectified: RectifiedCanvas, face: NonNullable<typeof target>) {
    const run = (proposalRun.current += 1);
    setSuggested('pending');
    void proposeHolesAsync(
      rectified,
      {
        caliberMm: markState.caliberMm,
        blackRadiusMm: face.referenceDiameterMm / 2,
        maxRadiusMm: Math.max(...face.rings.map((ring) => ring.diameterMm / 2)),
        ringRadiiMm: face.rings.map((ring) => ring.diameterMm / 2),
      },
      { ops: nativeMapOps ?? undefined },
    )
      .then((proposals) => {
        if (proposalRun.current !== run) return;
        // Far more holes than the series holds means the detector does not
        // understand this photo (measured on real targets it proposes about
        // one false hole in three photos). Suggesting nothing beats covering
        // the target in marks to delete.
        if (proposals.length > 2 * markState.maxMarks + 2) {
          setSuggested('unsure');
          return;
        }
        dispatch({
          type: 'suggest',
          marks: proposals.map((p) => ({ id: uuidv7(), xMm: p.xMm, yMm: p.yMm })),
        });
        setSuggested(proposals.length);
      })
      .catch((error: unknown) => {
        // A detector failure is the same as finding nothing: the shooter
        // marks by hand, as before this stage existed.
        if (__DEV__) console.warn('hole proposals failed', error);
        if (proposalRun.current === run) setSuggested(0);
      });
  }

  async function onCapture(source: 'camera' | 'library') {
    const result = await capturePhoto(source);
    if (result === 'denied') {
      Alert.alert(t('photoScoring.permissionDenied'));
      return;
    }
    if (!result) return;
    setPhoto(result);
    // The old geometry belongs to the old photo; it is written again on save.
    if (db && row) updateSeries(db, row.id, { photoUri: result.originalUri, photoGeometry: null });
    await analyze(result);
  }

  // Straight into the camera on arrival (maintainer, 2026-09-11: "Is it not
  // possible to just shot the camera direct"). Backing out of the OS camera
  // lands on the capture card, where the library is one tap away — a gallery
  // button *inside* the viewfinder is not possible here, because
  // launchCameraAsync hands off to the system camera app, whose UI is not ours.
  //
  // A ref, not state: this must fire exactly once per visit and must not
  // re-render when it flips.
  const cameraAutoOpened = useRef(false);
  useEffect(() => {
    // An unsupported face shows its message straight away: a photo taken
    // first would be thrown away.
    if (cameraAutoOpened.current || !supported) return;
    cameraAutoOpened.current = true;
    void onCapture('camera');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on arrival
  }, []);

  function onUseCorners() {
    if (!target) return;
    const projective = transformFromCorners(corners, target, cornerRing ?? undefined);
    if (!projective) {
      setNotice(t('photoScoring.cornersInvalid'));
      return;
    }
    setNotice(null);
    setTransform(fromProjective(projective));
    setPhase('marking');
    // Corners placed by hand still give a mm mapping, so the photo can be
    // straightened the same way an automatic lock does it — which is what
    // lets tap-snap and the hole detector help on a close-up too. Only on the
    // face they were measured on.
    if (geometryImage && isAutoFace(faceId)) {
      try {
        const rectified = rectifyFromHomography({
          base64: geometryImage.base64,
          toMm: projective.toMm,
          outerRadiusMm: Math.max(...target.rings.map((ring) => ring.diameterMm / 2)),
        });
        setCanvas(rectified);
        suggestHoles(rectified, target);
      } catch (error: unknown) {
        // Without a canvas the shooter marks by hand, as before.
        if (__DEV__) console.warn('rectify from corners failed', error);
      }
    }
  }

  function onRetake() {
    setPhoto(null);
    setGeometryImage(null);
    setTransform(null);
    setCanvas(null);
    setReasons([]);
    setCornerRing(null);
    proposalRun.current += 1;
    setSuggested(null);
    dispatch({ type: 'clear' });
    setNotice(null);
    setPhase('capture');
  }

  function onTapEmpty(mm: Point) {
    if (markState.marks.length >= markState.maxMarks) {
      setNotice(t('photoScoring.limitReached', { count: markState.maxMarks }));
      return;
    }
    setNotice(null);

    // The finger covers the hole it is aiming at, so the tap carries the
    // shooter's intent and not their precision. `snapToHole` refines it onto
    // the hole when it can see one, and returns null when it cannot — in
    // which case the tap stands exactly as placed.
    const snapped = canvas
      ? snapToHole(canvas, { xMm: mm.x, yMm: mm.y }, { caliberMm: markState.caliberMm })
      : null;
    const point = snapped ?? { xMm: mm.x, yMm: mm.y };
    dispatch({ type: 'tap', id: uuidv7(), xMm: point.xMm, yMm: point.yMm });
  }

  function onSave(next: boolean) {
    // A series added straight into "Score from Photo" has no row yet; it is
    // written here, as the keypad screen writes its own on save.
    const seriesId =
      row?.id ??
      (db && markState.marks.length > 0
        ? addSeries(db, {
            sessionId: id,
            position,
            isFinal: final === '1',
            photoUri: photo?.originalUri ?? null,
          }).id
        : null);
    if (db && seriesId) {
      saveSeriesMarks(db, seriesId, marksToShotMarkInputs(markState.marks, scores));
      // Kept with the photo so the series can draw its marks over it later.
      if (transform && geometryImage) {
        updateSeries(db, seriesId, {
          photoGeometry: serializeTransform(transform, geometryImage.width, geometryImage.height),
        });
      }

      // Every tap-to-mark is a labelled example, already in canonical
      // target-mm because the geometry is solved by now. Kept only with the
      // shooter's explicit opt-in, and only on this device — see
      // db/queries/training-samples.ts. The consent is read here, at the one
      // call site, rather than hidden inside the write.
      if (transform && getSetting<boolean>(db, SETTINGS_KEYS.photoTrainingConsent, false)) {
        recordTrainingSample(db, {
          seriesId,
          targetFaceId: faceId,
          geometrySource: transform.source,
          photoUri: photo?.originalUri ?? null,
          marks: markState.marks.map((m) => ({
            xMm: m.xMm,
            yMm: m.yMm,
            caliberMm: m.caliberMm,
            moved: m.moved,
            calledRingLabel: m.calledRingLabel,
            suggested: m.suggested,
          })),
        });
      }
    }
    if (next) {
      onRetake();
      router.replace(`/session/${id}/scan?pos=${position + 1}`);
      return;
    }
    router.back();
  }

  if (!supported) {
    return (
      <Screen>
        <Card>
          <ThemedText type="subtitle">{t('photoScoring.unsupportedTitle')}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {t('photoScoring.unsupportedBody', { face: faceId })}
          </ThemedText>
        </Card>
        <PrimaryButton label={t('common.cancel')} onPress={() => router.back()} />
      </Screen>
    );
  }

  if (phase === 'marking' && geometryImage && transform && target) {
    return (
      <Screen scroll={false}>
        <View style={styles.marking}>
          <View style={styles.toolbar}>
            <View style={styles.scoreLine}>
              <ThemedText type="subtitle" testID="scan-score-line">
                {t('photoScoring.scoreLine', { total: line.total, x: line.innerTenCount })}
              </ThemedText>
              <ThemedText themeColor="textSecondary" testID="scan-shot-values">
                {line.shotValues.join(' ')}
              </ThemedText>
            </View>
            <SecondaryButton
              label={t('photoScoring.undo')}
              onPress={() => dispatch({ type: 'undo' })}
              disabled={!canUndo(markState)}
              testID="mark-undo"
              style={styles.undo}
            />
          </View>
          {/* Its own line: beside the score it squeezed the shot values to "10 10 …". */}
          {transform.source === 'manual' && (
            <Chip label={t('photoScoring.manualGeometry')} style={styles.manualChip} />
          )}

          {group && <GroupStats analysis={group} testIDPrefix="scan-stat" />}

          {notice ? (
            <ThemedText type="small" themeColor="danger">
              {notice}
            </ThemedText>
          ) : suggested === 'pending' ? (
            <View style={styles.row}>
              <ActivityIndicator size="small" />
              <ThemedText type="small" themeColor="textSecondary" testID="scan-suggesting">
                {t('photoScoring.suggesting')}
              </ThemedText>
            </View>
          ) : suggestedCount > 0 ? (
            <ThemedText type="small" themeColor="textSecondary" testID="scan-suggested">
              {t('photoScoring.suggestedHint', { count: suggestedCount })}
            </ThemedText>
          ) : (
            markState.marks.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary" testID="scan-mark-hint">
                {`${
                  suggested === 'unsure'
                    ? t('photoScoring.suggestedUnsure')
                    : suggested === 0
                      ? t('photoScoring.suggestedNone')
                      : t('photoScoring.markHint')
                } ${t('photoScoring.zoomHint')}`}
              </ThemedText>
            )
          )}

          <View style={styles.canvasWrap}>
            <MarkCanvas
              style={StyleSheet.absoluteFill}
              photoUri={geometryImage.uri}
              imageWidth={geometryImage.width}
              imageHeight={geometryImage.height}
              transform={transform}
              target={target}
              marks={markState.marks}
              scores={scores}
              selectedId={markState.selectedId}
              onTapEmpty={onTapEmpty}
              onTapMark={(markId) => dispatch({ type: 'select', id: markId })}
              onDraggingChange={setDragging}
              onMoveMark={(markId, mm) => {
                setNotice(null);
                dispatch({ type: 'move', id: markId, xMm: mm.x, yMm: mm.y });
              }}
            />
            {selectedMark && selectedScore && !dragging && (
              <MarkActionBar
                style={styles.actionBar}
                mark={selectedMark}
                score={selectedScore}
                onDelete={() => dispatch({ type: 'delete' })}
                onToggleInnerTen={() => dispatch({ type: 'toggleInnerTen' })}
                onCallRing={(ringLabel) => dispatch({ type: 'callRing', ringLabel })}
                onDeselect={() => dispatch({ type: 'deselect' })}
              />
            )}
          </View>

          <View style={styles.caliberRow}>
            <ThemedText type="small" themeColor="textSecondary">
              {initialCaliber.matched
                ? t('photoScoring.caliber')
                : t('photoScoring.caliberGuessed', { caliber: initialCaliber.key })}
            </ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.row}>
                {CALIBER_KEYS.map((key) => (
                  <Pressable
                    key={key}
                    onPress={() => dispatch({ type: 'setCaliber', caliberMm: caliberMmFor(key) })}
                    testID={`caliber-${key}`}
                  >
                    <Chip label={key} tone={key === caliberKey ? 'primary' : 'neutral'} />
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>

          <View style={styles.actions}>
            <SecondaryButton
              label={t('photoScoring.retake')}
              onPress={onRetake}
              style={styles.action}
            />
            <SecondaryButton
              label={t('photoScoring.scanNext')}
              onPress={() => onSave(true)}
              testID="scan-next"
              style={styles.action}
            />
          </View>
          <PrimaryButton
            label={t('photoScoring.save')}
            onPress={() => onSave(false)}
            testID="scan-save"
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <ScrollView contentContainerStyle={styles.content}>
        {phase === 'capture' && (
          <Card>
            <ThemedText type="subtitle">{t('photoScoring.title')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('photoScoring.captureHint')}
            </ThemedText>
            <PrimaryButton
              label={t('photoScoring.capture')}
              onPress={() => onCapture('camera')}
              testID="scan-camera"
            />
            <PrimaryButton
              label={t('photoScoring.pickFromLibrary')}
              onPress={() => onCapture('library')}
              testID="scan-library"
            />
          </Card>
        )}

        {phase === 'analyzing' && (
          <Card>
            <ActivityIndicator testID="scan-analyzing" />
            <ThemedText themeColor="textSecondary">{t('photoScoring.analyzing')}</ThemedText>
          </Card>
        )}

        {phase === 'rejected' && (
          <Card>
            <ThemedText type="subtitle" testID="scan-lock-failed">
              {t('photoScoring.lockFailedTitle')}
            </ThemedText>
            <ThemedText themeColor="textSecondary">{t('photoScoring.lockFailedBody')}</ThemedText>
            {reasons.map((reason) => (
              <ThemedText key={reason} type="small" themeColor="textSecondary">
                {`• ${t(REASON_KEYS[reason])}`}
              </ThemedText>
            ))}
            <PrimaryButton
              label={t('photoScoring.retake')}
              onPress={onRetake}
              testID="scan-retake"
            />
            <PrimaryButton
              label={t('photoScoring.adjustCorners')}
              onPress={() => setPhase('corners')}
              testID="scan-adjust-corners"
            />
          </Card>
        )}

        {phase === 'corners' && photo && geometryImage && (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              {t(
                manualOnly ? 'photoScoring.milsnabbCornersHint' : 'photoScoring.adjustCornersHint',
              )}
            </ThemedText>
            <CornerAdjuster
              photoUri={geometryImage.uri}
              imageWidth={geometryImage.width}
              imageHeight={geometryImage.height}
              corners={corners}
              onChange={setCorners}
              photo={photo}
              scaleToOriginal={geometryImage.scaleToOriginal}
              labels={['1', '2', '3', '4']}
            />
            {target && (
              <Card>
                <ThemedText type="smallBold">{t('photoScoring.cornerRing')}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('photoScoring.cornerRingHint')}
                </ThemedText>
                <View style={styles.row}>
                  {target.rings.map((ring) => {
                    const outermost = target.rings[target.rings.length - 1]?.label;
                    const active = (cornerRing ?? outermost) === ring.label;
                    return (
                      <Pressable
                        key={ring.label}
                        onPress={() => setCornerRing(ring.label)}
                        testID={`corner-ring-${ring.label}`}
                      >
                        <Chip label={ring.label} tone={active ? 'primary' : 'neutral'} />
                      </Pressable>
                    );
                  })}
                </View>
              </Card>
            )}
            {notice && <ThemedText themeColor="danger">{notice}</ThemedText>}
            <PrimaryButton
              label={t('photoScoring.useCorners')}
              onPress={onUseCorners}
              testID="scan-use-corners"
            />
            <PrimaryButton label={t('photoScoring.retake')} onPress={onRetake} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    alignItems: 'center',
  },
  marking: {
    flex: 1,
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  scoreLine: {
    flex: 1,
  },
  manualChip: {
    alignSelf: 'flex-start',
  },
  undo: {
    paddingVertical: Spacing.two,
  },
  canvasWrap: {
    flex: 1,
    borderRadius: Radius.medium,
    overflow: 'hidden',
  },
  actionBar: {
    position: 'absolute',
    left: Spacing.two,
    right: Spacing.two,
    bottom: Spacing.two,
  },
  caliberRow: {
    gap: Spacing.one,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  action: {
    flex: 1,
  },
});
