"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Segment, SimResult } from "@/core/sim/types";
import type { LabTwin } from "@/core/twin/schema";
import { clock, minutes } from "./format";
import { RATES, usePlayback } from "./playback";

const LANE_H = 12;
const GUTTER = 74;
const BAR_H = 7;
const COLORS = { primary: "#7aa31f", other: "#5a90ea", failed: "#ff6a5c", move: "#8a877c", label: "#7d7a70", rule: "rgba(237,233,222,0.09)" };

type Lane = { id: string; y: number };

const orderLanes = (twin: LabTwin, result: SimResult): Lane[] => {
  const used = new Set(result.resources.map((item) => item.id));
  const ids = [...twin.instruments.map((item) => item.id), ...twin.transports.map((item) => item.id)].filter((id) => used.has(id));
  return ids.map((id, index) => ({ id, y: index * LANE_H }));
};

const color = (segment: Segment, primaryId: string | undefined): string => {
  if (segment.failed || segment.kind === "down") return COLORS.failed;
  if (segment.kind === "move") return COLORS.move;
  return segment.workflowId === primaryId ? COLORS.primary : COLORS.other;
};

const draw = (canvas: HTMLCanvasElement, lanes: Lane[], result: SimResult, primaryId: string | undefined): void => {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = lanes.length * LANE_H;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const context = canvas.getContext("2d");
  if (context === null) return;
  context.scale(ratio, ratio);
  context.font = "9px ui-monospace, Menlo, monospace";
  context.textBaseline = "middle";
  const scale = (width - GUTTER) / Math.max(result.makespanS, 1);
  const rows = new Map(lanes.map((lane) => [lane.id, lane.y]));

  for (const lane of lanes) {
    context.fillStyle = COLORS.label;
    context.fillText(lane.id, 0, lane.y + LANE_H / 2);
    context.fillStyle = COLORS.rule;
    context.fillRect(GUTTER, lane.y + LANE_H - 1, width - GUTTER, 1);
  }
  for (const segment of result.segments) {
    const y = rows.get(segment.resourceId);
    if (y === undefined || segment.kind === "wait") continue;
    context.fillStyle = color(segment, primaryId);
    const barWidth = Math.max(1, (segment.end - segment.start) * scale - 1);
    context.fillRect(GUTTER + segment.start * scale, y + (LANE_H - BAR_H) / 2 - 0.5, barWidth, BAR_H);
  }
};

function Legend({ primary }: { primary: string }) {
  return (
    <ul className="legend mono">
      <li><i style={{ background: COLORS.primary }} />{primary}</li>
      <li><i style={{ background: COLORS.other }} />Other workflows</li>
      <li><i style={{ background: COLORS.move }} />Transport</li>
      <li><i style={{ background: COLORS.failed }} />Failure or maintenance</li>
    </ul>
  );
}

type Hover = { x: number; y: number; text: string };

export function Timeline({ twin, result }: { twin: LabTwin; result: SimResult }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const lanes = useMemo(() => orderLanes(twin, result), [twin, result]);
  const primaryId = twin.workflows[0]?.id;
  const playing = usePlayback((state) => state.playing);
  const rate = usePlayback((state) => state.rate);
  const { seek, setPlaying, setRate } = usePlayback.getState();

  useEffect(() => {
    const target = canvas.current;
    if (target === null) return;
    const render = () => draw(target, lanes, result, primaryId);
    render();
    const observer = new ResizeObserver(render);
    observer.observe(target);
    return () => observer.disconnect();
  }, [lanes, result, primaryId]);

  useEffect(
    () =>
      usePlayback.subscribe(({ t, duration }) => {
        const width = canvas.current?.clientWidth ?? 0;
        if (head.current !== null && duration > 0) {
          head.current.style.transform = `translateX(${GUTTER + (t / duration) * (width - GUTTER)}px)`;
        }
        if (readout.current !== null) readout.current.textContent = clock(t);
      }),
    [],
  );

  const timeAt = (event: ReactPointerEvent<HTMLElement>): number => {
    const box = event.currentTarget.getBoundingClientRect();
    return ((event.clientX - box.left - GUTTER) / Math.max(box.width - GUTTER, 1)) * result.makespanS;
  };

  const onDown = (event: ReactPointerEvent<HTMLElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    seek(timeAt(event));
  };

  const onMove = (event: ReactPointerEvent<HTMLElement>) => {
    const t = timeAt(event);
    if (event.buttons === 1) seek(t);
    const box = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - box.top;
    const lane = lanes[Math.floor(y / LANE_H)];
    const hit = result.segments.find((item) => item.resourceId === lane?.id && item.kind !== "wait" && item.start <= t && t < item.end);
    setHover(hit ? { x: event.clientX - box.left, y, text: hit.kind === "down" ? `Planned maintenance · ${minutes(hit.end - hit.start)}` : `Plate ${hit.plateId} · ${hit.stepId} · ${minutes(hit.end - hit.start)}${hit.failed ? " · failed" : ""}` } : null);
  };

  return (
    <section className="dock dock-sim" aria-label="Simulation timeline">
      <div className="transport">
        <button className="btn btn-solid" onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play"}</button>
        <div className="seg" role="group" aria-label="Playback rate">
          {RATES.map((value) => (
            <button key={value} className={rate === value ? "is-on" : ""} aria-pressed={rate === value} onClick={() => setRate(value)}>{value}×</button>
          ))}
        </div>
        <span ref={readout} className="mono readout" aria-live="off">T+00:00:00</span>
        <Legend primary={twin.workflows[0]?.name ?? "Workflow"} />
      </div>
      <div className="gantt" onPointerDown={onDown} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <canvas ref={canvas} role="img" aria-label={`Gantt chart of ${result.segments.length} activities across ${lanes.length} resources. Utilisation figures are listed in the results panel.`} />
        <div ref={head} className="playhead" />
        {hover ? <div className="tip mono" style={{ left: hover.x, top: hover.y }}>{hover.text}</div> : null}
      </div>
    </section>
  );
}
