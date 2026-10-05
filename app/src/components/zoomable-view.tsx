// A canvas that zooms and pans the way the photo-scoring canvas does (#608):
// pinch about the fingers, one finger pans once zoomed, double-tap toggles 3x /
// fit, and the same − / + / fit pill. The geometry is
// features/photo-scoring/viewport.ts, shared with MarkCanvas.
//
// The content is laid out at its fitted size and scaled by a view transform,
// so `children` gets that box and draws into it once.
import { type ReactNode, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View, type ViewProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ZoomControls } from '@/components/zoom-controls';
import {
  DOUBLE_TAP_ZOOM,
  IDENTITY_VIEW,
  MIN_ZOOM,
  ZOOM_STEP,
  clampView,
  fitFrame,
  panBy,
  refit,
  screenToContent,
  viewTransform,
  zoomAround,
  zoomAt,
  zoomToPoint,
} from '@/features/photo-scoring/viewport';

const ZOOM_MS = 200;

export interface ZoomableViewProps extends Omit<ViewProps, 'onLayout' | 'children'> {
  /** The content's natural size; it is fitted into the view keeping its aspect. */
  contentWidth: number;
  contentHeight: number;
  children: (box: { width: number; height: number }) => ReactNode;
}

export function ZoomableView({
  contentWidth,
  contentHeight,
  children,
  style,
  testID = 'zoomable-view',
  ...rest
}: ZoomableViewProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const frame = useMemo(
    () => fitFrame(size.width, size.height, contentWidth, contentHeight),
    [size, contentWidth, contentHeight],
  );
  // Updated when a gesture settles: the fit button and whether one finger pans.
  const [zoomLevel, setZoomLevel] = useState(1);

  const zoom = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const pinching = useSharedValue(false);
  const anchor = useSharedValue({ x: 0, y: 0 });
  const zoomStart = useSharedValue(1);
  const lastPan = useSharedValue({ x: 0, y: 0 });

  const zoomed = zoomLevel > MIN_ZOOM + 0.01;

  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
    const v = refit(frame, fitFrame(width, height, contentWidth, contentHeight), {
      zoom: zoom.value,
      tx: tx.value,
      ty: ty.value,
    });
    zoom.value = v.zoom;
    tx.value = v.tx;
    ty.value = v.ty;
    setZoomLevel(v.zoom);
  }

  function animateTo(v: { zoom: number; tx: number; ty: number }) {
    zoom.value = withTiming(v.zoom, { duration: ZOOM_MS });
    tx.value = withTiming(v.tx, { duration: ZOOM_MS });
    ty.value = withTiming(v.ty, { duration: ZOOM_MS });
    setZoomLevel(v.zoom);
  }

  function zoomBy(factor: number) {
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
      const v = zoomAround(frame, anchor.value, e.focalX, e.focalY, zoomStart.value * e.scale);
      zoom.value = v.zoom;
      tx.value = v.tx;
      ty.value = v.ty;
    })
    .onFinalize(() => {
      pinching.value = false;
      scheduleOnRN(setZoomLevel, zoom.value);
    });

  // At fit, one finger belongs to the screen's scroll, not to the canvas.
  const pan = Gesture.Pan()
    .enabled(zoomed)
    .maxPointers(1)
    .minDistance(4)
    .onBegin(() => {
      lastPan.value = { x: 0, y: 0 };
    })
    .onUpdate((e) => {
      const dx = e.translationX - lastPan.value.x;
      const dy = e.translationY - lastPan.value.y;
      lastPan.value = { x: e.translationX, y: e.translationY };
      if (pinching.value) return;
      const v = panBy(frame, { zoom: zoom.value, tx: tx.value, ty: ty.value }, dx, dy);
      tx.value = v.tx;
      ty.value = v.ty;
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

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);

  const contentStyle = useAnimatedStyle(() => {
    const t = viewTransform(frame, { zoom: zoom.value, tx: tx.value, ty: ty.value });
    return {
      transform: [{ translateX: t.translateX }, { translateY: t.translateY }, { scale: t.scale }],
    };
  });

  return (
    <View style={[styles.container, style]} onLayout={onLayout} testID={testID} {...rest}>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false}>
          {frame.fitScale > 0 && (
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
              {children({ width: frame.contentWidth, height: frame.contentHeight })}
            </Animated.View>
          )}
        </View>
      </GestureDetector>
      <ZoomControls
        onZoomOut={() => zoomBy(1 / ZOOM_STEP)}
        onZoomIn={() => zoomBy(ZOOM_STEP)}
        onFit={() => animateTo(clampView(frame, IDENTITY_VIEW))}
        fitDisabled={!zoomed}
        testIDPrefix={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  content: {
    position: 'absolute',
  },
});
