// The photo with the rectified ring overlay and the user's marks on top.
// Spec: docs/specs/photo-scoring-phase1-spec.md §6.
//
// The overlay is drawn by mapping target-mm through the transform, not by
// drawing circles in pixel space: the transform may be affine (automatic) or
// projective (manual corners), so a ring that is a circle in mm is an ellipse
// or a general conic in px. Sampling each ring as a polygon handles both
// without the component knowing which path produced the transform — and it
// is what lets the user SEE whether the lock is good before trusting it.
import { Image } from 'expo-image';
import { useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Polygon } from 'react-native-svg';
import type { Point, TargetFaceDefinition } from '@shotledger/shared';

import type { Mark, MarkScore } from '@/features/photo-scoring/marks';
import type { TargetTransform } from '@/features/photo-scoring/transform';

const RING_SAMPLES = 72;
const MIN_ZOOM = 1;
/**
 * Past about 6x the photo is all sensor noise — the geometry image is 2048 px
 * wide and the overlay lays out around 400, so 6x is already showing single
 * source pixels.
 */
const MAX_ZOOM = 6;
const RING_COLOR = '#22d3ee';
const RING_COLOR_OUTER = 'rgba(34, 211, 238, 0.45)';
const MARK_COLOR = '#f87171';
const MARK_SELECTED = '#38bdf8';
const EDGE_CALL_COLOR = '#fbbf24';

export interface MarkOverlayProps extends Omit<ViewProps, 'onLayout'> {
  photoUri: string;
  /** Size of the image the transform was computed against. */
  imageWidth: number;
  imageHeight: number;
  transform: TargetTransform;
  target: TargetFaceDefinition;
  marks: readonly Mark[];
  scores: readonly MarkScore[];
  selectedId: string | null;
  /** Target-mm of the tap. */
  onTapEmpty: (mm: Point) => void;
  onTapMark: (markId: string) => void;
}

/** Samples one ring as a polygon in display px. */
function ringPoints(transform: TargetTransform, radiusMm: number, scale: number): string {
  const parts: string[] = [];
  for (let i = 0; i < RING_SAMPLES; i += 1) {
    const angle = (2 * Math.PI * i) / RING_SAMPLES;
    const px = transform.toImage({
      x: radiusMm * Math.cos(angle),
      y: radiusMm * Math.sin(angle),
    });
    parts.push(`${px.x * scale},${px.y * scale}`);
  }
  return parts.join(' ');
}

/**
 * A mark's radius on screen. Measured rather than computed, because under a
 * projective transform the mm-to-px scale differs across the image — a disc
 * near the far edge of a tilted card really is smaller.
 */
function markRadiusPx(
  transform: TargetTransform,
  mark: Mark,
  center: Point,
  scale: number,
): number {
  const edge = transform.toImage({ x: mark.xMm + mark.caliberMm / 2, y: mark.yMm });
  return Math.max(4, Math.hypot(edge.x - center.x, edge.y - center.y) * scale);
}

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

