"use client";

import { useEffect, useMemo, useState } from "react";
import { EXAMPLE_CONFIG } from "@/core/example-config";
import { monteCarlo } from "@/core/sim/montecarlo";
import { layoutIssues } from "@/core/twin/layout-edit";
import { signed } from "./format";
import { useConsole } from "./store";

const RUNS = 16;
const SETTLE_MS = 250;
const NUDGE_M = 0.05;

type Outcome = { before: number; after: number } | { problem: string } | null;

/** Controls and live results for layout editing. The number fields also make it usable without a mouse. */
export function LayoutPanel() {
  const twin = useConsole((state) => state.agent.twin);
  const base = useConsole((state) => state.layoutBase);
  const config = useConsole((state) => state.sim.config);
  const selectedId = useConsole((state) => state.selectedId);
  const moveItem = useConsole((state) => state.moveItem);
  const resetLayout = useConsole((state) => state.resetLayout);
  const setEditing = useConsole((state) => state.setEditingLayout);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const item = twin.instruments.find(({ id }) => id === selectedId);
  const issues = useMemo(() => layoutIssues(twin, base ?? twin), [twin, base]);

  useEffect(() => {
    if (base === null) return;
    const timer = setTimeout(() => {
      const settings = config.demands.length > 0 ? config : EXAMPLE_CONFIG;
      try {
        setOutcome({ before: monteCarlo(base, settings, RUNS).throughputPerHour.mean, after: monteCarlo(twin, settings, RUNS).throughputPerHour.mean });
      } catch (error) {
        setOutcome({ problem: error instanceof Error ? error.message : "This layout cannot run." });
      }
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [twin, base, config]);

  const shown = base === null ? null : outcome;
  return (
    <section className="layout-panel" aria-label="Layout editor" data-testid="layout-panel">
      <div className="layout-head">
        <span className="label">Edit layout</span>
        <span className="chart-note mono">Drag an instrument in the 3D view, or use the fields.</span>
        <button className="btn btn-small" onClick={resetLayout} disabled={base === null}>Reset</button>
        <button className="btn btn-small" onClick={() => setEditing(false)}>Done</button>
      </div>
      {item ? (
        <div className="fields fields-row">
          <span className="mono">{item.id}</span>
          <label className="field"><span>X (m)</span><input type="number" step={NUDGE_M} value={Number(item.x.toFixed(2))} onChange={(event) => moveItem(item.id, Number(event.target.value), item.y)} /></label>
          <label className="field"><span>Y (m)</span><input type="number" step={NUDGE_M} value={Number(item.y.toFixed(2))} onChange={(event) => moveItem(item.id, item.x, Number(event.target.value))} /></label>
        </div>
      ) : <p className="chart-note mono">Select an instrument.</p>}
      <div className="layout-result" data-testid="layout-result" aria-live="polite">
        {shown !== null && "problem" in shown ? <span className="flag flag-crit">{shown.problem}</span> : null}
        {shown !== null && "after" in shown ? (
          <span className="mono">{shown.after.toFixed(2)} plates/h, {signed(((shown.after - shown.before) / shown.before) * 100, 1)}% against the mapped layout</span>
        ) : null}
        {issues.length === 0 ? <span className="flag flag-good">Layout checks pass</span> : issues.slice(0, 3).map((issue) => <span key={`${issue.id}-${issue.kind}-${issue.message}`} className="flag flag-crit">{issue.message}</span>)}
      </div>
    </section>
  );
}
