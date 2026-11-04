"use client";

import { useEffect, useMemo } from "react";
import { MONTE_CARLO_RUNS } from "@/core/example-config";
import { candidateInterventions, type Comparison, type Scenario } from "@/core/sim/scenarios";
import type { MonteCarloResult, Range } from "@/core/sim/types";
import type { LabTwin } from "@/core/twin/schema";
import { hours, minutes, signed } from "./format";
import { usePlayback } from "./playback";
import { useConsole } from "./store";
import { Timeline } from "./Timeline";

const stressTests = (twin: LabTwin): Scenario[] => [
  ...twin.transports.filter((item) => item.kind === "amr").map((item): Scenario => ({
    id: `slow-${item.id}`,
    name: `Run ${item.id} at half speed`,
    rationale: "Stress test.",
    patches: [{ op: "scale-transport-speed", id: item.id, factor: 0.5 }],
  })),
  ...twin.instruments.filter((item) => item.capabilities.includes("read") && item.state === "online").map((item): Scenario => ({
    id: `lose-${item.id}`,
    name: `Lose ${item.id}`,
    rationale: "Stress test.",
    patches: [{ op: "set-state", id: item.id, state: "offline" }],
  })),
];

function Slider({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (value: number) => void;
}) {
  return (
    <label className="slider">
      <span>{label}</span>
      <output className="mono">{value} {unit}</output>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Setup({ twin }: { twin: LabTwin }) {
  const sim = useConsole((state) => state.sim);
  const { setConfig, toggleScenario, runSimulation } = useConsole.getState();
  const changes = useMemo(() => candidateInterventions(twin), [twin]);
  const stress = useMemo(() => stressTests(twin), [twin]);
  const isActive = (id: string) => sim.scenarios.some((item) => item.id === id);

  const setDemand = (workflowId: string, plates: number) =>
    setConfig({ ...sim.config, demands: sim.config.demands.map((item) => (item.workflowId === workflowId ? { ...item, plates } : item)) });

  const option = (scenario: Scenario) => (
    <li key={scenario.id}>
      <label className="check">
        <input type="checkbox" checked={isActive(scenario.id)} onChange={() => toggleScenario(scenario)} />
        <span>{scenario.name}</span>
      </label>
    </li>
  );

  return (
    <section className="panel panel-left" aria-label="Simulation setup">
      <h2 className="panel-title"><span>Scenario</span><span>{MONTE_CARLO_RUNS} runs</span></h2>
      <div className="panel-scroll">
        <h3 className="group-head label">Demand</h3>
        {sim.config.demands.map((demand) => (
          <Slider key={demand.workflowId} label={twin.workflows.find((item) => item.id === demand.workflowId)?.name ?? demand.workflowId} value={demand.plates} min={0} max={120} step={4} unit="plates" onChange={(value) => setDemand(demand.workflowId, value)} />
        ))}
        <Slider label="Work in progress limit" value={sim.config.maxWip} min={4} max={60} step={2} unit="plates" onChange={(maxWip) => setConfig({ ...sim.config, maxWip })} />
        <label className="check">
          <input type="checkbox" checked={sim.config.failures} onChange={() => setConfig({ ...sim.config, failures: !sim.config.failures })} />
          <span>Instrument failures from MTBF</span>
        </label>
        <h3 className="group-head label">Changes</h3>
        <ul>{changes.map(option)}</ul>
        <h3 className="group-head label">Stress tests</h3>
        <ul>{stress.map(option)}</ul>
      </div>
      <button className="btn btn-solid btn-block" disabled={sim.status === "running"} onClick={runSimulation}>
        {sim.status === "running" ? "Simulating" : "Run simulation"}
      </button>
    </section>
  );
}

const RangeText = ({ range, format }: { range: Range; format: (value: number) => string }) => (
  <span className="mono kpi-range">{format(range.p5)} to {format(range.p95)}</span>
);

function Kpi({ label, range, format, compareTo }: { label: string; range: Range; format: (value: number) => string; compareTo?: Range }) {
  return (
    <div className="kpi">
      <dt className="label">{label}</dt>
      <dd>
        <span className="kpi-value wide">{format(range.mean)}</span>
        {compareTo ? <span className="mono kpi-was">was {format(compareTo.mean)}</span> : <RangeText range={range} format={format} />}
      </dd>
    </div>
  );
}

function Verdict({ comparison }: { comparison: Comparison }) {
  const { delta, isMeaningful, baseline } = comparison;
  const percent = (delta.mean / Math.max(baseline.throughputPerHour.mean, Number.EPSILON)) * 100;
  return (
    <p className="verdict" data-testid="verdict">
      <span className={`flag ${isMeaningful ? (delta.mean > 0 ? "flag-good" : "flag-crit") : ""}`}>{isMeaningful ? (delta.mean > 0 ? "Clear gain" : "Clear loss") : "Within noise"}</span>
      <span className="mono">{signed(percent, 1)}% throughput, paired range {signed(delta.p5)} to {signed(delta.p95)} plates/h</span>
    </p>
  );
}

function Utilisation({ result }: { result: MonteCarloResult }) {
  const run = result.representative;
  const byUse = [...run.resources].sort((a, b) => b.utilization - a.utilization);
  const limiter = byUse.filter((item) => item.id === run.bottleneckId);
  const ranked = [...new Set([...byUse.slice(0, 8), ...limiter])];
  return (
    <>
      <h3 className="group-head label">Processing time, representative run</h3>
      <ul className="util">
        {ranked.map((item) => (
          <li key={item.id} className={item.id === run.bottleneckId ? "is-limit" : ""}>
            <span className="mono">{item.id}</span>
            <span className="util-track"><i style={{ width: `${item.utilization * 100}%` }} /></span>
            <span className="mono">{Math.round(item.utilization * 100)}%</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Results() {
  const sim = useConsole((state) => state.sim);
  const current = sim.comparison?.scenario ?? sim.baseline;
  const baseline = sim.comparison?.baseline;
  const hasUnrun = sim.scenarios.length > 0 && sim.comparison === null;
  const perHour = (value: number) => value.toFixed(2);
  return (
    <section className="panel panel-right" aria-label="Simulation results">
      <h2 className="panel-title"><span>Result</span><span>{sim.comparison ? "vs baseline" : hasUnrun ? "Baseline, changes not run" : "Baseline"}</span></h2>
      <div className="panel-scroll">
        {sim.status === "error" ? <p className="notice" role="alert">{sim.error}</p> : null}
        {current === null || current === undefined ? <p className="empty">{sim.status === "running" ? "Simulating." : "Run a simulation to see results."}</p> : (
          <>
            <dl className="kpis" data-testid="kpis">
              <Kpi label="Plates per hour" range={current.throughputPerHour} format={perHour} compareTo={baseline?.throughputPerHour} />
              <Kpi label="Time to finish" range={current.makespanS} format={hours} compareTo={baseline?.makespanS} />
              <Kpi label="Mean cycle" range={current.meanCycleS} format={minutes} compareTo={baseline?.meanCycleS} />
            </dl>
            {sim.comparison ? <Verdict comparison={sim.comparison} /> : null}
            <div className="limit">
              <span className="label">Longest plate queue</span>
              <ul>
                {Object.entries(current.bottleneckShare).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, share]) => (
                  <li key={id} className="mono"><strong>{id}</strong> in {Math.round(share * 100)}% of runs</li>
                ))}
              </ul>
            </div>
            <Utilisation result={current} />
          </>
        )}
      </div>
    </section>
  );
}

function NotReady() {
  const skip = useConsole((state) => state.skipReplay);
  const source = useConsole((state) => state.source);
  return (
    <section className="panel panel-center">
      <h2 className="panel-title"><span>Twin not ready</span></h2>
      <p>Simulation needs a finished twin. Mapping is still running.</p>
      {source === "replay" ? <button className="btn btn-solid" onClick={skip}>Skip to twin</button> : null}
    </section>
  );
}

export function SimulateView() {
  const twin = useConsole((state) => state.agent.twin);
  const status = useConsole((state) => state.agent.status);
  const sim = useConsole((state) => state.sim);
  const run = sim.comparison?.scenario.representative ?? sim.baseline?.representative;

  useEffect(() => {
    const state = useConsole.getState();
    if (status === "done" && state.sim.baseline === null && state.sim.status === "idle") state.runSimulation();
  }, [status]);

  useEffect(() => {
    if (run !== undefined) usePlayback.getState().load(run.makespanS);
  }, [run]);

  if (status !== "done") return <NotReady />;
  return (
    <>
      <Setup twin={twin} />
      <Results />
      {run ? <Timeline twin={twin} result={run} /> : null}
    </>
  );
}
