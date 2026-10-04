// Where a session's shots concentrate, drawn over the vector target face.
//
// The sibling of GroupPlot, for the other question. A 60-shot plot is a smear
// of overlapping discs that shows tightness and nothing else; a density of the
// same shots says "consistently low left" in one look. Both are drawn in
// target-mm user space inside TargetFace, so they are directly comparable.
import { useId, useMemo, type ReactElement } from 'react';
import type { ViewProps } from 'react-native';
import { Defs, FeGaussianBlur, Filter, G, Rect } from 'react-native-svg';
import { heatDensityCells, type TargetFaceDefinition } from '@shotledger/shared';

import { TargetFace, targetExtentMm } from '@/components/target-face';

export interface ShotHeatmapProps extends ViewProps {
  target: TargetFaceDefinition;
  shots: readonly { xMm: number; yMm: number }[];
  size?: number;
  /** Cells per side, before the blur. */
  resolution?: number;
}

const DEFAULT_SIZE = 300;
// Coarser than the report's 60: a native Rect per cell costs far more than a
// line of SVG text, and the blur hides the difference at phone size.
const DEFAULT_RESOLUTION = 30;

/** The same density as the session report's heat map (`heatDensityCells`). */
export function ShotHeatmap({
  target,
  shots,
  size = DEFAULT_SIZE,
  resolution = DEFAULT_RESOLUTION,
  ...rest
}: ShotHeatmapProps): ReactElement | null {
  const extentMm = targetExtentMm(target) || 1;
  const layer = useMemo(
    () => heatDensityCells(shots, extentMm, resolution),
    [shots, extentMm, resolution],
  );
  // Two heat maps on one web page must not share a filter id.
  const filterId = `heat-blur-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (!layer) return null;

  return (
    <TargetFace target={target} size={size} {...rest} testID="shot-heatmap">
      <Defs>
        <Filter id={filterId} x="-10%" y="-10%" width="120%" height="120%">
          <FeGaussianBlur stdDeviation={layer.blurMm} />
        </Filter>
      </Defs>
      <G filter={`url(#${filterId})`}>
        {layer.cells.map((cell) => (
          <Rect
            key={`${cell.xMm}-${cell.yMm}`}
            x={cell.xMm}
            y={cell.yMm}
            width={cell.sizeMm}
            height={cell.sizeMm}
            fill={cell.color}
            fillOpacity={cell.opacity}
          />
        ))}
      </G>
    </TargetFace>
  );
}
