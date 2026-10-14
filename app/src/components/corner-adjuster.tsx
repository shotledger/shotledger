// The manual 4-point fallback, shown when the validity gate rejects the
// automatic fit. Spec: docs/specs/photo-scoring-phase1-spec.md §2.5.
//
// The user drags four handles onto a ring's top/right/bottom/left extremes.
// Order is fixed and labelled, because a homography built from mismatched
// correspondences is silently wrong rather than an error. Once the ring is
// known, the rings those four points imply are drawn on the photo (#347), and
// a margin around the photo lets a handle sit past its edge on a close-up.
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  PanResponder,
  type PanResponderInstance,
  StyleSheet,
  View,
  type ViewProps,
} from 'react-native';
import Svg, { Circle, Line, Polygon } from 'react-native-svg';
import { SvgText } from '@/components/svg-text';
import type { Point } from '@shotledger/shared';

import type { RingOverlay } from '@/features/photo-scoring/corners';

import type { CapturedPhoto } from '@/features/photo-scoring/capture';
import { cropLoupe } from '@/features/photo-scoring/capture';

const HANDLE_RADIUS = 16;
const HANDLE_COLOR = '#38bdf8';
const GUIDE_COLOR = 'rgba(56, 189, 248, 0.5)';
const LOUPE_SIZE = 140;
const CROSSHAIR_COLOR = '#38bdf8';
/** Dark border around the photo, as a fraction of its size, where a handle may still go. */
const MARGIN = 0.15;
const CENTER_ARM = 10;

export interface CornerAdjusterProps extends Omit<ViewProps, 'onLayout'> {
  photoUri: string;
  imageWidth: number;
  imageHeight: number;
  /** Handle positions in IMAGE px, in order: top, right, bottom, left. */
  corners: readonly Point[];
  onChange: (corners: readonly Point[]) => void;
  /** Short labels for the four handles, already translated. */
  labels: readonly string[];
  /**
   * Full-resolution photo, and the geometry-px -> original-px scale — when
   * given, a magnified loupe tracks the corner being dragged, cropped from
   * full resolution (the geometry copy alone is too coarse to place a
   * corner against fine detail).
   */
  photo?: CapturedPhoto;
  scaleToOriginal?: number;
  /** The rings the four points imply, in IMAGE px; null until a ring is picked. */
  overlay?: RingOverlay | null;
}

