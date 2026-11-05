"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { EvidenceDoc } from "@/core/agent/evidence";
import type { AgentEvent } from "@/core/agent/events";
import { applyPatches } from "@/core/sim/scenarios";
import { EvidenceViewer } from "./EvidenceViewer";
import { MapView } from "./MapView";
import { usePlayback } from "./playback";
import { PlanView } from "./PlanView";
import { ReportView } from "./ReportView";
import { SimulateView } from "./SimulateView";
import { useConsole, type Layers, type View } from "./store";
import { TwinView } from "./TwinView";

const LabScene = dynamic(() => import("../scene/LabScene"), { ssr: false });

const VIEWS: { id: View; label: string }[] = [
  { id: "map", label: "Map" },
  { id: "twin", label: "Twin" },
  { id: "simulate", label: "Simulate" },
  { id: "report", label: "Report" },
];

const LAYERS: { id: keyof Layers; label: string }[] = [
  { id: "cloud", label: "Cloud" },
  { id: "routes", label: "Routes" },
  { id: "labels", label: "Labels" },
];

const delayFor = (event: AgentEvent): number => {
  if (event.type === "thought") return 450 + Math.min(event.text.length * 5, 650);
  return event.type === "tool" ? 70 : 110;
};

const isView = (value: string): value is View => VIEWS.some((view) => view.id === value);

const canUseWebGL = (): boolean => {
  try {
    return document.createElement("canvas").getContext("webgl2") !== null;
  } catch {
    return false;
  }
};

/** Steps the scripted replay on a timer, at the chosen speed. */
const useReplayDriver = (): void => {
  const isReplaying = useConsole((state) => state.source === "replay" && state.agent.status === "running");
  useEffect(() => {
    if (!isReplaying) return;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      const { advance, speed } = useConsole.getState();
      const event = advance();
      if (event !== null) timer = setTimeout(step, delayFor(event) / speed);
    };
    timer = setTimeout(step, 500);
    return () => clearTimeout(timer);
  }, [isReplaying]);
};

/** A backgrounded tab stops frames. Without a cap, coming back would jump the run forward. */
const MAX_TICK_S = 0.1;

const usePlaybackClock = (): void => {
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      usePlayback.getState().tick(Math.min((now - last) / 1000, MAX_TICK_S));
      last = now;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);
};

const useBoot = (docs: EvidenceDoc[]): void => {
  useEffect(() => {
    const { init, startReplay, skipReplay, setView } = useConsole.getState();
    init(docs);
    startReplay();
    const target = window.location.hash.slice(1);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (isView(target)) setView(target);
    if (reduced || (isView(target) && target !== "map")) skipReplay();
  }, [docs]);
};

function Header() {
  const view = useConsole((state) => state.view);
  const setView = useConsole((state) => state.setView);
  const source = useConsole((state) => state.source);
  const name = useConsole((state) => state.agent.twin.name);
  const status = useConsole((state) => state.agent.status);
  const select = (next: View) => {
    setView(next);
    window.history.replaceState(null, "", `#${next}`);
  };
  return (
    <header className="bar">
      <Link href="/" className="wordmark wide" aria-label="SDL home">SDL</Link>
      <span className="bar-lab mono">{name}{source === "replay" ? " · fictional" : ""}</span>
      <nav className="tabs" aria-label="Console views">
        {VIEWS.map(({ id, label }, index) => (
          <button key={id} className={`tab${view === id ? " is-active" : ""}`} aria-current={view === id ? "page" : undefined} onClick={() => select(id)}>
            <span className="tab-index">0{index + 1}</span>{label}
          </button>
        ))}
      </nav>
      <span className={`chip ${source === "live" ? "chip-live" : ""}`} title={source === "replay" ? "Authored decisions, real tools. No model is called." : undefined}>
        <i className={status === "running" ? "pulse" : ""} />
        {source === "replay" ? "Scripted replay" : "Live agent"}
      </span>
    </header>
  );
}

function Hud({ mode, onMode }: { mode: "3d" | "plan"; onMode: (mode: "3d" | "plan") => void }) {
  const layers = useConsole((state) => state.layers);
  const toggle = useConsole((state) => state.toggleLayer);
  return (
    <div className="hud">
      <div className="seg" role="group" aria-label="Viewport mode">
        <button className={mode === "3d" ? "is-on" : ""} aria-pressed={mode === "3d"} onClick={() => onMode("3d")}>3D</button>
        <button className={mode === "plan" ? "is-on" : ""} aria-pressed={mode === "plan"} onClick={() => onMode("plan")}>Plan</button>
      </div>
      {mode === "3d" ? (
        <div className="seg" role="group" aria-label="Layers">
          {LAYERS.map(({ id, label }) => (
            <button key={id} className={layers[id] ? "is-on" : ""} aria-pressed={layers[id]} onClick={() => toggle(id)}>{label}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Viewport() {
  const [mode, setMode] = useState<"3d" | "plan">("3d");
  const [hasWebGL, setHasWebGL] = useState(true);
  const twin = useConsole((state) => state.agent.twin);
  const status = useConsole((state) => state.agent.status);
  const touched = useConsole((state) => state.agent.touched);
  const view = useConsole((state) => state.view);
  const sim = useConsole((state) => state.sim);
  const selectedId = useConsole((state) => state.selectedId);
  const select = useConsole((state) => state.select);
  const layers = useConsole((state) => state.layers);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- WebGL can only be probed in the browser.
  useEffect(() => setHasWebGL(canUseWebGL()), []);

  const isSimulating = view === "simulate";
  const shownTwin = useMemo(() => {
    const patches = sim.scenarios.flatMap((scenario) => scenario.patches);
    return isSimulating && sim.comparison !== null ? applyPatches(twin, patches) : twin;
  }, [isSimulating, sim.comparison, sim.scenarios, twin]);
  const run = sim.comparison?.scenario.representative ?? sim.baseline?.representative;
  const segments = isSimulating ? run?.segments : undefined;
  const isPlan = mode === "plan" || !hasWebGL;
  const isScanning = status === "running";

  return (
    <div className="viewport">
      {isPlan ? (
        <PlanView twin={shownTwin} selectedId={selectedId} onSelect={select} />
      ) : (
        <LabScene
          twin={shownTwin}
          segments={segments}
          selectedId={selectedId}
          touchedId={touched}
          showCloud={layers.cloud || isScanning}
          showRoutes={layers.routes}
          showLabels={layers.labels}
          isScanning={isScanning}
          onSelect={select}
        />
      )}
      {hasWebGL ? <Hud mode={mode} onMode={setMode} /> : <p className="hud mono">WebGL unavailable. Showing plan view.</p>}
      <p className="viewport-note mono">{isPlan ? "Plan view" : layers.cloud || isScanning ? "Point cloud is synthesised from the twin, not a captured scan" : "Instrument models are procedural, drawn to the sizes in the twin"}</p>
    </div>
  );
}

export function Console({ docs }: { docs: EvidenceDoc[] }) {
  const view = useConsole((state) => state.view);
  useBoot(docs);
  useReplayDriver();
  usePlaybackClock();
  return (
    <div className="console">
      <Header />
      <main className={`stage stage-${view}`}>
        <Viewport />
        {view === "map" ? <MapView /> : null}
        {view === "twin" ? <TwinView /> : null}
        {view === "simulate" ? <SimulateView /> : null}
        {view === "report" ? <ReportView /> : null}
      </main>
      <EvidenceViewer />
    </div>
  );
}
