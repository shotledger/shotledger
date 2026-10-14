// Share cards: the card itself, drawn as react-native-svg
// primitives so the same tree both renders on screen (preview) and
// rasterizes to PNG via `Svg.toDataURL()` (app/src/platform/share-card.ts) —
// no Skia, no new dependency. Always the Purple Rain dark palette
// (app/src/theme/tokens.ts `Colors.dark`) regardless of the viewer's app
// theme setting — a share card is a fixed brand artifact, not a themed
// screen.
import { forwardRef, type ComponentRef } from 'react';
import Svg, { Circle, G, Line, Rect } from 'react-native-svg';
import { SvgText } from '@/components/svg-text';

import type { SeriesShareCardModel, SessionShareCardModel } from '@/features/share/card-model';
import { Colors } from '@/theme/tokens';

export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;

const C = Colors.dark;
const MARGIN = 72;
const CONTENT_WIDTH = SHARE_CARD_WIDTH - MARGIN * 2;

export type ShareCardSvgRef = ComponentRef<typeof Svg>;

export const SessionShareCardSvg = forwardRef<ShareCardSvgRef, { model: SessionShareCardModel }>(
  function SessionShareCardSvg({ model }, ref) {
    const y = 230;
    const seriesRows = model.series.map((row, index) => {
      const rowY = y + index * 56;
      return (
        <G key={row.position}>
          <SvgText x={MARGIN} y={rowY} fontSize={30} fill={C.text}>
            {`#${row.position}`}
          </SvgText>
          <SvgText x={MARGIN + 120} y={rowY} fontSize={30} fontWeight="700" fill={C.text}>
            {row.totalLabel}
          </SvgText>
          <SvgText
            x={SHARE_CARD_WIDTH - MARGIN}
            y={rowY}
            fontSize={26}
            fill={C.textSecondary}
            textAnchor="end"
          >
            {`X ${row.xCount}`}
          </SvgText>
        </G>
      );
    });
    const seriesBlockHeight = model.series.length * 56 + 20;
    const statsY = y + seriesBlockHeight + 70;

    return (
      <Svg
        ref={ref}
        width={SHARE_CARD_WIDTH}
        height={SHARE_CARD_HEIGHT}
        viewBox={`0 0 ${SHARE_CARD_WIDTH} ${SHARE_CARD_HEIGHT}`}
        testID="share-card-svg"
      >
        <Rect x={0} y={0} width={SHARE_CARD_WIDTH} height={SHARE_CARD_HEIGHT} fill={C.background} />
        <Rect x={0} y={0} width={SHARE_CARD_WIDTH} height={16} fill={C.primary} />

        <SvgText x={MARGIN} y={90} fontSize={44} fontWeight="700" fill={C.primary}>
          {model.appName}
        </SvgText>
        <SvgText
          x={SHARE_CARD_WIDTH - MARGIN}
          y={90}
          fontSize={28}
          fill={C.textSecondary}
          textAnchor="end"
        >
          {model.dateLabel}
        </SvgText>

        <SvgText x={MARGIN} y={140} fontSize={30} fill={C.text}>
          {[model.disciplineLabel, model.weaponLabel].filter(Boolean).join(' · ')}
        </SvgText>

        <Line
          x1={MARGIN}
          y1={165}
          x2={SHARE_CARD_WIDTH - MARGIN}
          y2={165}
          stroke={C.border}
          strokeWidth={2}
        />

        {seriesRows}

        <Line
          x1={MARGIN}
          y1={statsY - 45}
          x2={SHARE_CARD_WIDTH - MARGIN}
          y2={statsY - 45}
          stroke={C.border}
          strokeWidth={2}
        />

        <SvgText x={MARGIN} y={statsY + 60} fontSize={90} fontWeight="700" fill={C.primary}>
          {model.totalLabel}
        </SvgText>
        {model.averageLabel !== null && (
          <SvgText
            x={SHARE_CARD_WIDTH - MARGIN}
            y={statsY + 10}
            fontSize={28}
            fill={C.textSecondary}
            textAnchor="end"
          >
            {model.averageLabel}
          </SvgText>
        )}
        <SvgText
          x={SHARE_CARD_WIDTH - MARGIN}
          y={statsY + 50}
          fontSize={28}
          fill={C.textSecondary}
          textAnchor="end"
        >
          {`X ${model.xCount}`}
        </SvgText>

        {model.firearmLabel !== null && (
          <SvgText x={MARGIN} y={statsY + 150} fontSize={26} fill={C.textSecondary}>
            {model.firearmLabel}
          </SvgText>
        )}
        {model.note !== null && (
          <SvgText
            x={MARGIN}
            y={statsY + (model.firearmLabel !== null ? 195 : 150)}
            fontSize={24}
            fill={C.text}
          >
            {truncate(model.note, 70)}
          </SvgText>
        )}

        <SvgText
          x={SHARE_CARD_WIDTH / 2}
          y={SHARE_CARD_HEIGHT - 50}
          fontSize={22}
          fill={C.textSecondary}
          textAnchor="middle"
        >
          {model.appName}
        </SvgText>
      </Svg>
    );
  },
);

