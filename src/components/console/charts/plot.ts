import { indexAt, niceTicks, type Band, type StepSeries } from "@/core/sim/series";

/** The canvas cannot read CSS variables cheaply per frame, so these mirror the tokens in globals.css. */
export const INK = {
  accent: "#cfff5e",
  wash: "rgba(207, 255, 94, 0.11)",
  band: "rgba(207, 255, 94, 0.2)",
  ghost: "#7d7a70",
  grid: "rgba(237, 233, 222, 0.08)",
  axis: "rgba(237, 233, 222, 0.28)",
  text: "#aeaa9e",
  crosshair: "rgba(237, 233, 222, 0.42)",
  surface: "#11110f",
  series: ["#7aa31f", "#5a90ea"],
} as const;

const MARGIN = { left: 42, right: 12, top: 8, bottom: 34 };
const SECONDS_PER_HOUR = 3600;
const X_TICKS = 5;
const Y_TICKS = 4;

export type Plot = {
  x: (seconds: number) => number;
  y: (value: number) => number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  xTicks: number[];
  yTicks: number[];
  /** Inverse of x, for pointer positions. */
  timeAt: (pixel: number) => number;
};

export const plotOf = (width: number, height: number, xMaxS: number, yMax: number, isWhole: boolean): Plot => {
  const left = MARGIN.left;
  const right = Math.max(left + 1, width - MARGIN.right);
  const top = MARGIN.top;
  const bottom = Math.max(top + 1, height - MARGIN.bottom);
  const xTicks = niceTicks(xMaxS / SECONDS_PER_HOUR, X_TICKS);
  const yTicks = niceTicks(yMax, Y_TICKS, isWhole);
  const xTop = (xTicks.at(-1) ?? 1) * SECONDS_PER_HOUR;
  const yTop = yTicks.at(-1) ?? 1;
  return {
    x: (seconds) => left + (seconds / xTop) * (right - left),
    y: (value) => bottom - (value / yTop) * (bottom - top),
    timeAt: (pixel) => ((pixel - left) / (right - left)) * xTop,
    left, right, top, bottom, xTicks, yTicks,
  };
};

/** Sizes a canvas to its box at device resolution. Returns a context in CSS pixels. */
export const fit = (canvas: HTMLCanvasElement): CanvasRenderingContext2D | null => {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(canvas.clientWidth * ratio);
  const height = Math.round(canvas.clientHeight * ratio);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext("2d");
  context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  return context;
};

const crisp = (value: number): number => Math.round(value) + 0.5;

export const drawAxes = (context: CanvasRenderingContext2D, plot: Plot, font: string, yLabel: string, xLabel: string): void => {
  const { left, right, top, bottom, xTicks, yTicks, x, y } = plot;
  context.font = `9.5px ${font}`;
  context.lineWidth = 1;
  context.fillStyle = INK.text;

  context.textAlign = "right";
  context.textBaseline = "middle";
  for (const tick of yTicks) {
    const py = crisp(y(tick));
    context.strokeStyle = tick === 0 ? INK.axis : INK.grid;
    context.beginPath();
    context.moveTo(left, py);
    context.lineTo(right, py);
    context.stroke();
    context.fillText(String(tick), left - 6, py);
  }

  context.textAlign = "center";
  context.textBaseline = "top";
  context.strokeStyle = INK.axis;
  for (const tick of xTicks) {
    const px = crisp(x(tick * SECONDS_PER_HOUR));
    context.beginPath();
    context.moveTo(px, bottom);
    context.lineTo(px, bottom + 4);
    context.stroke();
    context.fillText(String(tick), px, bottom + 6);
  }
  context.fillText(xLabel, (left + right) / 2, bottom + 20);

  context.save();
  context.translate(10, (top + bottom) / 2);
  context.rotate(-Math.PI / 2);
  context.textBaseline = "middle";
  context.fillText(yLabel, 0, 0);
  context.restore();
};

const traceBand = (context: CanvasRenderingContext2D, plot: Plot, band: Band): void => {
  context.beginPath();
  band.t.forEach((t, index) => context.lineTo(plot.x(t), plot.y(band.p95[index] as number)));
  for (let index = band.t.length - 1; index >= 0; index -= 1) {
    context.lineTo(plot.x(band.t[index] as number), plot.y(band.p5[index] as number));
  }
  context.closePath();
};

export const drawBand = (context: CanvasRenderingContext2D, plot: Plot, band: Band): void => {
  traceBand(context, plot, band);
  context.fillStyle = INK.band;
  context.fill();
};

/** Traces a step line up to time t. `head` lets the newest riser ease into place instead of snapping. */
const traceSteps = (context: CanvasRenderingContext2D, plot: Plot, series: StepSeries, t: number, head: number): void => {
  const last = indexAt(series, t);
  context.beginPath();
  context.moveTo(plot.x(series.t[0] as number), plot.y(series.v[0] as number));
  for (let index = 1; index <= last; index += 1) {
    const px = plot.x(series.t[index] as number);
    context.lineTo(px, plot.y(series.v[index - 1] as number));
    context.lineTo(px, plot.y(index === last ? head : (series.v[index] as number)));
  }
  context.lineTo(plot.x(t), plot.y(head));
};

export const strokeSteps = (context: CanvasRenderingContext2D, plot: Plot, series: StepSeries, t: number, head: number, color: string, width = 2): void => {
  traceSteps(context, plot, series, t, head);
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();
};

export const washSteps = (context: CanvasRenderingContext2D, plot: Plot, series: StepSeries, t: number, head: number): void => {
  traceSteps(context, plot, series, t, head);
  context.lineTo(plot.x(t), plot.bottom);
  context.lineTo(plot.x(series.t[0] as number), plot.bottom);
  context.closePath();
  context.fillStyle = INK.wash;
  context.fill();
};

/** A filled marker with a surface ring, so it stays legible where it crosses other marks. */
export const dot = (context: CanvasRenderingContext2D, px: number, py: number, radius: number, color: string): void => {
  context.beginPath();
  context.arc(px, py, radius + 2, 0, Math.PI * 2);
  context.fillStyle = INK.surface;
  context.fill();
  context.beginPath();
  context.arc(px, py, radius, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
};

export const crosshair = (context: CanvasRenderingContext2D, plot: Plot, px: number): void => {
  context.strokeStyle = INK.crosshair;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(crisp(px), plot.top);
  context.lineTo(crisp(px), plot.bottom);
  context.stroke();
};
