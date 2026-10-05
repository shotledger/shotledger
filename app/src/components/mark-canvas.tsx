// The photo with the ring overlay and the marks, as a zoomable canvas.
// Spec: docs/specs/photo-scoring-phase1-spec.md §6.
//
// Rings are drawn by mapping target-mm through the transform rather than as
// pixel circles: the transform may be affine (automatic) or projective
// (manual corners), so a ring that is a circle in mm is an ellipse or a
// general conic in px. Sampling each ring as a polygon handles both.
//
// Gestures: pinch zooms about the fingers, one finger pans when zoomed, a tap
// places or selects a mark, a drag that starts on a mark moves it under a
// loupe held above the fingertip, and a double-tap toggles 3x / fit. All the
// geometry is in features/photo-scoring/viewport.ts; this file only wires it
// to the gesture events. `readOnly` keeps zoom and pan and drops the rest.
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View, type ViewProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Polygon } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';
import type { Point, TargetFaceDefinition } from '@shotledger/shared';

import { ZoomControls } from '@/components/zoom-controls';
import type { Mark, MarkScore } from '@/features/photo-scoring/marks';
import type { TargetTransform } from '@/features/photo-scoring/transform';
import {
  DOUBLE_TAP_ZOOM,
  IDENTITY_VIEW,
  MIN_ZOOM,
  type MarkHit,
  ZOOM_STEP,
  clampView,
  contentToScreen,
  fitFrame,
  hitMark,
  loupeCenter,
  panBy,
  refit,
  screenToContent,
  viewTransform,
  zoomAround,
  zoomAt,
  zoomToPoint,
} from '@/features/photo-scoring/viewport';

const RING_SAMPLES = 72;
const RING_COLOR = '#22d3ee';
const RING_COLOR_OUTER = 'rgba(34, 211, 238, 0.45)';
const MARK_COLOR = '#f87171';
const MARK_SELECTED = '#38bdf8';
// The detector's guesses, until the shooter has looked at them (#347).
const MARK_SUGGESTED = '#22c55e';
const EDGE_CALL_COLOR = '#fbbf24';
const CROSSHAIR_COLOR = '#38bdf8';
/** A finger is ~10 mm wide; below this, a mark is too small to grab. */
const HIT_MIN_SCREEN_PX = 22;
const LOUPE_SIZE = 128;
/** Space between the fingertip and the loupe's edge. */
const LOUPE_GAP = 48;
/** How much more the loupe magnifies than the canvas under it. */
const LOUPE_GAIN = 2.5;
const LOUPE_MIN_ZOOM = 4;
/** Screen px per geometry-image px at most — past that it is interpolation. */
const LOUPE_MAX_PX_PER_IMAGE_PX = 2.5;
const ZOOM_MS = 200;

export interface MarkCanvasProps extends Omit<ViewProps, 'onLayout'> {
  photoUri: string;
  /** Size of the image the transform was computed against. */
  imageWidth: number;
  imageHeight: number;
  /** Without a transform and target the canvas is a plain zoomable photo. */
  transform?: TargetTransform;
  target?: TargetFaceDefinition;
  marks?: readonly Mark[];
  /** Per-mark scores, same order as `marks`; drives the edge-call ring. */
  scores?: readonly MarkScore[];
  selectedId?: string | null;
  /** Draw the suggestions that only filled the series fainter than the rest. */
  fadeFilled?: boolean;
  /** Zoom and pan only: no adding, selecting or moving. */
  readOnly?: boolean;
  /** Target-mm of a tap on empty target. */
  onTapEmpty?: (mm: Point) => void;
  onTapMark?: (markId: string) => void;
  /** Target-mm where a dragged mark was released. */
  onMoveMark?: (markId: string, mm: Point) => void;
  /** A mark drag started (true) or ended (false) — so overlays can step aside. */
  onDraggingChange?: (dragging: boolean) => void;
  /** The photo's natural size, once it has loaded. */
  onImageSize?: (width: number, height: number) => void;
}

