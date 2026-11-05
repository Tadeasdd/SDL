"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { assaySummary } from "@/core/sim/assay";
import { monteCarlo } from "@/core/sim/montecarlo";
import { searchPlans, type Plan, type SearchResult } from "@/core/sim/optimise";
import type { SavedRun } from "@/core/sim/saved";
import { DEFAULT_SCHEDULE, RULES, SHIFTS } from "@/core/sim/schedules";
import { validateAgainstLog, type ValidationReport } from "@/core/sim/validation";
import { SvgChart } from "./charts/Svg";
import { euros, hours, minutes, signed, years } from "./format";
import { useConsole } from "./store";

const COMPARE_RUNS = 12;
const EVALS_PER_SLICE = 2;
const SERIES = ["#7aa31f", "#5a90ea", "#c9812b", "#b06ad6"];
const CHART_LINES = SERIES.length;

const nextTick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

const changesOf = (plan: Plan): string => {
  if (plan.scenarios.length === 0) return "No changes";
  const counts = new Map<string, number>();
  for (const { name } of plan.scenarios) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name)).join(", ");
};

function Frontier({ result }: { result: SearchResult }) {
  const points = result.frontier;
  const xMax = Math.max(...points.map((plan) => plan.cost.capex / 1000), 1);
  const yMax = Math.max(...points.map((plan) => plan.throughput.p95), 1);
  return (
    <SvgChart width={560} height={230} xMax={xMax} yMax={yMax} xLabel="One-off cost (EUR thousand)" yLabel="Plates per hour" title="Cheapest plan found at each throughput">
      {({ x, y, left, right }) => (
        <>
          {points.map((plan) => <line key={`r${plan.cost.capex}`} className="marker-line" x1={x(plan.cost.capex / 1000)} x2={x(plan.cost.capex / 1000)} y1={y(plan.throughput.p5)} y2={y(plan.throughput.p95)} />)}
          <polyline className="series-line" points={points.map((plan) => `${x(plan.cost.capex / 1000)},${y(plan.throughput.mean)}`).join(" ")} />
          {points.map((plan) => <circle key={plan.cost.capex} className={plan === result.best ? "series-dot is-best" : "series-dot"} cx={x(plan.cost.capex / 1000)} cy={y(plan.throughput.mean)} r={4}><title>{`${changesOf(plan)}: ${plan.throughput.mean.toFixed(2)} plates/h, ${euros(plan.cost.capex)}`}</title></circle>)}
          {result.best ? null : <line className="grid" x1={left} x2={right} y1={0} y2={0} />}
        </>
      )}
    </SvgChart>
  );
}

