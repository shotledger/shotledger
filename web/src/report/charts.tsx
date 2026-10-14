// SVG charts for a wide screen. Geometry and grouping come from the app's
// chart math (components/time-series-chart-math.ts), so a discipline keeps
// its colour and the axis its year on both surfaces; the value axis rounds to
// the same nice ticks as the phone's chart kit (`niceTicks`, #822), and a bar
// chart's axis starts at zero.
import { niceTicks } from '@shotledger/shared/src/charts/nice-ticks';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  MAX_DOTS,
  axisNeedsYear,
  timeExtent,
  timeScale,
  type GroupedLines,
} from '../../../app/src/components/time-series-chart-math';

const HEIGHT = 240;

/** The element's own width, so the SVG draws at 1:1 and its text stays legible. */
function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
const PAD = { left: 48, right: 16, top: 12, bottom: 28 };

/** A tick in the UI language's number format, like the phone's `formatTick`. */
function useTickFormat() {
  const { i18n } = useTranslation();
  return (value: number, decimals: number) =>
    new Intl.NumberFormat(i18n.language, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
}

export function LineChart({
  label,
  grouped,
  formatDate,
  emptyLabel,
  omittedLabel,
}: {
  /** The chart's accessible name: what it plots. */
  label: string;
  /** Values in the unit the axis shows (points, not tenths). */
  grouped: GroupedLines;
  formatDate: (iso: string, withYear: boolean) => string;
  emptyLabel: string;
  omittedLabel: string | null;
}) {
  const [ref, WIDTH] = useWidth<HTMLElement>(640);
  const format = useTickFormat();
  const all = grouped.lines.flatMap((line) => line.points);
  if (all.length < 2) return <p className="muted">{emptyLabel}</p>;

  const extent = timeExtent(all);
  const values = all.map((p) => p.value);
  const axis = niceTicks(Math.min(...values), Math.max(...values), 5);
  const { min, max } = axis;
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (iso: string) => timeScale(iso, extent, PAD.left, plotW);
  const y = (value: number) => PAD.top + (1 - (value - min) / (max - min)) * plotH;
  const withYear = axisNeedsYear(all);
  const ticks = axis.ticks;
  const formatValue = (value: number) => format(value, axis.decimals);
  const formatPoint = (value: number) => format(value, axis.decimals + 1);
  const first = new Date(extent.minMs).toISOString();
  const last = new Date(extent.maxMs).toISOString();

  return (
    <figure className="chart" ref={ref}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className={tick === min ? 'grid' : 'grid dashed'}
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="axis" x={PAD.left - 6} y={y(tick)} textAnchor="end" dy="0.35em">
              {formatValue(tick)}
            </text>
          </g>
        ))}
        <text className="axis" x={PAD.left} y={HEIGHT - 8}>
          {formatDate(first, withYear)}
        </text>
        <text className="axis" x={WIDTH - PAD.right} y={HEIGHT - 8} textAnchor="end">
          {formatDate(last, withYear)}
        </text>
        {grouped.lines.map((line) => (
          <g key={line.key}>
            <polyline
              fill="none"
              stroke={line.color}
              strokeWidth={2}
              points={line.points.map((p) => `${x(p.startedAt)},${y(p.value)}`).join(' ')}
            />
            {line.points.length <= MAX_DOTS &&
              line.points.map((p) => (
                <circle key={p.key} cx={x(p.startedAt)} cy={y(p.value)} r={3} fill={line.color}>
                  <title>{`${line.label} · ${formatDate(p.startedAt, true)} · ${formatPoint(p.value)}`}</title>
                </circle>
              ))}
          </g>
        ))}
      </svg>
      {grouped.lines.length > 1 && (
        <figcaption className="legend">
          {grouped.lines.map((line) => (
            <span key={line.key}>
              <i style={{ background: line.color }} />
              {line.label}
            </span>
          ))}
        </figcaption>
      )}
      {omittedLabel && <p className="muted">{omittedLabel}</p>}
    </figure>
  );
}

export function BarChart({
  label,
  buckets,
}: {
  label: string;
  buckets: readonly { value: number; count: number }[];
}) {
  const [ref, WIDTH] = useWidth<HTMLElement>(480);
  const format = useTickFormat();
  const height = 200;
  const pad = { left: 40, right: 8, top: 8, bottom: 22 };
  // A bar's length is its count, so the axis starts at zero, always.
  const axis = niceTicks(0, Math.max(1, ...buckets.map((b) => b.count)), 4);
  const plotH = height - pad.top - pad.bottom;
  const plotW = WIDTH - pad.left - pad.right;
  const slot = plotW / Math.max(1, buckets.length);
  const barW = Math.min(slot * 0.7, 56);
  const y = (count: number) => pad.top + (1 - count / axis.max) * plotH;
  return (
    <figure className="chart" ref={ref}>
      <svg viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={label}>
        {axis.ticks.map((tick) => (
          <g key={tick}>
            <line
              className={tick === 0 ? 'grid' : 'grid dashed'}
              x1={pad.left}
              x2={WIDTH - pad.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="axis" x={pad.left - 6} y={y(tick)} textAnchor="end" dy="0.35em">
              {format(tick, axis.decimals)}
            </text>
          </g>
        ))}
        {buckets.map((bucket, index) => {
          const center = pad.left + index * slot + slot / 2;
          return (
            <g key={bucket.value}>
              <rect
                className="bar-fill"
                x={center - barW / 2}
                y={y(bucket.count)}
                width={barW}
                height={Math.max(0, y(0) - y(bucket.count))}
                rx={2}
              >
                <title>{`${bucket.value}: ${bucket.count}`}</title>
              </rect>
              <text className="axis" x={center} y={height - 6} textAnchor="middle">
                {bucket.value}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export function ScatterPlot({
  label,
  points,
  xLabel,
  yLabel,
  formatValue,
}: {
  label: string;
  points: readonly { key: string; x: number; y: number }[];
  xLabel: string;
  yLabel: string;
  formatValue: (value: number) => string;
}) {
  const size = 260;
  const pad = 36;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const range = (vs: number[]) => {
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    return lo === hi ? [lo - 1, hi + 1] : [lo, hi];
  };
  const [x0, x1] = range(xs) as [number, number];
  const [y0, y1] = range(ys) as [number, number];
  const sx = (v: number) => pad + ((v - x0) / (x1 - x0)) * (size - 2 * pad);
  const sy = (v: number) => size - pad - ((v - y0) / (y1 - y0)) * (size - 2 * pad);
  return (
    <figure className="chart scatter">
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <line className="grid" x1={pad} x2={size - pad} y1={size - pad} y2={size - pad} />
        <line className="grid" x1={pad} x2={pad} y1={pad} y2={size - pad} />
        <text className="axis" x={size / 2} y={size - 6} textAnchor="middle">
          {xLabel}
        </text>
        <text
          className="axis"
          x={12}
          y={size / 2}
          textAnchor="middle"
          transform={`rotate(-90 12 ${size / 2})`}
        >
          {yLabel}
        </text>
        <text className="axis" x={pad} y={size - pad + 14}>
          {formatValue(x0)}
        </text>
        <text className="axis" x={size - pad} y={size - pad + 14} textAnchor="end">
          {formatValue(x1)}
        </text>
        {points.map((p) => (
          <circle key={p.key} className="dot" cx={sx(p.x)} cy={sy(p.y)} r={4}>
            <title>{`${formatValue(p.x)} → ${formatValue(p.y)}`}</title>
          </circle>
        ))}
      </svg>
    </figure>
  );
}