/** Samples one ring as a polygon in content px. */
function ringPoints(transform: TargetTransform, radiusMm: number, scale: number): string {
  const parts: string[] = [];
  for (let i = 0; i < RING_SAMPLES; i += 1) {
    const angle = (2 * Math.PI * i) / RING_SAMPLES;
    const px = transform.toImage({ x: radiusMm * Math.cos(angle), y: radiusMm * Math.sin(angle) });
    parts.push(`${px.x * scale},${px.y * scale}`);
  }
  return parts.join(' ');
}

/**
 * A mark's radius in content px. Measured rather than computed, because under
 * a projective transform the mm-to-px scale differs across the image.
 */
function markRadius(transform: TargetTransform, mark: Mark, center: Point, scale: number): number {
  const edge = transform.toImage({ x: mark.xMm + mark.caliberMm / 2, y: mark.yMm });
  return Math.max(3, Math.hypot(edge.x - center.x, edge.y - center.y) * scale);
}

export function MarkCanvas({
  photoUri,
  imageWidth,
  imageHeight,
  transform,
  target,
  marks = [],
  scores = [],
  selectedId = null,
  fadeFilled = false,
  readOnly = false,
  onTapEmpty,
  onTapMark,
  onMoveMark,
  onDraggingChange,
  onImageSize,
  style,
  ...rest
}: MarkCanvasProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const frame = useMemo(
    () => fitFrame(size.width, size.height, imageWidth, imageHeight),
    [size, imageWidth, imageHeight],
  );
  // The zoom as React sees it: only for stroke widths and the fit button, so
  // it is updated when a gesture settles, not on every frame.
  const [zoomLevel, setZoomLevel] = useState(1);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const zoom = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const pinching = useSharedValue(false);
  const anchor = useSharedValue({ x: 0, y: 0 });
  const zoomStart = useSharedValue(1);
  const lastPan = useSharedValue({ x: 0, y: 0 });

  const dragId = useSharedValue('');
  const dragActive = useSharedValue(false);
  const grabOffset = useSharedValue({ x: 0, y: 0 });
  const dragScreen = useSharedValue({ x: 0, y: 0 });
  const dragRadius = useSharedValue(0);
  const loupeAt = useSharedValue({ x: 0, y: 0 });
  const loupeZoom = useSharedValue(LOUPE_MIN_ZOOM);

  const scale = frame.fitScale;

  const centers = useMemo(
    () => (transform ? marks.map((m) => transform.toImage({ x: m.xMm, y: m.yMm })) : []),
    [marks, transform],
  );
  const radii = useMemo(
    () =>
      transform && scale > 0
        ? marks.map((m, i) => markRadius(transform, m, centers[i] as Point, scale))
        : [],
    [marks, centers, transform, scale],
  );

  // Hit discs in content px, captured by the gesture worklets. The gestures
  // are rebuilt on every render, so they always see the current marks.
  const hits: MarkHit[] = useMemo(
    () =>
      radii.map((r, i) => ({
        id: (marks[i] as Mark).id,
        x: (centers[i] as Point).x * scale,
        y: (centers[i] as Point).y * scale,
        radius: r * 1.6,
      })),
    [marks, centers, radii, scale],
  );

  // The canvas resizes as the rows above it come and go (the stats row appears
  // with the second mark), so a new layout keeps the zoom and whatever was in
  // the middle of the view, rather than throwing the user back to fit.
  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
    const next = fitFrame(width, height, imageWidth, imageHeight);
    const v = refit(frame, next, { zoom: zoom.value, tx: tx.value, ty: ty.value });
    zoom.value = v.zoom;
    tx.value = v.tx;
    ty.value = v.ty;
    setZoomLevel(v.zoom);
  }

  function contentToMm(x: number, y: number): Point | null {
    return transform ? transform.toMm({ x: x / scale, y: y / scale }) : null;
  }

  function handleTap(markId: string, x: number, y: number) {
    if (scale === 0) return;
    const mm = contentToMm(x, y);
    if (markId) onTapMark?.(markId);
    else if (mm) onTapEmpty?.(mm);
  }

  function handleDragStart(markId: string) {
    setDraggingId(markId);
    onTapMark?.(markId);
    onDraggingChange?.(true);
  }

  function handleDragEnd(markId: string, x: number, y: number) {
    const mm = contentToMm(x, y);
    if (mm) onMoveMark?.(markId, mm);
    setDraggingId(null);
    dragActive.value = false;
    onDraggingChange?.(false);
  }

  function handleDragCancel() {
    setDraggingId(null);
    onDraggingChange?.(false);
  }

  function animateTo(v: { zoom: number; tx: number; ty: number }) {
    zoom.value = withTiming(v.zoom, { duration: ZOOM_MS });
    tx.value = withTiming(v.tx, { duration: ZOOM_MS });
    ty.value = withTiming(v.ty, { duration: ZOOM_MS });
    setZoomLevel(v.zoom);
  }

  function zoomBy(factor: number) {
    // From the zoom last asked for, so presses during an animation add up.
    const current = { zoom: zoom.value, tx: tx.value, ty: ty.value };
    animateTo(
      zoomAt(frame, current, frame.viewWidth / 2, frame.viewHeight / 2, zoomLevel * factor),
    );
  }

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      pinching.value = true;
      zoomStart.value = zoom.value;
      const view = { zoom: zoom.value, tx: tx.value, ty: ty.value };
      anchor.value = screenToContent(frame, view, e.focalX, e.focalY);
    })
    .onUpdate((e) => {
      // Holding the content point that was under the fingers at the start
      // under the fingers now is focal zoom and two-finger pan in one.
      const v = zoomAround(frame, anchor.value, e.focalX, e.focalY, zoomStart.value * e.scale);
      zoom.value = v.zoom;
      tx.value = v.tx;
      ty.value = v.ty;
    })
    .onFinalize(() => {
      pinching.value = false;
      scheduleOnRN(setZoomLevel, zoom.value);
    });

  const pan = Gesture.Pan()
    .maxPointers(1)
    .minDistance(4)
    .onBegin((e) => {
      lastPan.value = { x: 0, y: 0 };
      dragId.value = '';
      if (readOnly) return;
      const view = { zoom: zoom.value, tx: tx.value, ty: ty.value };
      const hit = hitMark(frame, view, hits, e.x, e.y, HIT_MIN_SCREEN_PX);
      if (!hit) return;
      dragId.value = hit.id;
      const at = contentToScreen(frame, view, hit.x, hit.y);
      grabOffset.value = { x: at.x - e.x, y: at.y - e.y };
      dragRadius.value = (hit.radius / 1.6) * view.zoom;
      const perImagePx = frame.fitScale > 0 ? 1 / frame.fitScale : 1;
      loupeZoom.value = Math.min(
        Math.max(view.zoom * LOUPE_GAIN, LOUPE_MIN_ZOOM),
        Math.max(LOUPE_MIN_ZOOM, LOUPE_MAX_PX_PER_IMAGE_PX * perImagePx),
      );
    })
    .onStart((e) => {
      if (!dragId.value) return;
      dragScreen.value = { x: e.x + grabOffset.value.x, y: e.y + grabOffset.value.y };
      loupeAt.value = loupeCenter(frame, e.x, e.y, LOUPE_SIZE / 2, LOUPE_GAP);
      dragActive.value = true;
      scheduleOnRN(handleDragStart, dragId.value);
    })
    .onUpdate((e) => {
      if (dragId.value) {
        // 1:1 with the finger, keeping the offset it was grabbed at, so the
        // mark does not jump under the fingertip on the first move.
        dragScreen.value = { x: e.x + grabOffset.value.x, y: e.y + grabOffset.value.y };
        loupeAt.value = loupeCenter(frame, e.x, e.y, LOUPE_SIZE / 2, LOUPE_GAP);
        return;
      }
      const dx = e.translationX - lastPan.value.x;
      const dy = e.translationY - lastPan.value.y;
      lastPan.value = { x: e.translationX, y: e.translationY };
      if (pinching.value) return;
      const v = panBy(frame, { zoom: zoom.value, tx: tx.value, ty: ty.value }, dx, dy);
      tx.value = v.tx;
      ty.value = v.ty;
    })
    .onEnd(() => {
      if (!dragId.value) return;
      const view = { zoom: zoom.value, tx: tx.value, ty: ty.value };
      const c = screenToContent(frame, view, dragScreen.value.x, dragScreen.value.y);
      scheduleOnRN(handleDragEnd, dragId.value, c.x, c.y);
    })
    .onFinalize(() => {
      dragId.value = '';
      // A cancelled drag never reaches onEnd; the overlays still come back.
      if (dragActive.value) {
        dragActive.value = false;
        scheduleOnRN(handleDragCancel);
      }
    });

  const tap = Gesture.Tap()
    .maxDistance(10)
    .onEnd((e, success) => {
      if (!success || readOnly) return;
      const view = { zoom: zoom.value, tx: tx.value, ty: ty.value };
      const hit = hitMark(frame, view, hits, e.x, e.y, HIT_MIN_SCREEN_PX);
      const c = screenToContent(frame, view, e.x, e.y);
      scheduleOnRN(handleTap, hit ? hit.id : '', c.x, c.y);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDistance(20)
    .onEnd((e, success) => {
      if (!success) return;
      const view = { zoom: zoom.value, tx: tx.value, ty: ty.value };
      const next =
        view.zoom > MIN_ZOOM + 0.01
          ? clampView(frame, IDENTITY_VIEW)
          : zoomToPoint(frame, view, e.x, e.y, DOUBLE_TAP_ZOOM);
      zoom.value = withTiming(next.zoom, { duration: ZOOM_MS });
      tx.value = withTiming(next.tx, { duration: ZOOM_MS });
      ty.value = withTiming(next.ty, { duration: ZOOM_MS });
      scheduleOnRN(setZoomLevel, next.zoom);
    });

  const gesture = Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, tap));

  const contentStyle = useAnimatedStyle(() => {
    const t = viewTransform(frame, { zoom: zoom.value, tx: tx.value, ty: ty.value });
    return {
      transform: [{ translateX: t.translateX }, { translateY: t.translateY }, { scale: t.scale }],
    };
  });

  const dragMarkStyle = useAnimatedStyle(() => ({
    opacity: dragActive.value ? 1 : 0,
    width: dragRadius.value * 2,
    height: dragRadius.value * 2,
    borderRadius: dragRadius.value,
    transform: [
      { translateX: dragScreen.value.x - dragRadius.value },
      { translateY: dragScreen.value.y - dragRadius.value },
    ],
  }));

  const loupeStyle = useAnimatedStyle(() => ({
    opacity: dragActive.value ? 1 : 0,
    transform: [
      { translateX: loupeAt.value.x - LOUPE_SIZE / 2 },
      { translateY: loupeAt.value.y - LOUPE_SIZE / 2 },
    ],
  }));

  // The loupe's photo is the same content box scaled about its own center,
  // then shifted so the dragged mark's content point sits mid-loupe.
  const loupeImageStyle = useAnimatedStyle(() => {
    const f = frame;
    const view = { zoom: zoom.value, tx: tx.value, ty: ty.value };
    const c = screenToContent(f, view, dragScreen.value.x, dragScreen.value.y);
    const m = loupeZoom.value;
    return {
      width: f.contentWidth,
      height: f.contentHeight,
      transform: [
        { translateX: LOUPE_SIZE / 2 - f.contentWidth / 2 - (c.x - f.contentWidth / 2) * m },
        { translateY: LOUPE_SIZE / 2 - f.contentHeight / 2 - (c.y - f.contentHeight / 2) * m },
        { scale: m },
      ],
    };
  });

  const loupeRingStyle = useAnimatedStyle(() => {
    const r = Math.max(4, (dragRadius.value / Math.max(zoom.value, 1)) * loupeZoom.value);
    return {
      width: r * 2,
      height: r * 2,
      borderRadius: r,
      left: LOUPE_SIZE / 2 - r,
      top: LOUPE_SIZE / 2 - r,
    };
  });

  const stroke = 1.5 / zoomLevel;

  return (
    <View style={[styles.container, style]} onLayout={onLayout} {...rest}>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} testID="mark-surface" collapsable={false}>
          <Animated.View
            style={[
              styles.content,
              {
                left: frame.originX,
                top: frame.originY,
                width: frame.contentWidth,
                height: frame.contentHeight,
              },
              contentStyle,
            ]}
          >
            <Image
              source={{ uri: photoUri }}
              style={StyleSheet.absoluteFill}
              contentFit="fill"
              // Decoded at full size: at 6x a bitmap decoded for the fitted
              // box would be a blur.
              allowDownscaling={false}
              onLoad={(event) => onImageSize?.(event.source.width, event.source.height)}
            />
            {transform && target && scale > 0 && (
              <Svg
                style={StyleSheet.absoluteFill}
                width={frame.contentWidth}
                height={frame.contentHeight}
                pointerEvents="none"
              >
                {target.rings.map((ring) => (
                  <Polygon
                    key={ring.label}
                    points={ringPoints(transform, ring.diameterMm / 2, scale)}
                    fill="none"
                    stroke={
                      ring.diameterMm <= target.referenceDiameterMm ? RING_COLOR : RING_COLOR_OUTER
                    }
                    strokeWidth={stroke}
                  />
                ))}
                {marks.map((mark, index) => {
                  if (mark.id === draggingId) return null;
                  const center = centers[index] as Point;
                  const isSelected = mark.id === selectedId;
                  const isEdgeCall = scores[index]?.computed.edgeCall ?? false;
                  const faint = fadeFilled && mark.filled && !isSelected;
                  return (
                    <Circle
                      key={mark.id}
                      cx={center.x * scale}
                      cy={center.y * scale}
                      r={radii[index] as number}
                      fill={
                        isSelected ? MARK_SELECTED : mark.suggested ? MARK_SUGGESTED : MARK_COLOR
                      }
                      // A suggestion is also dashed, so it still reads as one
                      // to a shooter who cannot tell green from red.
                      fillOpacity={faint ? 0.25 : 0.55}
                      // An edge call is ringed, not recolored: the fill says
                      // selected or not, the ring says "needs your call".
                      stroke={isEdgeCall ? EDGE_CALL_COLOR : '#ffffff'}
                      strokeWidth={(isEdgeCall ? 2 : 1) * stroke}
                      strokeDasharray={
                        faint
                          ? [1.5 * stroke, 3 * stroke]
                          : mark.suggested
                            ? [3 * stroke, 2 * stroke]
                            : undefined
                      }
                    />
                  );
                })}
              </Svg>
            )}
          </Animated.View>

          {!readOnly && (
            <Animated.View pointerEvents="none" style={[styles.dragMark, dragMarkStyle]} />
          )}

          {!readOnly && (
            <Animated.View
              pointerEvents="none"
              style={[styles.loupe, loupeStyle]}
              testID="mark-loupe"
            >
              <Animated.View style={[styles.loupeImage, loupeImageStyle]}>
                <Image
                  source={{ uri: photoUri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="fill"
                  allowDownscaling={false}
                />
              </Animated.View>
              <Svg style={StyleSheet.absoluteFill} width={LOUPE_SIZE} height={LOUPE_SIZE}>
                <Line
                  x1={LOUPE_SIZE / 2}
                  y1={0}
                  x2={LOUPE_SIZE / 2}
                  y2={LOUPE_SIZE}
                  stroke={CROSSHAIR_COLOR}
                  strokeWidth={1}
                />
                <Line
                  x1={0}
                  y1={LOUPE_SIZE / 2}
                  x2={LOUPE_SIZE}
                  y2={LOUPE_SIZE / 2}
                  stroke={CROSSHAIR_COLOR}
                  strokeWidth={1}
                />
              </Svg>
              <Animated.View style={[styles.loupeRing, loupeRingStyle]} />
            </Animated.View>
          )}
        </View>
      </GestureDetector>

      <ZoomControls
        onZoomOut={() => zoomBy(1 / ZOOM_STEP)}
        onZoomIn={() => zoomBy(ZOOM_STEP)}
        onFit={() => animateTo(clampView(frame, IDENTITY_VIEW))}
        fitDisabled={zoomLevel <= MIN_ZOOM + 0.01}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  content: {
    position: 'absolute',
  },
  dragMark: {
    position: 'absolute',
    left: 0,
    top: 0,
    backgroundColor: 'rgba(56, 189, 248, 0.55)',
    borderColor: '#ffffff',
    borderWidth: 1,
  },
  loupe: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: LOUPE_SIZE,
    height: LOUPE_SIZE,
    borderRadius: LOUPE_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  loupeImage: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  loupeRing: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: CROSSHAIR_COLOR,
  },
});