function Optimiser() {
  const twin = useConsole((state) => state.agent.twin);
  const config = useConsole((state) => state.sim.config);
  const assumptions = useConsole((state) => state.assumptions);
  const applyScenarios = useConsole((state) => state.applyScenarios);
  const [target, setTarget] = useState(9);
  const [budget, setBudget] = useState("");
  const [maxChanges, setMaxChanges] = useState(4);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const job = useRef(0);

  useEffect(() => () => { job.current += 1; }, []);

  const run = async (): Promise<void> => {
    job.current += 1;
    const mine = job.current;
    setResult(null);
    setProblem(null);
    setProgress(0);
    try {
      const search = searchPlans(twin, config, { targetPerHour: target, budget: budget === "" ? null : Number(budget), maxChanges }, assumptions);
      for (let step = search.next(), slice = 0; ; step = search.next(), slice += 1) {
        if (job.current !== mine) return;
        if (step.done === true) {
          setResult(step.value);
          break;
        }
        setProgress(step.value.evaluated);
        if (slice % EVALS_PER_SLICE === 0) await nextTick();
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The search failed.");
    }
    setProgress(null);
  };

  const best = result?.best;
  return (
    <>
      <p className="report-lead">Set a goal. SDL tries combinations of changes, simulates each one, and returns the cheapest that meets it in about 95% of runs.</p>
      <div className="fields fields-row">
        <label className="field"><span>Target plates per hour</span><input type="number" min={1} step={0.5} value={target} onChange={(event) => setTarget(Number(event.target.value))} /></label>
        <label className="field"><span>Budget, EUR (optional)</span><input type="number" min={0} step={10000} value={budget} placeholder="No limit" onChange={(event) => setBudget(event.target.value)} /></label>
        <label className="field"><span>Most changes</span><input type="number" min={1} max={6} value={maxChanges} onChange={(event) => setMaxChanges(Number(event.target.value))} /></label>
        <button className="btn btn-solid" disabled={progress !== null} onClick={() => void run()}>{progress === null ? "Find the cheapest plan" : `Simulated ${progress} plans`}</button>
      </div>
      {problem ? <p className="notice" role="alert">{problem}</p> : null}
      {result ? (
        <div data-testid="optimiser-result">
          {best ? (
            <div className="plan-card">
              <span className="label">Cheapest plan that reaches {target} plates/h</span>
              <strong>{changesOf(best)}</strong>
              <span className="mono">{best.throughput.mean.toFixed(2)} plates/h ({best.throughput.p5.toFixed(2)} to {best.throughput.p95.toFixed(2)}) · {euros(best.cost.capex)} one-off · {euros(best.cost.annual)} a year · {best.paybackYears === null ? "does not pay back" : `pays back in ${years(best.paybackYears)}`} · then limited by {best.bottleneckId}</span>
              <button className="btn" onClick={() => applyScenarios(best.scenarios)}>Open in Simulate</button>
            </div>
          ) : (
            <p className="notice" role="status">
              No plan reached {target} plates/h within these limits. {target >= result.demandCeiling ? `The demand settings only release ${result.demandCeiling.toFixed(1)} plates/h, so raise demand first.` : "The best plans found are below."}
            </p>
          )}
          <p className="chart-note mono">Simulated {result.evaluated} plans. Prices are planning estimates. This is a search, not a proof: a better plan may exist.</p>
          <div className="report-split">
            <Frontier result={result} />
            <div className="table-wrap table-scroll table-tall"><table className="rank">
              <caption className="sr-only">Cheapest plan found at each throughput</caption>
              <thead><tr><th scope="col">Plan</th><th scope="col">Plates/h</th><th scope="col">Cost</th><th scope="col">Payback</th></tr></thead>
              <tbody>
                {result.frontier.map((plan) => (
                  <tr key={changesOf(plan)}>
                    <th scope="row">{changesOf(plan)}</th>
                    <td className="mono">{plan.throughput.mean.toFixed(2)}</td>
                    <td className="mono">{euros(plan.cost.capex)}</td>
                    <td className="mono">{plan.scenarios.length === 0 ? "-" : plan.paybackYears === null ? "Never" : years(plan.paybackYears)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </div>
      ) : null}
    </>
  );
}

type ScheduleRow = { key: string; shift: string; rule: string; rate: number; finishS: number; cycleS: number; passShare: number | null };

function ScheduleCompare() {
  const twin = useConsole((state) => state.agent.twin);
  const config = useConsole((state) => state.sim.config);
  const [rows, setRows] = useState<ScheduleRow[] | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const lastRelease = Math.max(0, ...config.demands.map(({ plates, intervalS }) => Math.max(0, plates - 1) * intervalS));

  const run = async (): Promise<void> => {
    setIsBusy(true);
    const next: ScheduleRow[] = [];
    for (const shift of SHIFTS) {
      for (const rule of RULES) {
        await nextTick();
        const schedule = { ...DEFAULT_SCHEDULE, attendedHours: shift.attendedHours, stopsUnattended: shift.stopsUnattended, dispatch: rule.id };
        const result = monteCarlo(twin, { ...config, schedule }, COMPARE_RUNS);
        next.push({
          key: `${shift.id}-${rule.id}`,
          shift: shift.label,
          rule: rule.label,
          rate: result.throughputPerHour.mean,
          finishS: result.makespanS.mean,
          cycleS: result.meanCycleS.mean,
          passShare: assaySummary(twin, result.representative, config.seed)?.passShare ?? null,
        });
      }
    }
    setRows([...next].sort((a, b) => a.finishS - b.finishS));
    setIsBusy(false);
  };

  return (
    <>
      <p className="report-lead">The same demand under each staffing pattern and queueing rule, fastest first. Plates are only loaded in staffed hours.</p>
      <button className="btn" disabled={isBusy} onClick={() => void run()}>{isBusy ? "Comparing" : "Compare schedules"}</button>
      {rows ? <p className="chart-note mono">All plates are loaded by {hours(lastRelease)}, so a shift only changes the result if it ends before then or the lab stops.</p> : null}
      {rows ? (
        <table className="rank" data-testid="schedule-table">
          <caption className="sr-only">Schedules compared</caption>
          <thead><tr><th scope="col">Staffing</th><th scope="col">Queue rule</th><th scope="col">Finish</th><th scope="col">Mean cycle</th><th scope="col">Assay pass (simulated)</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.shift}</th>
                <td>{row.rule}</td>
                <td className="mono">{hours(row.finishS)}</td>
                <td className="mono">{minutes(row.cycleS)}</td>
                <td className="mono">{row.passShare === null ? "-" : `${Math.round(row.passShare * 100)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}

function SavedCurves({ runs }: { runs: SavedRun[] }) {
  const shown = runs.slice(0, CHART_LINES);
  const xMax = Math.max(...shown.flatMap((run) => run.curve.map(([t]) => t / 3600)), 1);
  const yMax = Math.max(...shown.flatMap((run) => run.curve.map(([, count]) => count)), 1);
  return (
    <>
      <ul className="chart-legend mono">
        {shown.map((run, index) => <li key={run.id}><i className="key-line" style={{ background: SERIES[index] }} />{run.name}</li>)}
      </ul>
      <SvgChart width={720} height={240} xMax={xMax} yMax={yMax} xLabel="Simulated time (h)" yLabel="Plates finished" title="Plates finished over time for each saved run">
        {({ x, y }) => shown.map((run, index) => (
          <polyline key={run.id} className="series-line" style={{ stroke: SERIES[index] }} points={run.curve.map(([t, count]) => `${x(t / 3600)},${y(count)}`).join(" ")} />
        ))}
      </SvgChart>
    </>
  );
}

function SavedCompare() {
  const twinId = useConsole((state) => state.agent.twin.id);
  const all = useConsole((state) => state.saved);
  const remove = useConsole((state) => state.deleteSaved);
  const runs = useMemo(() => all.filter((item) => item.twinId === twinId), [all, twinId]);
  if (runs.length === 0) return <p className="report-lead">Nothing saved yet. Use Save run in the Simulate view, then compare runs here.</p>;
  const base = runs.at(-1) as SavedRun;
  return (
    <div data-testid="saved-compare">
      <SavedCurves runs={runs} />
      <div className="table-wrap">
        <table className="rank">
          <caption className="sr-only">Saved runs side by side</caption>
          <thead><tr><th scope="col">Run</th><th scope="col">Plates/h</th><th scope="col">Vs {base.name}</th><th scope="col">Finish</th><th scope="col">Cost</th><th scope="col">Payback</th><th scope="col">Assay pass</th><th scope="col">Limited by</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <th scope="row">{run.name}<span className="row-note">{run.changes.join(", ") || "No changes"}. {run.scheduleLabel}</span></th>
                <td className="mono">{run.throughput.mean.toFixed(2)}</td>
                <td className="mono">{signed(((run.throughput.mean - base.throughput.mean) / base.throughput.mean) * 100, 1)}%</td>
                <td className="mono">{hours(run.makespanS)}</td>
                <td className="mono">{euros(run.capex)}</td>
                <td className="mono">{run.paybackYears === null ? "-" : years(run.paybackYears)}</td>
                <td className="mono">{run.assayPassShare === null ? "-" : `${Math.round(run.assayPassShare * 100)}%`}</td>
                <td className="mono">{run.bottleneckId ?? "-"}</td>
                <td><button className="btn btn-small" aria-label={`Remove ${run.name}`} onClick={() => remove(run.id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const SECONDS_PER_MINUTE = 60;

function PredictedVsObserved({ report }: { report: ValidationReport }) {
  const points = report.steps.map((item) => ({ step: item.step, x: item.observedS / SECONDS_PER_MINUTE, y: item.predictedS / SECONDS_PER_MINUTE }));
  const top = Math.max(...points.flatMap((item) => [item.x, item.y]), 1);
  return (
    <SvgChart width={360} height={280} xMax={top} yMax={top} xLabel="Observed in held-out runs (min)" yLabel="Predicted by the twin (min)" title="Predicted against observed step duration">
      {({ x, y }) => (
        <>
          <line className="marker-line" x1={x(0)} y1={y(0)} x2={x(top)} y2={y(top)} />
          {points.map((item) => <circle key={item.step} className="series-dot" cx={x(item.x)} cy={y(item.y)} r={4}><title>{`${item.step}: predicted ${item.y.toFixed(1)} min, observed ${item.x.toFixed(1)} min`}</title></circle>)}
        </>
      )}
    </SvgChart>
  );
}

export function Validation() {
  const twin = useConsole((state) => state.agent.twin);
  const docs = useConsole((state) => state.docs);
  const isExample = useConsole((state) => state.source === "replay");
  const log = docs.find((doc) => doc.kind === "log");
  const outcome = useMemo((): ValidationReport | string => {
    if (log === undefined) return "This lab has no run log to validate against.";
    try {
      return validateAgainstLog(twin, log.content);
    } catch (error) {
      return error instanceof Error ? error.message : "Validation failed.";
    }
  }, [twin, log]);
  if (typeof outcome === "string") return <p className="notice" role="status">{outcome}</p>;
  const worst = [...outcome.steps].sort((a, b) => Math.abs(b.errorPct) - Math.abs(a.errorPct));
  return (
    <div data-testid="validation">
      <p className="report-lead">The twin is re-fitted on the first {outcome.trainRuns} runs of the log and scored on {outcome.testRuns} later runs it has never seen.</p>
      <dl className="stat-row stat-row-wide">
        <div><dt className="label">Mean step error</dt><dd>{outcome.meanErrorPct.toFixed(1)}%</dd></div>
        <div><dt className="label">Inside predicted 90% range</dt><dd>{Math.round(outcome.coverage * 100)}%</dd></div>
        {outcome.cycles.map((item) => (
          <div key={item.workflowId}><dt className="label">{twin.workflows.find(({ id }) => id === item.workflowId)?.name ?? item.workflowId}, whole plate</dt><dd>{signed(item.errorPct, 1)}%</dd></div>
        ))}
      </dl>
      <div className="report-split">
        <PredictedVsObserved report={outcome} />
        <div className="table-wrap table-scroll table-tall">
          <table className="rank">
            <caption className="sr-only">Prediction error by step, worst first</caption>
            <thead><tr><th scope="col">Step</th><th scope="col">Predicted</th><th scope="col">Observed</th><th scope="col">Error</th><th scope="col">In range</th></tr></thead>
            <tbody>
              {worst.map((item) => (
                <tr key={item.step}>
                  <th scope="row">{item.step}</th>
                  <td className="mono">{item.predictedS.toFixed(0)} s</td>
                  <td className="mono">{item.observedS.toFixed(0)} s</td>
                  <td className="mono">{signed(item.errorPct, 1)}%</td>
                  <td className="mono">{Math.round(item.coverage * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="chart-note mono">The whole-plate figures compare a simulated lone plate with held-out plates, so they also test routing and transfer times. Queueing under load is not tested: the log&apos;s plates did not compete.</p>
      {isExample ? <p className="sim-flag mono">This example&apos;s run log is generated by a script, so a good score here shows the method working, not a real lab being predicted.</p> : null}
    </div>
  );
}

export function DecideView() {
  const status = useConsole((state) => state.agent.status);
  const skip = useConsole((state) => state.skipReplay);
  const source = useConsole((state) => state.source);
  if (status !== "done") {
    return (
      <section className="panel panel-center">
        <h2 className="panel-title"><span>Twin not ready</span></h2>
        <p>Planning needs a finished twin.</p>
        {source === "replay" ? <button className="btn btn-solid" onClick={skip}>Skip to twin</button> : null}
      </section>
    );
  }
  return (
    <article className="report" data-testid="decide">
      <header className="report-head"><div><p className="label">Decide</p><h2 className="wide">What to change, and whether to trust it</h2></div></header>
      <h3 className="report-sub label">01 / Find the cheapest plan</h3>
      <Optimiser />
      <h3 className="report-sub label">02 / Compare schedules</h3>
      <ScheduleCompare />
      <h3 className="report-sub label">03 / Saved runs side by side</h3>
      <SavedCompare />
      <h3 className="report-sub label">04 / How far to trust the twin</h3>
      <Validation />
    </article>
  );
}
