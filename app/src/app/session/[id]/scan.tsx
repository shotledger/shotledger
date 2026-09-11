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
import { getDiscipline, requireTargetFace } from '@shotledger/shared';
import { uuidv7 } from 'uuidv7';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { CornerAdjuster, defaultCorners } from '@/components/corner-adjuster';
import { MarkLoupe } from '@/components/mark-loupe';
import { MarkOverlay } from '@/components/mark-overlay';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { getFirearm } from '@/db/queries/firearms';
import { updateSeries } from '@/db/queries/series';
import { saveSeriesMarks } from '@/db/queries/shot-marks';
import {
  CALIBER_KEYS,
  type CaliberKey,
  caliberMmFor,
  resolveCaliber,
} from '@/features/photo-scoring/caliber';
import {
  type CapturedPhoto,
  type GeometryImage,
  capturePhoto,
  prepareGeometryImage,
} from '@/features/photo-scoring/capture';
import { transformFromCorners } from '@/features/photo-scoring/corners';
import {
  createMarkState,
  markReducer,
  marksToShotMarkInputs,
  scoreMarks,
  seriesScoreLine,
} from '@/features/photo-scoring/marks';
import { runGeometry } from '@/features/photo-scoring/opencv';
import {
  type TargetTransform,
  fromProjective,
  fromRectification,
} from '@/features/photo-scoring/transform';
import { type ValidityReason, checkGeometryValidity } from '@/features/photo-scoring/validity';
import { loadSessionDetail } from '@/features/session/use-session-detail';
import { Spacing } from '@/theme/tokens';

type Phase = 'capture' | 'analyzing' | 'rejected' | 'corners' | 'marking';

/**
 * Phase 1 shipped auto-geometry for the precision face only (spec §0, CV
 * spike §6.2). The milsnabb face (§0 "milsnabb-photo-corners" amendment)
 * is added here as MANUAL-ONLY: `guess_kind` mistypes it on 8/10 photos and
 * a misdetection makes the ring scale 2.5x wrong, so the auto pipeline is
 * never attempted for it — capture goes straight to the four-corner screen.
 * Any other face still gets the "not supported" message.
 */
