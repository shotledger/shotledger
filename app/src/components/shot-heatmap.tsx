// Where a session's shots concentrate, drawn over the vector target face.
//
// The sibling of GroupPlot, for the other question. A 60-shot plot is a smear
// of overlapping discs that shows tightness and nothing else; binning the same
// shots says "consistently low left" in one look. Both are drawn in target-mm
// user space inside TargetFace, so they are directly comparable.
import type { ReactElement } from 'react';
import type { ViewProps } from 'react-native';
import { G, Rect } from 'react-native-svg';
import { buildHeatmap, type TargetFaceDefinition } from '@shotledger/shared';

import { TargetFace, targetExtentMm } from '@/components/target-face';

export interface ShotHeatmapProps extends ViewProps {
  target: TargetFaceDefinition;
  shots: readonly { xMm: number; yMm: number }[];
  size?: number;
  /** Cells per side. More cells need more shots before they mean anything. */
  resolution?: number;
}

const DEFAULT_SIZE = 300;
const DEFAULT_RESOLUTION = 12;

/**
 * A single hue at varying opacity rather than a rainbow scale: the rings and
 * their numbers have to stay readable underneath, and a viridis-style ramp
 * over a black target face fails that immediately. Opacity also degrades
 * honestly in grayscale and for color-blind readers, which a hue ramp does
 * not.
 */
const CELL_COLOR = '#f97316';
const MIN_OPACITY = 0.18;
const MAX_OPACITY = 0.82;

export function ShotHeatmap({
  target,
  shots,
  size = DEFAULT_SIZE,
  resolution = DEFAULT_RESOLUTION,
  ...rest
}: ShotHeatmapProps): ReactElement | null {
  const extentMm = targetExtentMm(target) || 1;
  const heatmap = buildHeatmap(shots, extentMm, resolution);
  if (!heatmap) return null;

  const half = extentMm / 2;

  return (
    <TargetFace target={target} size={size} {...rest} testID="shot-heatmap">
      <G>
        {heatmap.cells.map((cell) => (
          <Rect
            key={`${cell.column}-${cell.row}`}
            x={cell.column * heatmap.cellSizeMm - half}
            y={cell.row * heatmap.cellSizeMm - half}
            width={heatmap.cellSizeMm}
            height={heatmap.cellSizeMm}
            fill={CELL_COLOR}
            // The coldest occupied cell still has to be visible: a cell
            // holding one shot out of sixty would otherwise be invisible at
            // 1/60 opacity, and "one shot went there" is worth seeing.
            fillOpacity={MIN_OPACITY + cell.intensity * (MAX_OPACITY - MIN_OPACITY)}
          />
        ))}
      </G>
    </TargetFace>
  );
}