export const SeriesShareCardSvg = forwardRef<ShareCardSvgRef, { model: SeriesShareCardModel }>(
  function SeriesShareCardSvg({ model }, ref) {
    const chipSize = 100;
    const chipGap = 20;
    const perRow = Math.max(1, Math.floor((CONTENT_WIDTH + chipGap) / (chipSize + chipGap)));
    const chipsTop = 420;

    return (
      <Svg
        ref={ref}
        width={SHARE_CARD_WIDTH}
        height={SHARE_CARD_HEIGHT}
        viewBox={`0 0 ${SHARE_CARD_WIDTH} ${SHARE_CARD_HEIGHT}`}
        testID="share-card-svg"
      >
        <Rect x={0} y={0} width={SHARE_CARD_WIDTH} height={SHARE_CARD_HEIGHT} fill={C.background} />
        <Rect x={0} y={0} width={SHARE_CARD_WIDTH} height={16} fill={C.primary} />

        <SvgText x={MARGIN} y={90} fontSize={44} fontWeight="700" fill={C.primary}>
          {model.appName}
        </SvgText>
        <SvgText
          x={SHARE_CARD_WIDTH - MARGIN}
          y={90}
          fontSize={28}
          fill={C.textSecondary}
          textAnchor="end"
        >
          {model.dateLabel}
        </SvgText>

        <SvgText x={MARGIN} y={140} fontSize={30} fill={C.text}>
          {model.disciplineLabel}
        </SvgText>
        <SvgText x={MARGIN} y={175} fontSize={26} fill={C.textSecondary}>
          {model.seriesLabel}
        </SvgText>

        <SvgText x={MARGIN} y={310} fontSize={130} fontWeight="700" fill={C.primary}>
          {model.totalLabel}
        </SvgText>
        <SvgText
          x={SHARE_CARD_WIDTH - MARGIN}
          y={280}
          fontSize={30}
          fill={C.textSecondary}
          textAnchor="end"
        >
          {`X ${model.xCount}`}
        </SvgText>

        {model.shots.map((shot, index) => {
          const row = Math.floor(index / perRow);
          const col = index % perRow;
          const cx = MARGIN + col * (chipSize + chipGap) + chipSize / 2;
          const cy = chipsTop + row * (chipSize + chipGap) + chipSize / 2;
          return (
            <G key={index}>
              <Circle
                cx={cx}
                cy={cy}
                r={chipSize / 2}
                fill={shot.isX ? C.primary : C.backgroundElement}
                stroke={C.border}
                strokeWidth={2}
              />
              <SvgText
                x={cx}
                y={cy + 12}
                fontSize={34}
                fontWeight="700"
                fill={shot.isX ? C.onPrimary : C.text}
                textAnchor="middle"
              >
                {shot.label}
              </SvgText>
            </G>
          );
        })}

        {model.note !== null && (
          <SvgText x={MARGIN} y={SHARE_CARD_HEIGHT - 130} fontSize={24} fill={C.text}>
            {truncate(model.note, 70)}
          </SvgText>
        )}

        <SvgText
          x={SHARE_CARD_WIDTH / 2}
          y={SHARE_CARD_HEIGHT - 50}
          fontSize={22}
          fill={C.textSecondary}
          textAnchor="middle"
        >
          {model.appName}
        </SvgText>
      </Svg>
    );
  },
);

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
