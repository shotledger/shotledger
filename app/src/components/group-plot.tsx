// Phase-1 photo scoring §7: the marks, the MPI and the mean-radius circle on
// the vector target face (TargetScan session-plot parity).
import type { ReactElement } from 'react';
import type { ViewProps } from 'react-native';
import { Circle, G, Line } from 'react-native-svg';
import { analyzeGroup, type TargetFaceDefinition } from '@shotledger/shared';

import { TargetFace, targetExtentMm } from '@/components/target-face';

export interface GroupPlotShot {
  xMm: number;
  yMm: number;
  caliberMm: number;
}

export interface GroupPlotProps extends ViewProps {
  target: TargetFaceDefinition;
  shots: readonly GroupPlotShot[];
  size?: number;
  /** Draw the MPI marker and the mean-radius circle. Default true. */
  showGroupOverlay?: boolean;
}

const DEFAULT_SIZE = 300;

const SHOT_FILL = '#2563eb';
const SHOT_STROKE = '#93c5fd';
const OVERLAY = '#dc2626';

const OVERLAY_STROKE_FRACTION = 1 / 200;

export function GroupPlot({
  target,
  shots,
  size = DEFAULT_SIZE,
  showGroupOverlay = true,
  ...rest
}: GroupPlotProps): ReactElement | null {
  if (shots.length === 0) {
    return null;
  }

  const extentMm = targetExtentMm(target) || 1;
  const overlayStroke = extentMm * OVERLAY_STROKE_FRACTION;
  const crossArm = extentMm * 0.015;

  const group =
    showGroupOverlay && shots.length >= 2
      ? analyzeGroup(shots.map((shot) => ({ xMm: shot.xMm, yMm: shot.yMm })))
      : null;

  return (
    <TargetFace target={target} size={size} {...rest} testID="group-plot">
      <G>
        {shots.map((shot, index) => (
          <Circle
            key={`shot-${index}-${shot.xMm}-${shot.yMm}`}
            cx={shot.xMm}
            cy={shot.yMm}
            // Real hole size: a .22 really is this small on a 500 mm face.
            r={shot.caliberMm / 2}
            fill={SHOT_FILL}
            stroke={SHOT_STROKE}
            strokeWidth={shot.caliberMm / 8}
            opacity={0.85}
          />
        ))}
      </G>
      {group && (
        <G>
          <Circle
            cx={group.mpiMm.xMm}
            cy={group.mpiMm.yMm}
            r={group.meanRadiusMm}
            fill="none"
            stroke={OVERLAY}
            strokeWidth={overlayStroke}
          />
          <Line
            x1={group.mpiMm.xMm - crossArm}
            y1={group.mpiMm.yMm}
            x2={group.mpiMm.xMm + crossArm}
            y2={group.mpiMm.yMm}
            stroke={OVERLAY}
            strokeWidth={overlayStroke}
          />
          <Line
            x1={group.mpiMm.xMm}
            y1={group.mpiMm.yMm - crossArm}
            x2={group.mpiMm.xMm}
            y2={group.mpiMm.yMm + crossArm}
            stroke={OVERLAY}
            strokeWidth={overlayStroke}
          />
        </G>
      )}
    </TargetFace>
  );
}
