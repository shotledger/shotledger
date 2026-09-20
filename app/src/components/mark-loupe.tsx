// The Move magnifier. Spec: docs/specs/photo-scoring-phase1-spec.md §6.
//
// The crop comes from the ORIGINAL file, not the 2048 px geometry copy — the
// spike's recommendation is to re-crop from full resolution once geometry is
// known rather than raising the global resize (§4.4). At 2048 px a .22 hole
// is ~20 px across, which is not enough to nudge a mark against.
//
// Dragging here moves the mark at reduced gain, so a fingertip that covers
// several millimeters of target can still place a mark to a fraction of one.
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  PanResponder,
  type PanResponderInstance,
  StyleSheet,
  View,
  type ViewProps,
} from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import type { Point } from '@shotledger/shared';

import type { CapturedPhoto } from '@/features/photo-scoring/capture';
import { cropLoupe } from '@/features/photo-scoring/capture';

/** Screen px of finger travel per screen px of mark travel. */
const DRAG_GAIN = 0.25;
const LOUPE_SIZE = 200;
const CROSSHAIR_COLOR = '#38bdf8';

export interface MarkLoupeProps extends ViewProps {
  photo: CapturedPhoto;
  /** Mark center in geometry-image px. */
  center: Point;
  scaleToOriginal: number;
  /** Reports a delta in geometry-image px. */
  onNudge: (dx: number, dy: number) => void;
}

export function MarkLoupe({
  photo,
  center,
  scaleToOriginal,
  onNudge,
  style,
  ...rest
}: MarkLoupeProps) {
  const [cropUri, setCropUri] = useState<string | null>(null);
  // The PanResponder is built once, so it must reach the CURRENT onNudge
  // rather than the one captured at creation. The ref is written in an
  // effect, never during render, and read only from a gesture callback.
  const onNudgeRef = useRef(onNudge);
  useEffect(() => {
    onNudgeRef.current = onNudge;
  }, [onNudge]);

  useEffect(() => {
    let canceled = false;
    cropLoupe(photo, center.x, center.y, scaleToOriginal)
      .then((crop) => {
        // The crop is async and the mark can move again before it lands, so a
        // stale result must not overwrite a newer one.
        if (!canceled) setCropUri(crop.uri);
      })
      .catch(() => {
        if (!canceled) setCropUri(null);
      });
    return () => {
      canceled = true;
    };
  }, [photo, center.x, center.y, scaleToOriginal]);

  // Created in an effect, not during render: it must stay identity-stable
  // across renders (recreating it mid-drag would drop the gesture) while
  // still reaching the current onNudge through the ref above.
  const [responder, setResponder] = useState<PanResponderInstance | null>(null);
  useEffect(() => {
    setResponder(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_event, gesture) => {
          onNudgeRef.current(gesture.dx * DRAG_GAIN, gesture.dy * DRAG_GAIN);
        },
      }),
    );
  }, []);

  return (
    <View style={[styles.container, style]} testID="mark-loupe" {...rest}>
      <View style={styles.loupe} {...(responder?.panHandlers ?? {})}>
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
          <Circle
            cx={LOUPE_SIZE / 2}
            cy={LOUPE_SIZE / 2}
            r={10}
            fill="none"
            stroke={CROSSHAIR_COLOR}
            strokeWidth={2}
          />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  loupe: {
    width: LOUPE_SIZE,
    height: LOUPE_SIZE,
    borderRadius: LOUPE_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
});
