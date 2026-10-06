// Photo scoring phase 1: capture -> auto-geometry -> tap-to-mark -> save.
// Spec: docs/specs/photo-scoring-phase1-spec.md §5/§6.
//
// The screen is a small state machine over five phases. Everything it
// decides is delegated: `runGeometry` measures, `checkGeometryValidity`
// judges, `markReducer` owns the interaction rules, `scoreHole` owns the SHB
// edge rule. What is left here is sequencing and presentation.
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { Point } from '@shotledger/shared';
import { analyzeGroup, requireTargetFace, seriesTargetFace } from '@shotledger/shared';
import { uuidv7 } from 'uuidv7';

import { ActionSheet } from '@/components/action-sheet';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { CornerAdjuster, defaultCorners } from '@/components/corner-adjuster';
import { GroupStats } from '@/components/group-stats';
import { OverflowIcon } from '@/components/icons';
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
import { type CloseupLock, chooseLock } from '@/features/photo-scoring/closeup-lock';
import { type MilsnabbLock, passesMilsnabbGate } from '@/features/photo-scoring/milsnabb-lock';
import {
  type Homography,
  ringOverlay,
  transformFromCorners,
} from '@/features/photo-scoring/corners';
import {
  isAutoFace,
  isManualOnlyFace,
  isMilsnabbLockFace,
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
import { isFlagEnabled } from '@/constants/flags';
import { holeCandidates, proposeHolesAsync } from '@/features/photo-scoring/hole-proposals';
import { type ScanNextTarget, scanNextTarget } from '@/features/photo-scoring/scan-next';
import { nativeMapOps } from '@/features/photo-scoring/hole-proposals-native';
import {
  type CloseupLockRun,
  type GeometryPipelineResult,
  rectifyFromHomography,
  runCloseupLock,
  runMilsnabbLock,
  runGeometry,
} from '@/features/photo-scoring/opencv';
import { faceAnswerFor, rememberFaceAnswer } from '@/features/photo-scoring/face-answers';
import {
  type FaceAnswer,
  faceDecision,
  holeDiametersMm,
  holesTooSmall,
  milsnabbLockRefuses,
  perspectiveRefuses,
  type PrecisionGuardRefusal,
  proposalFaceOf,
  xLineMissing,
} from '@/features/photo-scoring/precision-guards';
import { snapToHole, type RectifiedCanvas } from '@/features/photo-scoring/tap-snap';
import {
  type TargetTransform,
  fromProjective,
  fromRectification,
  homographyOf,
  invertHomography,
  serializeTransform,
} from '@/features/photo-scoring/transform';
import {
  type ValidityReason,
  type ValidityResult,
  checkGeometryValidity,
} from '@/features/photo-scoring/validity';
import { loadSessionDetail } from '@/features/session/use-session-detail';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/theme/tokens';

type Phase = 'capture' | 'analyzing' | 'rejected' | 'corners' | 'marking';

/** What the 'analyzing' card says, one stage of the lock at a time. */
type AnalyzeStage = 'target' | 'rings' | 'straighten';

const STAGE_KEYS: Record<AnalyzeStage, string> = {
  target: 'photoScoring.analyzing',
  rings: 'photoScoring.analyzingRings',
  straighten: 'photoScoring.analyzingStraighten',
};

/** A release build logs scan timings only when built with this set (#528). */
const LOG_SCAN_TIMING = __DEV__ || process.env.EXPO_PUBLIC_SCAN_TIMING === '1';

/** Starts timing a stage; the returned function logs its milliseconds to the
 *  device log. */
function timeStage(stage: string): () => void {
  const since = performance.now();
  return () => {
    if (LOG_SCAN_TIMING) {
      console.log(`[scan-timing] ${stage}: ${Math.round(performance.now() - since)} ms`);
    }
  };
}

type RejectReason = ValidityReason | PrecisionGuardRefusal;

const REASON_KEYS: Record<RejectReason, string> = {
  axisRatio: 'photoScoring.reasonAxisRatio',
  zoneFraction: 'photoScoring.reasonZoneFraction',
  centerInFrame: 'photoScoring.reasonCenterInFrame',
  zoneContrast: 'photoScoring.reasonZoneContrast',
  profileScore: 'photoScoring.reasonProfileScore',
  ringDrift: 'photoScoring.reasonRingDrift',
  milsnabbLock: 'photoScoring.reasonMilsnabbLock',
  perspective: 'photoScoring.reasonPerspective',
  holeSize: 'photoScoring.reasonHoleSize',
};

export default function ScanScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const { id, pos, final } = useLocalSearchParams<{ id: string; pos?: string; final?: string }>();
  const position = Number(pos ?? '1');

  const detail = useMemo(() => loadSessionDetail(id), [id]);
  const row = detail.seriesRows.find((series) => series.position === position);
  // Save and Scan Next, in the ⋮ menu beside Retake; null when a full match
  // has no empty series left after this one.
  const scanNext = scanNextTarget({
    isFixedFormat: detail.isFixedFormat,
    rows: detail.seriesRows.map((r) => ({
      position: r.position,
      isFinal: r.isFinal,
      hasResult: r.shots.length > 0 || r.isTotalOverride,
    })),
    savedPosition: position,
    savedIsFinal: row?.isFinal ?? final === '1',
  });
  const faceId =
    seriesTargetFace(
      detail.session?.disciplineId ?? '',
      detail.session?.programId ?? null,
      position,
    ) ?? '';
  const supported = isPhotoScoringSupported(faceId);
  const manualOnly = isManualOnlyFace(faceId);
  const target = supported ? requireTargetFace(faceId) : undefined;

  // Caliber comes from the session's firearm; the picker is the fallback when
  // the free-text caliber string does not match a known preset.
  const firearmId = detail.session?.firearmId ?? null;
  const firearm = db && firearmId ? getFirearm(db, firearmId) : undefined;
  const initialCaliber = resolveCaliber(firearm?.caliber);

  const [phase, setPhase] = useState<Phase>('capture');
  const [stage, setStage] = useState<AnalyzeStage>('target');
  // Bumped by Back and Retake, so an analysis still running for a photo the
  // shooter has left is dropped when it finishes instead of applied.
  const analyzeRun = useRef(0);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [geometryImage, setGeometryImage] = useState<GeometryImage | null>(null);
  const [transform, setTransform] = useState<TargetTransform | null>(null);
  // Held only while marking, and dropped on retake: a few megabytes of
  // rectified gray pixels that tap-snap searches.
  const [canvas, setCanvas] = useState<RectifiedCanvas | null>(null);
  const [reasons, setReasons] = useState<readonly RejectReason[]>([]);
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
  // Experiment flag, read once per visit so the marks do not change look midway.
  const [fadeFilled] = useState(() => isFlagEnabled('suggestFilledStyle'));
  const [menuOpen, setMenuOpen] = useState(false);
  const [caliberOpen, setCaliberOpen] = useState(false);
  // "Precision or milsnabb face?", open while an analysis waits on the answer.
  const faceAnswered = useRef<((answer: FaceAnswer) => void) | null>(null);
  const [faceAskOpen, setFaceAskOpen] = useState(false);

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
    const run = (analyzeRun.current += 1);
    const current = () => analyzeRun.current === run;
    // Each lock stage blocks the JS thread for up to a couple of seconds, and
    // a Back or Retake pressed meanwhile is only delivered once it ends.
    // Yielding after each stage lets that press run and bump the counter, and
    // lets the next stage's message paint.
    const settled = async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return current();
    };
    const enter = (next: AnalyzeStage) => {
      setStage(next);
      return settled();
    };
    const total = timeStage('total');
    setStage('target');
    setPhase('analyzing');
    try {
      const prepared = timeStage('prepare');
      const image = await prepareGeometryImage(captured);
      prepared();
      if (!(await enter('target'))) return;
      setGeometryImage(image);
      // Set before the pipeline runs, so a pipeline throw still reaches the
      // corner screen with four handles to drag.
      setCorners(defaultCorners(image.width, image.height));
      if (manualOnly) {
        // The disc lock is validated on the precision face only (spec
        // §10.1). The milsnabb sheet has its own ring-line lock, known from
        // the session's discipline and never guessed; when it refuses, or on
        // any other such face, the shooter places the corners.
        if (isMilsnabbLockFace(faceId)) {
          if (!(await enter('rings'))) return;
          const milsnabbLocked = timeStage('milsnabb lock');
          let lock: MilsnabbLock | null = null;
          try {
            lock = runMilsnabbLock({ base64: image.base64 });
          } catch (error: unknown) {
            if (__DEV__) console.warn('milsnabb lock failed', error);
          }
          milsnabbLocked();
          if (!(await settled())) return;
          const toImage = passesMilsnabbGate(lock) && invertHomography(lock.toMm);
          if (lock && toImage) {
            total();
            setTransform(fromProjective({ toMm: lock.toMm, toImage }, 'closeup'));
            setPhase('marking');
            return;
          }
        }
        setPhase('corners');
        return;
      }
      let disc: { result: GeometryPipelineResult; validity: ValidityResult } | null = null;
      const discLocked = timeStage('disc lock');
      try {
        const result = runGeometry({
          base64: image.base64,
          width: image.width,
          height: image.height,
          referenceDiameterMm: target.referenceDiameterMm,
          ringRadiiMm: target.rings.map((ring) => ring.diameterMm / 2),
        });
        disc = { result, validity: checkGeometryValidity(result.metrics) };
      } catch {
        // A pipeline throw ("no dark region found") is the same product
        // outcome as a failed gate: the disc lock could not lock the target.
      }
      discLocked();
      const discTransform = disc?.validity.valid ? fromRectification(disc.result.transform) : null;

      // A close-up of the inner rings has no disc edge to lock on, but its
      // ring lines lock it; when both locks pass, the one that sits closer to
      // the printed lines wins (docs/specs/cv-closeup-lock-2026-09.md).
      let closeupRun: CloseupLockRun | null = null;
      let closeup: CloseupLock | null = null;
      let discOffsetMm: number | null = null;
      const discToMm =
        (discTransform && invertHomography(homographyOf(discTransform))) ?? undefined;
      if (isAutoFace(faceId)) {
        if (!(await enter('rings'))) return;
        const closeupLocked = timeStage('close-up lock');
        try {
          closeupRun = runCloseupLock({ base64: image.base64, discToMm });
          closeup = closeupRun.lock;
          discOffsetMm = closeupRun.discRingOffsetMm;
        } catch (error: unknown) {
          if (__DEV__) console.warn('close-up lock failed', error);
        }
        closeupLocked();
      }

      const choice = chooseLock({
        discPasses: discTransform !== null,
        discOffsetMm,
        closeup,
        discToMm,
      });
      const toImage = closeup && invertHomography(closeup.toMm);
      let closeupMapping =
        choice === 'closeup' && closeup && toImage ? { toMm: closeup.toMm, toImage } : null;
      let rectified: RectifiedCanvas | null = null;
      // A milsnabb photo in a precision session can pass the precision lock
      // at twice its true scale (spec, "a precision lock on a milsnabb photo").
      let refusal: PrecisionGuardRefusal | null = null;
      if (closeupMapping && closeupRun && closeup) {
        if (perspectiveRefuses(closeup.toMm, closeup.center, image)) refusal = 'perspective';
        else if (milsnabbLockOn(closeupRun)) refusal = 'milsnabbLock';
        else {
          if (!(await enter('straighten'))) return;
          rectified = rectify(image.base64, closeupMapping.toMm, target);
          if (rectified && holesTooSmallOn(rectified, target)) refusal = 'holeSize';
          else {
            // A milsnabb answer is refused as the milsnabb guard refuses.
            const face = await faceOf(closeupRun);
            if (!current()) return;
            if (face === 'milsnabb') refusal = 'milsnabbLock';
          }
        }
        if (refusal) {
          if (__DEV__) console.warn('precision close-up lock refused:', refusal);
          closeupMapping = null;
          rectified = null;
        }
      }
      if (!(await settled())) return;
      total();

      if ((choice === 'disc' || refusal) && disc && discTransform) {
        setTransform(discTransform);
        setCanvas(disc.result.canvas);
        setPhase('marking');
        suggestHoles(disc.result.canvas, target);
        return;
      }
      if (closeupMapping) {
        setTransform(fromProjective(closeupMapping, 'closeup'));
        setPhase('marking');
        if (rectified) {
          setCanvas(rectified);
          suggestHoles(rectified, target);
        }
        return;
      }
      setReasons(refusal ? [refusal] : disc ? disc.validity.reasons : ['zoneContrast']);
      setPhase('rejected');
    } catch {
      if (!current()) return;
      setReasons(['zoneContrast']);
      setPhase('rejected');
    }
  }

  /**
   * The rectified canvas from a projective mm mapping — a close-up lock or
   * corners placed by hand — so tap-snap and the hole detector help as they
   * do on a disc lock. Null when it fails: the shooter then marks by hand.
   */
  function rectify(
    base64: string,
    toMm: Homography,
    face: NonNullable<typeof target>,
  ): RectifiedCanvas | null {
    const rectified = timeStage('rectify');
    try {
      return rectifyFromHomography({
        base64,
        toMm,
        outerRadiusMm: Math.max(...face.rings.map((ring) => ring.diameterMm / 2)),
      });
    } catch (error: unknown) {
      if (__DEV__) console.warn('rectify from homography failed', error);
      return null;
    } finally {
      rectified();
    }
  }

  /** The milsnabb guard: the milsnabb lock on the close-up lock's work image. */
  function milsnabbLockOn(run: CloseupLockRun): boolean {
    const checked = timeStage('milsnabb guard');
    try {
      return milsnabbLockRefuses(run.milsnabb());
    } catch (error: unknown) {
      if (__DEV__) console.warn('milsnabb guard failed', error);
      return false;
    } finally {
      checked();
    }
  }

  /** The hole-size guard: the holes on a close-up lock's canvas read at the
   *  session's calibre. Abstains when the detector fails. */
  function holesTooSmallOn(rectified: RectifiedCanvas, face: NonNullable<typeof target>): boolean {
    const checked = timeStage('hole-size check');
    try {
      const caliberMm = markState.caliberMm;
      const read = (atMm: number) =>
        holeDiametersMm(rectified, proposalFaceOf(face, atMm), (canvas, proposalFace) =>
          holeCandidates(canvas, proposalFace, nativeMapOps ?? undefined),
        );
      return holesTooSmall(read(caliberMm), read(caliberMm / 2), caliberMm);
    } catch (error: unknown) {
      if (__DEV__) console.warn('hole-size check failed', error);
      return false;
    } finally {
      checked();
    }
  }

  /**
   * The face a close-up lock that passed the guards is on. When no X ring line
   * is printed where the lock puts it, as on a milsnabb crop of its X and 10
   * (or a precision centre under pasters), the shooter is asked, at most once
   * per session.
   */
  async function faceOf(run: CloseupLockRun): Promise<FaceAnswer> {
    const checked = timeStage('x-line check');
    let missing = false;
    try {
      missing = xLineMissing(run.xRing());
    } catch (error: unknown) {
      if (__DEV__) console.warn('x-line check failed', error);
    } finally {
      checked();
    }
    const decision = faceDecision(missing, faceAnswerFor(id));
    if (decision !== 'ask') return decision;
    const answer = await new Promise<FaceAnswer>((resolve) => {
      faceAnswered.current = resolve;
      setFaceAskOpen(true);
    });
    rememberFaceAnswer(id, answer);
    return answer;
  }

  function answerFace(answer: FaceAnswer) {
    setFaceAskOpen(false);
    faceAnswered.current?.(answer);
    faceAnswered.current = null;
  }

  /**
   * Runs the hole detector over the rectified canvas and places what it finds
   * as suggested marks. The whole-canvas maps go to OpenCV and the rest runs
   * in yielding batches, so the marking screen paints and takes taps while it
   * works — the reducer skips a proposal that lands on a mark the shooter
   * placed meanwhile.
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
      {
        ops: nativeMapOps ?? undefined,
        // Experiment flag; 0 = the default, confident suggestions only.
        fillTo: isFlagEnabled('suggestFillToSeries') ? markState.maxMarks : 0,
      },
    )
      .then((proposals) => {
        if (proposalRun.current !== run) return;
        // Far more holes than the series holds means the detector does not
        // understand this photo (measured on real targets it proposes about
        // one false hole in three photos). Suggesting nothing beats covering
        // the target in marks to delete. Filled-in ones do not count: they
        // only exist when there were too few.
        if (proposals.filter((p) => !p.filled).length > 2 * markState.maxMarks + 2) {
          setSuggested('unsure');
          return;
        }
        dispatch({
          type: 'suggest',
          marks: proposals.map((p) => ({ id: uuidv7(), xMm: p.xMm, yMm: p.yMm, filled: p.filled })),
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

  // Leaving the screen (header or hardware Back) disowns a running analysis
  // as soon as the navigator starts removing the screen, not at unmount after
  // the transition.
  const navigation = useNavigation();
  useEffect(() => {
    const cancel = () => {
      analyzeRun.current += 1;
    };
    const unsubscribe = navigation.addListener('beforeRemove', cancel);
    return () => {
      unsubscribe();
      cancel();
    };
  }, [navigation]);

  function onUseCorners() {
    if (!target) return;
    // No default ring: assuming the outermost one when the points sit on an
    // inner ring scales every score silently (500/180 on a milsnabb close-up).
    if (cornerRing === null) {
      setNotice(t('photoScoring.cornerRingRequired'));
      return;
    }
    const projective = transformFromCorners(corners, target, cornerRing);
    if (!projective) {
      setNotice(t('photoScoring.cornersInvalid'));
      return;
    }
    setNotice(null);
    setTransform(fromProjective(projective));
    setPhase('marking');
    // Corners placed by hand still give a mm mapping, so the photo can be
    // straightened too. Only on the face tap-snap and the detector were
    // measured on.
    if (geometryImage && isAutoFace(faceId)) {
      const rectified = rectify(geometryImage.base64, projective.toMm, target);
      if (rectified) {
        setCanvas(rectified);
        suggestHoles(rectified, target);
      }
    }
  }

  function onRetake() {
    analyzeRun.current += 1;
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

  function onSave(leave = true) {
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
    if (leave) router.back();
  }

  function onSaveAndScanNext(next: ScanNextTarget) {
    onSave(false);
    // A fresh screen in place of this one, so the camera opens on arrival as
    // it does from Add Series, and Back still lands on the session.
    router.replace(`/session/${id}/scan?pos=${next.position}${next.isFinal ? '&final=1' : ''}`);
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
    // Highest first, like the old score line; each tile selects its mark.
    const tiles = markState.marks
      .map((mark, index) => ({ mark, value: scores[index]?.effective.value ?? 0 }))
      .sort((a, b) => b.value - a.value);
    const hint =
      suggested === 'pending'
        ? t('photoScoring.suggesting')
        : suggestedCount > 0
          ? t('photoScoring.suggestedHint', { count: suggestedCount })
          : markState.marks.length > 0
            ? null
            : suggested === 'unsure'
              ? t('photoScoring.suggestedUnsure')
              : suggested === 0
                ? t('photoScoring.suggestedNone')
                : t('photoScoring.markHint');
    return (
      <Screen scroll={false}>
        <Stack.Screen
          options={{
            headerRight: () => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('photoScoring.menuLabel')}
                testID="scan-menu"
                onPress={() => setMenuOpen(true)}
                style={styles.menuTrigger}
              >
                <OverflowIcon color={theme.primary} />
              </Pressable>
            ),
          }}
        />
        <View style={styles.marking}>
          <View>
            <ThemedText type="subtitle" testID="scan-score-line">
              {t('photoScoring.scoreLine', { total: line.total, x: line.innerTenCount })}
            </ThemedText>
            <View style={styles.tiles} testID="scan-shot-values">
              {tiles.map(({ mark, value }) => {
                const selected = mark.id === markState.selectedId;
                return (
                  <Pressable
                    key={mark.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() =>
                      dispatch(selected ? { type: 'deselect' } : { type: 'select', id: mark.id })
                    }
                    testID={`scan-shot-${mark.id}`}
                    style={[
                      styles.tile,
                      { borderColor: theme.border },
                      selected && { backgroundColor: theme.primary, borderColor: theme.primary },
                    ]}
                  >
                    <ThemedText type="smallBold" themeColor={selected ? 'onPrimary' : 'text'}>
                      {mark.isInnerTen ? 'X' : String(value)}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {group && <GroupStats analysis={group} testIDPrefix="scan-stat" />}

          {notice && (
            <ThemedText type="small" themeColor="danger">
              {notice}
            </ThemedText>
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
              fadeFilled={fadeFilled}
              onTapEmpty={onTapEmpty}
              onTapMark={(markId) => dispatch({ type: 'select', id: markId })}
              onMoveMark={(markId, mm) => {
                setNotice(null);
                dispatch({ type: 'move', id: markId, xMm: mm.x, yMm: mm.y });
              }}
            />
            {/* Along the bottom of the photo, where the zoom buttons leave the full width. */}
            <View style={styles.overlayChips} pointerEvents="none">
              {transform.source === 'manual' && <Chip label={t('photoScoring.manualGeometry')} />}
              {hint && (
                <View style={styles.row}>
                  {suggested === 'pending' && <ActivityIndicator size="small" />}
                  <Chip label={hint} testID="scan-hint" />
                </View>
              )}
            </View>
          </View>

          {selectedMark && selectedScore ? (
            <MarkActionBar
              mark={selectedMark}
              score={selectedScore}
              onDelete={() => dispatch({ type: 'delete' })}
              onToggleInnerTen={() => dispatch({ type: 'toggleInnerTen' })}
              onCallRing={(ringLabel) => dispatch({ type: 'callRing', ringLabel })}
              onDeselect={() => dispatch({ type: 'deselect' })}
            />
          ) : (
            <View style={styles.bottomBar}>
              <SecondaryButton
                label={t('photoScoring.undo')}
                onPress={() => dispatch({ type: 'undo' })}
                disabled={!canUndo(markState)}
                testID="mark-undo"
              />
              <SecondaryButton
                label={caliberKey ?? t('photoScoring.caliber')}
                accessibilityLabel={t('photoScoring.caliber')}
                onPress={() => setCaliberOpen(true)}
                testID="scan-caliber"
              />
              <View style={styles.save}>
                <PrimaryButton
                  label={t('photoScoring.save')}
                  onPress={() => onSave()}
                  testID="scan-save"
                />
              </View>
            </View>
          )}
        </View>
        <ActionSheet
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          actions={[
            ...(scanNext && markState.marks.length > 0
              ? [
                  {
                    key: 'scan-next',
                    label: t('photoScoring.saveAndScanNext'),
                    onPress: () => onSaveAndScanNext(scanNext),
                  },
                ]
              : []),
            { key: 'retake', label: t('photoScoring.retake'), onPress: onRetake },
          ]}
        />
        <ActionSheet
          visible={caliberOpen}
          onClose={() => setCaliberOpen(false)}
          title={
            initialCaliber.matched
              ? t('photoScoring.caliber')
              : t('photoScoring.caliberGuessed', { caliber: initialCaliber.key })
          }
          actions={CALIBER_KEYS.map((key) => ({
            key,
            label: key,
            selected: key === caliberKey,
            onPress: () => dispatch({ type: 'setCaliber', caliberMm: caliberMmFor(key) }),
          }))}
        />
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
              onPress={() => void onCapture('camera')}
              testID="scan-camera"
            />
            <PrimaryButton
              label={t('photoScoring.pickFromLibrary')}
              onPress={() => void onCapture('library')}
              testID="scan-library"
            />
          </Card>
        )}

        {phase === 'analyzing' && (
          <Card>
            <ActivityIndicator testID="scan-analyzing" />
            <ThemedText themeColor="textSecondary" testID="scan-analyzing-stage">
              {t(STAGE_KEYS[stage])}
            </ThemedText>
          </Card>
        )}
        {/* No dismiss: the analysis waits on the answer. */}
        <ActionSheet
          visible={faceAskOpen}
          onClose={() => {}}
          title={t('photoScoring.faceQuestion')}
          actions={[
            {
              key: 'face-precision',
              label: t('discipline.spsf-precision'),
              onPress: () => answerFace('precision'),
            },
            {
              key: 'face-milsnabb',
              label: t('discipline.spsf-milsnabb'),
              onPress: () => answerFace('milsnabb'),
            },
          ]}
        />

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
                isMilsnabbLockFace(faceId)
                  ? 'photoScoring.milsnabbLockRefusedHint'
                  : manualOnly
                    ? 'photoScoring.milsnabbCornersHint'
                    : 'photoScoring.adjustCornersHint',
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
              overlay={target && cornerRing ? ringOverlay(corners, target, cornerRing) : null}
            />
            {target && (
              <Card>
                <ThemedText type="smallBold">{t('photoScoring.cornerRing')}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('photoScoring.cornerRingHint')}
                </ThemedText>
                <View style={styles.row}>
                  {target.rings.map((ring) => {
                    const active = cornerRing === ring.label;
                    return (
                      <Pressable
                        key={ring.label}
                        onPress={() => {
                          setCornerRing(ring.label);
                          setNotice(null);
                        }}
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
  menuTrigger: {
    // Material's 48dp touch-target floor, as SessionMenu's.
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  tile: {
    minWidth: 44,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvasWrap: {
    flex: 1,
    borderRadius: Radius.medium,
    overflow: 'hidden',
  },
  overlayChips: {
    position: 'absolute',
    bottom: Spacing.two,
    left: Spacing.two,
    right: Spacing.two,
    gap: Spacing.one,
    alignItems: 'flex-start',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  save: {
    flex: 1,
  },
});
