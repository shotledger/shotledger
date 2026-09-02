// The manual 4-point fallback, shown when the validity gate rejects the
// automatic fit. Spec: docs/specs/photo-scoring-phase1-spec.md §2.5.
//
// The user drags four handles onto the outermost ring's top/right/bottom/left
// extremes. Order is fixed and labelled, because a homography built from
// mismatched correspondences is silently wrong rather than an error.
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
import Svg, { Circle, Polygon, Text as SvgText } from 'react-native-svg';
import type { Point } from '@shotledger/shared';

const HANDLE_RADIUS = 16;
const HANDLE_COLOR = '#38bdf8';
const GUIDE_COLOR = 'rgba(56, 189, 248, 0.5)';

export interface CornerAdjusterProps extends Omit<ViewProps, 'onLayout'> {
  photoUri: string;
  imageWidth: number;
  imageHeight: number;
  /** Handle positions in IMAGE px, in order: top, right, bottom, left. */
  corners: readonly Point[];
  onChange: (corners: readonly Point[]) => void;
  /** Short labels for the four handles, already translated. */
  labels: readonly string[];
}

export function CornerAdjuster({
  photoUri,
  imageWidth,
  imageHeight,
  corners,
  onChange,
  labels,
  style,
  ...rest
}: CornerAdjusterProps) {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  // The pan handlers are created once, so they read the live corners, scale
  // and onChange through refs rather than closing over stale state. Every ref
  // is written in an effect, never during render.
  const cornersRef = useRef(corners);
  const scaleRef = useRef(0);
  const draggingRef = useRef(-1);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    cornersRef.current = corners;
    onChangeRef.current = onChange;
  }, [corners, onChange]);

  function onLayout(event: LayoutChangeEvent) {
    const { width } = event.nativeEvent.layout;
    const height = (width * imageHeight) / imageWidth;
    // Written from an event handler, which the gesture callbacks then read.
    scaleRef.current = width / imageWidth;
    setLayout({ width, height });
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
          let best = -1;
          let bestDistance = Infinity;
          cornersRef.current.forEach((corner, index) => {
            const distance = Math.hypot(locationX - corner.x * scale, locationY - corner.y * scale);
            if (distance < bestDistance) {
              bestDistance = distance;
              best = index;
            }
          });
          // Only grab a handle the touch is actually near, so a stray tap does
          // not yank the closest corner across the photo.
          draggingRef.current = bestDistance <= HANDLE_RADIUS * 2.5 ? best : -1;
        },
        onPanResponderMove: (event) => {
          const index = draggingRef.current;
          const scale = scaleRef.current;
          if (index < 0 || scale === 0) return;
          const { locationX, locationY } = event.nativeEvent;
          const next = cornersRef.current.map((corner, i) =>
            i === index
              ? {
                  x: Math.max(0, Math.min(imageWidth, locationX / scale)),
                  y: Math.max(0, Math.min(imageHeight, locationY / scale)),
                }
              : corner,
          );
          onChangeRef.current(next);
        },
        onPanResponderRelease: () => {
          draggingRef.current = -1;
        },
      }),
    );
  }, [imageWidth, imageHeight]);

  const scale = layout.width > 0 ? layout.width / imageWidth : 0;
  const polygon = corners.map((c) => `${c.x * scale},${c.y * scale}`).join(' ');

  return (
    <View style={[styles.container, style]} onLayout={onLayout} {...rest}>
      <View
        testID="corner-surface"
        style={[styles.surface, { height: layout.height }]}
        {...(responder?.panHandlers ?? {})}
      >
        <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="fill" />
        {scale > 0 && (
          <Svg
            style={StyleSheet.absoluteFill}
            width={layout.width}
            height={layout.height}
            pointerEvents="none"
          >
            <Polygon points={polygon} fill="none" stroke={GUIDE_COLOR} strokeWidth={2} />
            {corners.map((corner, index) => (
              <Circle
                key={labels[index] ?? index}
                cx={corner.x * scale}
                cy={corner.y * scale}
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
                x={corner.x * scale}
                y={corner.y * scale + 5}
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
      </View>
    </View>
  );
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
});
