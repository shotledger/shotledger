// Phase-1 photo scoring §7: a vector target face drawn from the ring
// diameters, so it is correct by construction for any TargetFaceDefinition.
import type { ReactElement, ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import type { TargetFaceDefinition } from '@shotledger/shared';

import { Radius, Spacing } from '@/theme/tokens';

export interface TargetFaceProps extends ViewProps {
  target: TargetFaceDefinition;
  /** Rendered edge length in px. */
  size?: number;
  /** Draw the black zone fill. Default true. */
  showBlackZone?: boolean;
  /** Draw the ring number labels. Default true. */
  showLabels?: boolean;
  /** Extra SVG content drawn in TARGET-MM user space, on top of the rings. */
  children?: ReactNode;
}

const DEFAULT_SIZE = 300;

// A printed target is a physical object: it keeps its own paper/ink colours
// rather than following the app theme.
const PAPER = '#f4f0e8';
const INK = '#1c1c1e';
const ON_BLACK = '#f2ede3';

/** Stroke width and label height as fractions of the face extent, so both read the same at any size. */
const STROKE_FRACTION = 1 / 250;
const LABEL_FRACTION = 0.032;

/** The viewBox side length in mm — exported so callers can size overlays. */
export function targetExtentMm(target: TargetFaceDefinition): number {
  const outermost = target.rings[target.rings.length - 1];
  return outermost ? outermost.diameterMm : 0;
}

/**
 * The definition carries only the black zone's OUTER diameter. For an annulus
 * face the inner edge is approximated by the innermost (X) ring, which keeps a
 * light aiming centre without inventing a second dimension.
 */
function blackInnerRadiusMm(target: TargetFaceDefinition): number {
  if (target.referenceIsSolidBlack) return 0;
  const innermost = target.rings[0];
  return innermost ? innermost.diameterMm / 2 : 0;
}

export function TargetFace({
  target,
  size = DEFAULT_SIZE,
  showBlackZone = true,
  showLabels = true,
  children,
  style,
  ...rest
}: TargetFaceProps): ReactElement {
  const extentMm = targetExtentMm(target) || 1;
  const half = extentMm / 2;
  const strokeWidth = extentMm * STROKE_FRACTION;
  const fontSizeMm = extentMm * LABEL_FRACTION;

  const blackOuter = showBlackZone ? target.referenceDiameterMm / 2 : 0;
  const blackInner = showBlackZone ? blackInnerRadiusMm(target) : 0;
  // Strictly outside the inner edge: a line drawn exactly on it borders the
  // paper centre and has to stay dark to be visible.
  const onBlack = (radiusMm: number): boolean =>
    showBlackZone && radiusMm <= blackOuter && radiusMm > blackInner;

  return (
    // testID before the spread so a wrapper (group-plot) can name itself.
    <View testID="target-face" style={[styles.container, style]} {...rest}>
      <Svg width={size} height={size} viewBox={`${-half} ${-half} ${extentMm} ${extentMm}`}>
        {showBlackZone && <Circle cx={0} cy={0} r={blackOuter} fill={INK} />}
        {showBlackZone && blackInner > 0 && <Circle cx={0} cy={0} r={blackInner} fill={PAPER} />}

        {target.rings.map((ring) => {
          const r = ring.diameterMm / 2;
          return (
            <Circle
              key={`ring-${ring.label}`}
              cx={0}
              cy={0}
              r={r}
              fill="none"
              stroke={onBlack(r) ? ON_BLACK : INK}
              strokeWidth={strokeWidth}
            />
          );
        })}

        {showLabels &&
          target.rings.map((ring, index) => {
            // The X ring shares the 10's value and carries no printed digit.
            const inner = target.rings[index - 1];
            if (!inner || ring.isInnerTen) return null;
            const innerRadius = inner.diameterMm / 2;
            const midRadius = (innerRadius + ring.diameterMm / 2) / 2;
            // Drop the digits the printed face also omits: the inner bands are
            // too narrow to hold them without running over a ring line.
            const halfWidthMm = fontSizeMm * 0.3 * String(ring.value).length;
            if (midRadius - innerRadius < halfWidthMm) return null;
            const fill = onBlack(midRadius) ? ON_BLACK : INK;
            return [-midRadius, midRadius].map((x) => (
              <SvgText
                key={`label-${ring.label}-${x}`}
                x={x}
                // Nudge the baseline so the digit sits centred on the axis.
                y={fontSizeMm * 0.35}
                fontSize={fontSizeMm}
                fill={fill}
                textAnchor="middle"
              >
                {ring.value}
              </SvgText>
            ));
          })}

        {children}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PAPER,
    borderRadius: Radius.medium,
    padding: Spacing.two,
  },
});
