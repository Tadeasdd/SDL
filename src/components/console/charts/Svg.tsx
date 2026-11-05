import type { ReactNode } from "react";
import { niceTicks } from "@/core/sim/series";

export type Scale = { x: (value: number) => number; y: (value: number) => number; left: number; right: number; top: number; bottom: number };

type Props = {
  width: number;
  height: number;
  xMax: number;
  yMax: number;
  xLabel: string;
  yLabel: string;
  title: string;
  /** Overrides the linear x axis, for a log dose axis. */
  xAxis?: { scale: (value: number, left: number, right: number) => number; ticks: { value: number; label: string }[] };
  children: (scale: Scale) => ReactNode;
};

const MARGIN = { left: 46, right: 12, top: 8, bottom: 36 };

/** A static chart with classic axes. Uses currentColor, so it also prints correctly on white. */
export function SvgChart({ width, height, xMax, yMax, xLabel, yLabel, title, xAxis, children }: Props) {
  const left = MARGIN.left;
  const right = width - MARGIN.right;
  const top = MARGIN.top;
  const bottom = height - MARGIN.bottom;
  const yTicks = niceTicks(yMax, 4);
  const yTop = yTicks.at(-1) ?? 1;
  const linear = niceTicks(xMax, 5);
  const xTop = linear.at(-1) ?? 1;
  const x = xAxis ? (value: number) => xAxis.scale(value, left, right) : (value: number) => left + (value / xTop) * (right - left);
  const y = (value: number) => bottom - (value / yTop) * (bottom - top);
  const xTicks = xAxis?.ticks ?? linear.map((value) => ({ value, label: String(value) }));
  return (
    <svg className="svg-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
      {yTicks.map((tick) => (
        <g key={tick}>
          <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? "axis" : "grid"} />
          <text x={left - 6} y={y(tick)} textAnchor="end" dominantBaseline="middle">{tick}</text>
        </g>
      ))}
      {xTicks.map(({ value, label }) => (
        <g key={value}>
          <line x1={x(value)} x2={x(value)} y1={bottom} y2={bottom + 4} className="axis" />
          <text x={x(value)} y={bottom + 14} textAnchor="middle">{label}</text>
        </g>
      ))}
      <text x={(left + right) / 2} y={height - 6} textAnchor="middle">{xLabel}</text>
      <text transform={`translate(11 ${(top + bottom) / 2}) rotate(-90)`} textAnchor="middle">{yLabel}</text>
      {children({ x, y, left, right, top, bottom })}
    </svg>
  );
}
