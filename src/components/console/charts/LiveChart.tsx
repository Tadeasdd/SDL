"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { usePlayback } from "../playback";
import { drawAxes, fit, crosshair, plotOf, type Plot } from "./plot";

const X_LABEL = "Simulated time (h)";
/** Larger jumps are seeks or a new run, which should land at once rather than glide. */
const SNAP_SHARE = 0.12;
const EASE_PER_S = 16;
const SETTLED = 0.002;
const TIP_GAP_PX = 12;

export type ChartSpec = {
  xMaxS: number;
  yMax: number;
  yLabel: string;
  isWhole: boolean;
  drawBase?: (context: CanvasRenderingContext2D, plot: Plot) => void;
  drawLive: (context: CanvasRenderingContext2D, plot: Plot, t: number, head: number) => void;
  /** The value the line is heading to at time t. */
  targetAt: (t: number) => number;
  readout: (t: number) => string;
  tipAt: (t: number) => string[];
  summary: string;
};

type Props = { title: string; legend?: ReactNode; spec: ChartSpec; height: number; testId: string };

const fontOf = (element: HTMLElement): string => getComputedStyle(element).fontFamily;

const prefersStill = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Two stacked canvases. The base holds what never moves and repaints only on a new run or a resize.
 * The live layer repaints in one requestAnimationFrame loop that reads the playback clock directly,
 * so nothing here re-renders React while a simulation plays.
 */
export function LiveChart({ title, legend, spec, height, testId }: Props) {
  const base = useRef<HTMLCanvasElement>(null);
  const live = useRef<HTMLCanvasElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const hoverX = useRef<number | null>(null);

  useEffect(() => {
    const under = base.current;
    const over = live.current;
    if (under === null || over === null) return;

    let plot = plotOf(1, 1, spec.xMaxS, spec.yMax, spec.isWhole);
    let head = spec.targetAt(usePlayback.getState().t);
    let drawn = { t: Number.NaN, head: Number.NaN, hover: null as number | null };
    let lastText = "";
    let lastTip = "";
    let frame = 0;
    let previous = performance.now();

    const paintBase = (): void => {
      const context = fit(under);
      if (context === null) return;
      plot = plotOf(under.clientWidth, under.clientHeight, spec.xMaxS, spec.yMax, spec.isWhole);
      context.clearRect(0, 0, under.clientWidth, under.clientHeight);
      spec.drawBase?.(context, plot);
      drawAxes(context, plot, fontOf(under), spec.yLabel, X_LABEL);
    };

    const showTip = (time: number, px: number): void => {
      const box = tip.current;
      if (box === null) return;
      const lines = spec.tipAt(time);
      const text = lines.join("\n");
      if (text !== lastTip) {
        lastTip = text;
        box.replaceChildren(...lines.map((line, index) => {
          const row = document.createElement(index === 0 ? "strong" : "span");
          row.textContent = line;
          return row;
        }));
      }
      const isRightHalf = px > (plot.left + plot.right) / 2;
      box.style.transform = `translate(${isRightHalf ? px - box.offsetWidth - TIP_GAP_PX : px + TIP_GAP_PX}px, ${plot.top}px)`;
      box.style.visibility = "visible";
    };

    const paintLive = (t: number, hover: number | null): void => {
      const context = fit(over);
      if (context === null) return;
      context.clearRect(0, 0, over.clientWidth, over.clientHeight);
      spec.drawLive(context, plot, t, head);
      if (hover === null) {
        if (tip.current !== null) tip.current.style.visibility = "hidden";
      } else {
        // Nothing past the playhead has happened yet, so the crosshair stops there.
        const px = Math.min(hover, plot.x(t));
        crosshair(context, plot, px);
        showTip(hover >= plot.x(t) ? t : plot.timeAt(px), px);
      }
      const text = spec.readout(t);
      if (text !== lastText && readout.current !== null) {
        lastText = text;
        readout.current.textContent = text;
      }
      drawn = { t, head, hover };
    };

    const ease = (target: number, deltaS: number): void => {
      const isJump = Math.abs(target - head) > spec.yMax * SNAP_SHARE;
      if (isJump || prefersStill()) head = target;
      else head += (target - head) * (1 - Math.exp(-deltaS * EASE_PER_S));
      if (Math.abs(target - head) < spec.yMax * SETTLED) head = target;
    };

    const loop = (now: number): void => {
      const { t } = usePlayback.getState();
      ease(spec.targetAt(t), (now - previous) / 1000);
      previous = now;
      const hover = hoverX.current;
      if (t !== drawn.t || head !== drawn.head || hover !== drawn.hover) paintLive(t, hover);
      frame = requestAnimationFrame(loop);
    };

    const repaint = (): void => {
      paintBase();
      paintLive(usePlayback.getState().t, hoverX.current);
    };

    repaint();
    frame = requestAnimationFrame(loop);
    const observer = new ResizeObserver(repaint);
    observer.observe(under);
    let isMounted = true;
    void document.fonts.ready.then(() => { if (isMounted) repaint(); });
    return () => {
      isMounted = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [spec]);

  const pointerX = (event: ReactPointerEvent<HTMLElement>): number => event.clientX - event.currentTarget.getBoundingClientRect().left;

  const seekTo = (event: ReactPointerEvent<HTMLElement>): void => {
    const box = live.current;
    if (box === null) return;
    const scale = plotOf(box.clientWidth, box.clientHeight, spec.xMaxS, spec.yMax, spec.isWhole);
    usePlayback.getState().seek(scale.timeAt(pointerX(event)));
  };

  return (
    <figure className="chart" data-testid={testId}>
      <figcaption>
        <span className="chart-title">{title}</span>
        <span ref={readout} className="mono chart-readout" />
      </figcaption>
      {legend}
      <div
        className="chart-plot"
        style={{ height }}
        onPointerMove={(event) => {
          hoverX.current = pointerX(event);
          if (event.buttons === 1) seekTo(event);
        }}
        onPointerLeave={() => { hoverX.current = null; }}
        onPointerDown={seekTo}
      >
        <canvas ref={base} aria-hidden />
        <canvas ref={live} role="img" aria-label={spec.summary} />
        <div ref={tip} className="chart-tip mono" />
      </div>
    </figure>
  );
}