/** A small, gesture-less magnifier cropped from the full-resolution photo. */
function CornerLoupe({
  photo,
  center,
  scaleToOriginal,
}: {
  photo: CapturedPhoto;
  center: Point;
  scaleToOriginal: number;
}) {
  const [cropUri, setCropUri] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    cropLoupe(photo, center.x, center.y, scaleToOriginal, 220)
      .then((crop) => {
        if (!canceled) setCropUri(crop.uri);
      })
      .catch(() => {
        if (!canceled) setCropUri(null);
      });
    return () => {
      canceled = true;
    };
  }, [photo, center.x, center.y, scaleToOriginal]);

  return (
    <View style={styles.loupe} testID="corner-loupe">
      {cropUri && (
        <Image source={{ uri: cropUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      )}
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
    </View>
  );
}

export function CornerAdjuster({
  photoUri,
  imageWidth,
  imageHeight,
  corners,
  onChange,
  labels,
  photo,
  scaleToOriginal,
  overlay,
  style,
  ...rest
}: CornerAdjusterProps) {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [activeIndex, setActiveIndex] = useState(-1);
  // The pan handlers are created once, so they read the live corners, scale
  // and onChange through refs rather than closing over stale state. Every ref
  // is written in an effect, never during render.
  const cornersRef = useRef(corners);
  const scaleRef = useRef(0);
  const offsetRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(-1);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    cornersRef.current = corners;
    onChangeRef.current = onChange;
  }, [corners, onChange]);

  function onLayout(event: LayoutChangeEvent) {
    const { width } = event.nativeEvent.layout;
    // Written from an event handler, which the gesture callbacks then read.
    const fit = fitPhoto(width, imageWidth, imageHeight);
    scaleRef.current = fit.scale;
    offsetRef.current = fit.offset;
    setLayout({ width, height: fit.surfaceHeight });
  }

  const [responder, setResponder] = useState<PanResponderInstance | null>(null);
  useEffect(() => {
    setResponder(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          const scale = scaleRef.current;
          const offset = offsetRef.current;
          let best = -1;
          let bestDistance = Infinity;
          cornersRef.current.forEach((corner, index) => {
            const distance = Math.hypot(
              locationX - (corner.x * scale + offset.x),
              locationY - (corner.y * scale + offset.y),
            );
            if (distance < bestDistance) {
              bestDistance = distance;
              best = index;
            }
          });
          // Only grab a handle the touch is actually near, so a stray tap does
          // not yank the closest corner across the photo.
          const grabbed = bestDistance <= HANDLE_RADIUS * 2.5 ? best : -1;
          draggingRef.current = grabbed;
          setActiveIndex(grabbed);
        },
        onPanResponderMove: (event) => {
          const index = draggingRef.current;
          const scale = scaleRef.current;
          if (index < 0 || scale === 0) return;
          const { locationX, locationY } = event.nativeEvent;
          const offset = offsetRef.current;
          const next = cornersRef.current.map((corner, i) =>
            i === index
              ? {
                  x: clamp((locationX - offset.x) / scale, imageWidth),
                  y: clamp((locationY - offset.y) / scale, imageHeight),
                }
              : corner,
          );
          onChangeRef.current(next);
        },
        onPanResponderRelease: () => {
          draggingRef.current = -1;
          setActiveIndex(-1);
        },
      }),
    );
  }, [imageWidth, imageHeight]);

  const fit = layout.width > 0 ? fitPhoto(layout.width, imageWidth, imageHeight) : null;
  const scale = fit?.scale ?? 0;
  const sx = (point: Point) => point.x * scale + (fit?.offset.x ?? 0);
  const sy = (point: Point) => point.y * scale + (fit?.offset.y ?? 0);
  const pointsAttr = (points: readonly Point[]) =>
    points.map((point) => `${sx(point)},${sy(point)}`).join(' ');
  const activeCorner = activeIndex >= 0 ? corners[activeIndex] : undefined;

  return (
    <View style={[styles.container, style]} onLayout={onLayout} {...rest}>
      <View
        testID="corner-surface"
        style={[styles.surface, { height: layout.height }]}
        {...(responder?.panHandlers ?? {})}
      >
        {fit && (
          // Not a touch target: touches must land on the surface, so their
          // locationX is in surface coordinates, not the inset photo's.
          <View
            pointerEvents="none"
            style={[
              styles.photo,
              {
                left: fit.offset.x,
                top: fit.offset.y,
                width: imageWidth * scale,
                height: imageHeight * scale,
              },
            ]}
          >
            <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="fill" />
          </View>
        )}
        {scale > 0 && (
          <Svg
            style={StyleSheet.absoluteFill}
            width={layout.width}
            height={layout.height}
            pointerEvents="none"
          >
            {overlay ? (
              <>
                {overlay.rings.map((ring) => (
                  <Polygon
                    key={`ring-${ring.label}`}
                    points={pointsAttr(ring.points)}
                    fill="none"
                    stroke={ring.picked ? HANDLE_COLOR : GUIDE_COLOR}
                    strokeWidth={ring.picked ? 2 : 1}
                  />
                ))}
                <Line
                  x1={sx(overlay.center) - CENTER_ARM}
                  y1={sy(overlay.center)}
                  x2={sx(overlay.center) + CENTER_ARM}
                  y2={sy(overlay.center)}
                  stroke={HANDLE_COLOR}
                  strokeWidth={2}
                />
                <Line
                  x1={sx(overlay.center)}
                  y1={sy(overlay.center) - CENTER_ARM}
                  x2={sx(overlay.center)}
                  y2={sy(overlay.center) + CENTER_ARM}
                  stroke={HANDLE_COLOR}
                  strokeWidth={2}
                />
              </>
            ) : (
              <Polygon
                points={pointsAttr(corners)}
                fill="none"
                stroke={GUIDE_COLOR}
                strokeWidth={2}
              />
            )}
            {corners.map((corner, index) => (
              <Circle
                key={labels[index] ?? index}
                cx={sx(corner)}
                cy={sy(corner)}
                r={HANDLE_RADIUS}
                fill={HANDLE_COLOR}
                fillOpacity={0.5}
                stroke="#ffffff"
                strokeWidth={2}
              />
            ))}
            {corners.map((corner, index) => (
              <SvgText
                key={`label-${labels[index] ?? index}`}
                x={sx(corner)}
                y={sy(corner) + 5}
                fill="#ffffff"
                fontSize={13}
                fontWeight="bold"
                textAnchor="middle"
              >
                {labels[index] ?? ''}
              </SvgText>
            ))}
          </Svg>
        )}
        {activeCorner && photo && scaleToOriginal && (
          <View style={styles.loupeAnchor} pointerEvents="none">
            <CornerLoupe photo={photo} center={activeCorner} scaleToOriginal={scaleToOriginal} />
          </View>
        )}
      </View>
    </View>
  );
}

/** How the photo sits inside the surface: scaled to fit, inset by MARGIN on every side. */
function fitPhoto(surfaceWidth: number, imageWidth: number, imageHeight: number) {
  const scale = surfaceWidth / (imageWidth * (1 + 2 * MARGIN));
  return {
    scale,
    offset: { x: MARGIN * imageWidth * scale, y: MARGIN * imageHeight * scale },
    surfaceHeight: imageHeight * scale * (1 + 2 * MARGIN),
  };
}

/** A handle may go past the photo's edge, but not past the margin around it. */
function clamp(value: number, extent: number): number {
  return Math.max(-MARGIN * extent, Math.min((1 + MARGIN) * extent, value));
}

/** Sensible starting handles: a diamond inscribed in the photo. */
export function defaultCorners(imageWidth: number, imageHeight: number): Point[] {
  const cx = imageWidth / 2;
  const cy = imageHeight / 2;
  const r = 0.42 * Math.min(imageWidth, imageHeight);
  return [
    { x: cx, y: cy - r },
    { x: cx + r, y: cy },
    { x: cx, y: cy + r },
    { x: cx - r, y: cy },
  ];
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  surface: {
    width: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  photo: {
    position: 'absolute',
  },
  loupeAnchor: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  loupe: {
    width: LOUPE_SIZE,
    height: LOUPE_SIZE,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
});