export function MarkOverlay({
  photoUri,
  imageWidth,
  imageHeight,
  transform,
  target,
  marks,
  scores,
  selectedId,
  onTapEmpty,
  onTapMark,
  style,
  ...rest
}: MarkOverlayProps) {
  const [layout, setLayout] = useState({ width: 0, height: 0 });

  // Zoom and pan live on the UI thread: the content is transformed, and the
  // Pressable rides along INSIDE that transform, so a tap's locationX/Y come
  // back in untransformed content coordinates and the hit-testing below needs
  // no knowledge of the zoom at all.
  const zoom = useSharedValue(1);
  const zoomStart = useSharedValue(1);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      zoomStart.value = zoom.value;
    })
    .onUpdate((event) => {
      zoom.value = clamp(zoomStart.value * event.scale, MIN_ZOOM, MAX_ZOOM);
    });

  // Two fingers, so one finger still scrolls the form under this and still
  // places a mark. Panning with one finger would make the screen unusable.
  const pan = Gesture.Pan()
    .minPointers(2)
    .onStart(() => {
      panStartX.value = panX.value;
      panStartY.value = panY.value;
    })
    .onUpdate((event) => {
      panX.value = panStartX.value + event.translationX;
      panY.value = panStartY.value + event.translationY;
    });

  // Double-tap toggles between fit and 3x, the gesture people try first.
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const zoomed = zoom.value > MIN_ZOOM;
      zoom.value = withTiming(zoomed ? MIN_ZOOM : 3);
      if (zoomed) {
        panX.value = withTiming(0);
        panY.value = withTiming(0);
      }
    });

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: panX.value }, { translateY: panY.value }, { scale: zoom.value }],
  }));

  function onLayout(event: LayoutChangeEvent) {
    const { width } = event.nativeEvent.layout;
    setLayout({ width, height: (width * imageHeight) / imageWidth });
  }

  // The image is laid out at the photo's own aspect ratio, so one factor maps
  // geometry px to display px in both axes.
  const scale = layout.width > 0 ? layout.width / imageWidth : 0;

  function handlePress(x: number, y: number) {
    if (scale === 0) return;
    // A tap near an existing mark selects it rather than placing another —
    // otherwise a series would be unmarkable once the shots are close.
    for (let i = marks.length - 1; i >= 0; i -= 1) {
      const mark = marks[i] as Mark;
      const center = transform.toImage({ x: mark.xMm, y: mark.yMm });
      const cx = center.x * scale;
      const cy = center.y * scale;
      const hitRadius = Math.max(22, markRadiusPx(transform, mark, center, scale) * 1.6);
      if (Math.hypot(x - cx, y - cy) <= hitRadius) {
        onTapMark(mark.id);
        return;
      }
    }
    onTapEmpty(transform.toMm({ x: x / scale, y: y / scale }));
  }

  return (
    <View style={[styles.container, style]} onLayout={onLayout} {...rest}>
      <GestureDetector gesture={gesture}>
        {/* The outer view clips; the inner one is what zooms, so a magnified
            target stays inside the card instead of covering the score line. */}
        <View style={[styles.surface, { height: layout.height }]}>
          <Animated.View style={[StyleSheet.absoluteFill, zoomStyle]}>
            <Pressable
              testID="mark-surface"
              style={StyleSheet.absoluteFill}
              onPress={(event) =>
                handlePress(event.nativeEvent.locationX, event.nativeEvent.locationY)
              }
            >
              <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="fill" />

              {scale > 0 && (
                <Svg
                  style={StyleSheet.absoluteFill}
                  width={layout.width}
                  height={layout.height}
                  pointerEvents="none"
                >
                  {target.rings.map((ring) => (
                    <Polygon
                      key={ring.label}
                      points={ringPoints(transform, ring.diameterMm / 2, scale)}
                      fill="none"
                      stroke={
                        ring.diameterMm <= target.referenceDiameterMm
                          ? RING_COLOR
                          : RING_COLOR_OUTER
                      }
                      strokeWidth={1.5}
                    />
                  ))}

                  {marks.map((mark, index) => {
                    const center = transform.toImage({ x: mark.xMm, y: mark.yMm });
                    const score = scores[index];
                    const isSelected = mark.id === selectedId;
                    const isEdgeCall = score?.computed.edgeCall ?? false;
                    return (
                      <Circle
                        key={mark.id}
                        cx={center.x * scale}
                        cy={center.y * scale}
                        r={markRadiusPx(transform, mark, center, scale)}
                        fill={isSelected ? MARK_SELECTED : MARK_COLOR}
                        fillOpacity={0.55}
                        // An edge call is ringed, not recolored: the fill still
                        // says selected/not, and the ring says "this one needs
                        // your call" without the two states competing.
                        stroke={isEdgeCall ? EDGE_CALL_COLOR : '#ffffff'}
                        strokeWidth={isEdgeCall ? 3 : 1.5}
                      />
                    );
                  })}
                </Svg>
              )}
            </Pressable>
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
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
});