const AUTO_FACE_ID = 'spsf-pistol-25m-precision';
const MANUAL_ONLY_FACE_ID = 'spsf-snabbskjutning-25m';
const SUPPORTED_FACE_IDS: ReadonlySet<string> = new Set([AUTO_FACE_ID, MANUAL_ONLY_FACE_ID]);

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
  const { id, pos } = useLocalSearchParams<{ id: string; pos?: string }>();
  const position = Number(pos ?? '1');

  const detail = useMemo(() => loadSessionDetail(id), [id]);
  const row = detail.seriesRows.find((series) => series.position === position);
  const faceId = getDiscipline(detail.session?.disciplineId ?? '')?.targetFace ?? '';
  const supported = SUPPORTED_FACE_IDS.has(faceId);
  const manualOnly = faceId === MANUAL_ONLY_FACE_ID;
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
  const [reasons, setReasons] = useState<readonly ValidityReason[]>([]);
  const [corners, setCorners] = useState<readonly Point[]>([]);
  const [caliberKey, setCaliberKey] = useState<CaliberKey>(initialCaliber.key);
  const [notice, setNotice] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  const [markState, dispatch] = useReducer(
    markReducer,
    createMarkState({ maxMarks: detail.seriesLength, caliberMm: initialCaliber.caliberMm }),
  );

  const scores = target ? scoreMarks(markState.marks, target) : [];
  const line = seriesScoreLine(markState.marks, scores);
  const selectedIndex = markState.marks.findIndex((m) => m.id === markState.selectedId);
  const selectedScore = selectedIndex >= 0 ? scores[selectedIndex] : undefined;
  const selectedMark = selectedIndex >= 0 ? markState.marks[selectedIndex] : undefined;

  async function analyze(captured: CapturedPhoto) {
    if (!target) return;
    setPhase('analyzing');
    try {
      const image = await prepareGeometryImage(captured);
      setGeometryImage(image);
      if (manualOnly) {
        // The auto pipeline is validated for the precision face's solid
        // black disc only (spec §0); the milsnabb annulus goes straight to
        // manual corners rather than risk a confident, wrong lock.
        setCorners(defaultCorners(image.width, image.height));
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
        setCorners(defaultCorners(image.width, image.height));
        setPhase('rejected');
        return;
      }
      setTransform(fromRectification(result.transform));
      setPhase('marking');
    } catch {
      // A pipeline throw ("no dark region found") is the same product
      // outcome as a failed gate: we could not lock the target.
      setReasons(['zoneContrast']);
      setPhase('rejected');
    }
  }

  async function onCapture(source: 'camera' | 'library') {
    const result = await capturePhoto(source);
    if (result === 'denied') {
      Alert.alert(t('photoScoring.permissionDenied'));
      return;
    }
    if (!result) return;
    setPhoto(result);
    if (db && row) updateSeries(db, row.id, { photoUri: result.originalUri });
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
    if (cameraAutoOpened.current) return;
    cameraAutoOpened.current = true;
    void onCapture('camera');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on arrival
  }, []);

  function onUseCorners() {
    if (!target) return;
    const projective = transformFromCorners(corners, target);
    if (!projective) {
      setNotice(t('photoScoring.cornersInvalid'));
      return;
    }
    setNotice(null);
    setTransform(fromProjective(projective));
    setPhase('marking');
  }

  function onRetake() {
    setPhoto(null);
    setGeometryImage(null);
    setTransform(null);
    setReasons([]);
    dispatch({ type: 'clear' });
    setMoving(false);
    setPhase('capture');
  }

  function onTapEmpty(mm: Point) {
    if (markState.marks.length >= markState.maxMarks) {
      setNotice(t('photoScoring.limitReached', { count: markState.maxMarks }));
      return;
    }
    setNotice(null);
    dispatch({ type: 'tap', id: uuidv7(), xMm: mm.x, yMm: mm.y });
  }

  function onSave(next: boolean) {
    if (db && row) {
      saveSeriesMarks(db, row.id, marksToShotMarkInputs(markState.marks, scores));
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
            {notice && <ThemedText themeColor="danger">{notice}</ThemedText>}
            <PrimaryButton
              label={t('photoScoring.useCorners')}
              onPress={onUseCorners}
              testID="scan-use-corners"
            />
            <PrimaryButton label={t('photoScoring.retake')} onPress={onRetake} />
          </>
        )}

        {phase === 'marking' && geometryImage && transform && target && (
          <>
            <MarkOverlay
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
            />

            <View style={styles.scoreLine}>
              <ThemedText type="subtitle" testID="scan-score-line">
                {t('photoScoring.scoreLine', { total: line.total, x: line.innerTenCount })}
              </ThemedText>
              <ThemedText themeColor="textSecondary" testID="scan-shot-values">
                {line.shotValues.join(' ')}
              </ThemedText>
              {transform.source === 'manual' && <Chip label={t('photoScoring.manualGeometry')} />}
            </View>

            {notice && <ThemedText themeColor="danger">{notice}</ThemedText>}
            {!notice && (
              <ThemedText type="small" themeColor="textSecondary">
                {t('photoScoring.markHint')}
              </ThemedText>
            )}

            {selectedScore && (
              <Card>
                <View style={styles.row}>
                  <PrimaryButton
                    label={moving ? t('photoScoring.doneMoving') : t('photoScoring.move')}
                    onPress={() => setMoving((was) => !was)}
                    testID="mark-move"
                  />
                  <PrimaryButton
                    label={t('photoScoring.delete')}
                    onPress={() => {
                      setMoving(false);
                      dispatch({ type: 'delete' });
                    }}
                    testID="mark-delete"
                  />
                  <PrimaryButton
                    label={t('photoScoring.markInnerTen')}
                    onPress={() => dispatch({ type: 'toggleInnerTen' })}
                    testID="mark-inner-ten"
                  />
                </View>

                {moving && photo && selectedMark && (
                  <MarkLoupe
                    photo={photo}
                    center={transform.toImage({ x: selectedMark.xMm, y: selectedMark.yMm })}
                    scaleToOriginal={geometryImage.scaleToOriginal}
                    onNudge={(dx, dy) => {
                      // The loupe reports a delta in geometry-image px; the
                      // mark lives in mm, so it round-trips through the
                      // transform rather than assuming a fixed mm-per-px.
                      const here = transform.toImage({ x: selectedMark.xMm, y: selectedMark.yMm });
                      const next = transform.toMm({ x: here.x + dx, y: here.y + dy });
                      dispatch({ type: 'move', xMm: next.x, yMm: next.y });
                    }}
                  />
                )}

                {selectedScore.candidates.length > 1 && (
                  <View style={styles.edgeCall} testID="mark-edge-call">
                    <ThemedText type="smallBold">{t('photoScoring.edgeCall')}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('photoScoring.edgeCallHint')}
                    </ThemedText>
                    <View style={styles.row}>
                      {selectedScore.candidates.map((candidate) => (
                        <Pressable
                          key={candidate.label}
                          onPress={() => dispatch({ type: 'callRing', ringLabel: candidate.label })}
                          testID={`edge-call-${candidate.label}`}
                        >
                          <Chip
                            label={candidate.label}
                            tone={
                              selectedScore.effective.label === candidate.label
                                ? 'primary'
                                : 'neutral'
                            }
                          />
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}
              </Card>
            )}

            <Card>
              <ThemedText type="small" themeColor="textSecondary">
                {initialCaliber.matched
                  ? t('photoScoring.caliber')
                  : t('photoScoring.caliberGuessed', { caliber: caliberKey })}
              </ThemedText>
              <View style={styles.row}>
                {CALIBER_KEYS.map((key) => (
                  <Pressable
                    key={key}
                    onPress={() => {
                      setCaliberKey(key);
                      dispatch({ type: 'setCaliber', caliberMm: caliberMmFor(key) });
                    }}
                    testID={`caliber-${key}`}
                  >
                    <Chip label={key} tone={key === caliberKey ? 'primary' : 'neutral'} />
                  </Pressable>
                ))}
              </View>
            </Card>

            <PrimaryButton
              label={t('photoScoring.save')}
              onPress={() => onSave(false)}
              testID="scan-save"
            />
            <PrimaryButton
              label={t('photoScoring.scanNext')}
              onPress={() => onSave(true)}
              testID="scan-next"
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
  scoreLine: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    alignItems: 'center',
  },
  edgeCall: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
