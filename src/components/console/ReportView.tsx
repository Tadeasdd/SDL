"use client";

import { useEffect, useState } from "react";
import { improvementPath, rankInterventions, type Intervention, type PathStep } from "@/core/sim/scenarios";
import { monteCarlo } from "@/core/sim/montecarlo";
import { assaySummary, UNSEALED_LIMIT_MIN, type AssaySummary } from "@/core/sim/assay";
import { costOf, paybackYears, type Assumptions } from "@/core/sim/economics";
import { scheduleLabel } from "@/core/sim/schedules";
import { encodeShare } from "@/core/share";
import type { LabTwin } from "@/core/twin/schema";
import { Validation } from "./DecideView";
import { euros, signed, years } from "./format";
import { saveFile } from "./download";
import { useConsole } from "./store";

const REPORT_RUNS = 16;

type Analysis = { baseline: number; bottleneck: string | null; ranked: Intervention[]; path: PathStep[]; assay: AssaySummary | null };

function Path({ analysis }: { analysis: Analysis }) {
  return (
    <ol className="path">
      <li>
        <span className="label">Today</span>
        <strong className="wide">{analysis.baseline.toFixed(2)}</strong>
        <span className="mono">plates/h</span>
        <span className="mono">Limited by {analysis.bottleneck}</span>
      </li>
      {analysis.path.map((step, index) => (
        <li key={step.intervention.id}>
          <span className="label">Step {index + 1}</span>
          <strong className="wide">{step.throughputPerHour.toFixed(2)}</strong>
          <span>{step.intervention.name}</span>
          <span className="mono">Then limited by {step.bottleneckId}</span>
        </li>
      ))}
    </ol>
  );
}

function CostCells({ item, twin, assumptions }: { item: Intervention; twin: LabTwin; assumptions: Assumptions }) {
  const cost = costOf(twin, [item]);
  const payback = item.isMeaningful ? paybackYears(cost, item.delta.mean, assumptions) : null;
  return (
    <>
      <td className="mono">{euros(cost.capex)}</td>
      <td className="mono">{payback === null ? "Never" : years(payback)}</td>
    </>
  );
}

function RankTable({ ranked, twin, assumptions }: { ranked: Intervention[]; twin: LabTwin; assumptions: Assumptions }) {
  const top = Math.max(...ranked.map((item) => Math.abs(item.gainPct)), 1);
  return (
    <table className="rank" data-testid="rank-table">
      <caption className="sr-only">Candidate interventions ranked by simulated throughput gain</caption>
      <thead>
        <tr><th scope="col">Intervention</th><th scope="col">Gain</th><th scope="col">Paired range, plates/h</th><th scope="col">Verdict</th><th scope="col">Cost</th><th scope="col">Payback</th></tr>
      </thead>
      <tbody>
        {ranked.map((item) => (
          <tr key={item.id}>
            <th scope="row">{item.name}</th>
            <td>
              <div className="rank-cell">
                <span className="rank-bar"><i style={{ width: `${(Math.max(item.gainPct, 0) / top) * 100}%` }} /></span>
                <span className="mono">{signed(item.gainPct, 1)}%</span>
              </div>
            </td>
            <td className="mono">{signed(item.delta.p5)} to {signed(item.delta.p95)}</td>
            <td><span className={`flag ${item.isMeaningful && item.delta.mean > 0 ? "flag-good" : ""}`}>{item.isMeaningful ? (item.delta.mean > 0 ? "Clear gain" : "Clear loss") : "Within noise"}</span></td>
            <CostCells item={item} twin={twin} assumptions={assumptions} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ReportView() {
  const twin = useConsole((state) => state.agent.twin);
  const status = useConsole((state) => state.agent.status);
  const config = useConsole((state) => state.sim.config);
  const skip = useConsole((state) => state.skipReplay);
  const source = useConsole((state) => state.source);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const assumptions = useConsole((state) => state.assumptions);
  const scenarios = useConsole((state) => state.sim.scenarios);
  const isEdited = useConsole((state) => state.layoutBase !== null);
  const [copied, setCopied] = useState(false);

  const copyLink = async (): Promise<void> => {
    const state = encodeShare({ config, scenarioIds: scenarios.map((item) => item.id) });
    await navigator.clipboard.writeText(`${window.location.origin}/console#report?s=${state}`);
    setCopied(true);
  };

  useEffect(() => {
    if (status !== "done") return;
    const timer = setTimeout(() => {
      setProblem(null);
      setAnalysis(null);
      try {
        const base = monteCarlo(twin, config, REPORT_RUNS);
        const bottleneck = Object.entries(base.bottleneckShare).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        setAnalysis({
          baseline: base.throughputPerHour.mean,
          bottleneck,
          ranked: rankInterventions(twin, config, REPORT_RUNS),
          path: improvementPath(twin, config, REPORT_RUNS, 3),
          assay: assaySummary(twin, base.representative, config.seed),
        });
      } catch (error) {
        setProblem(error instanceof Error ? error.message : "Analysis failed.");
      }
    }, 30);
    return () => clearTimeout(timer);
  }, [status, twin, config]);

  if (status !== "done") {
    return (
      <section className="panel panel-center">
        <h2 className="panel-title"><span>Twin not ready</span></h2>
        <p>The report needs a finished twin.</p>
        {source === "replay" ? <button className="btn btn-solid" onClick={skip}>Skip to twin</button> : null}
      </section>
    );
  }

  return (
    <article className="report" data-testid="report">
      <header className="report-head">
        <div>
          <p className="label">Readout</p>
          <h2 className="wide">{twin.name}</h2>
        </div>
        <div className="report-actions">
          <button className="btn" disabled={analysis === null} onClick={() => window.print()}>{analysis === null ? "Preparing" : "Save as PDF"}</button>
          <button className="btn" disabled={source !== "replay" || isEdited} title={source === "replay" ? (isEdited ? "A link can't carry layout edits." : undefined) : "A link rebuilds the example lab. A live lab is not stored."} onClick={() => void copyLink()}>{copied ? "Link copied" : "Copy link"}</button>
          <button className="btn" onClick={() => saveFile(`${twin.id}.twin.json`, JSON.stringify(twin, null, 2), "application/json")}>Export twin JSON</button>
        </div>
      </header>
      {problem ? <p className="notice" role="alert">{problem}</p> : null}
      {analysis === null && problem === null ? <p className="empty">Simulating every candidate change.</p> : null}
      {analysis ? (
        <>
          <h3 className="report-sub label">01 / Where the constraint goes</h3>
          <Path analysis={analysis} />
          <h3 className="report-sub label">02 / Every candidate change</h3>
          <RankTable ranked={analysis.ranked} twin={twin} assumptions={assumptions} />
        </>
      ) : null}
      <h3 className="report-sub label">03 / Findings for a human decision</h3>
      <ol className="ledger">
        {twin.findings.map((finding, index) => (
          <li key={finding.id}>
            <span className="mono">0{index + 1}</span>
            <strong>{finding.title}</strong>
            <span>{finding.resolution}</span>
          </li>
        ))}
      </ol>
      <h3 className="report-sub label">04 / Simulated assay quality</h3>
      {analysis === null ? <p className="empty">Simulating.</p> : null}
      {analysis?.assay ? (
        <>
          <dl className="stat-row stat-row-wide">
            <div><dt className="label">Pass Z′ 0.5</dt><dd>{Math.round(analysis.assay.passShare * 100)}%</dd></div>
            <div><dt className="label">Over {UNSEALED_LIMIT_MIN} min unsealed</dt><dd>{Math.round(analysis.assay.overLimitShare * 100)}%</dd></div>
            <div><dt className="label">Mean peel to read</dt><dd>{Math.round(analysis.assay.meanDelayMin)} min</dd></div>
          </dl>
          <p className="sim-flag mono">Simulated data. Waits come from the run; the assay readouts are generated.</p>
        </>
      ) : null}
      {analysis !== null && analysis.assay === null ? <p className="report-lead">No screening workflow to model.</p> : null}
      <h3 className="report-sub label">05 / How far to trust the twin</h3>
      <Validation />
      <h3 className="report-sub label">06 / What this model assumes</h3>
      <ul className="assume">
        <li>Plates have unlimited staging space at hand-offs. Plates wait at the last hand-off until the next instrument is free.</li>
        <li>Step durations are normal, fitted from the run log. Failures are drawn from MTBF and repaired in place.</li>
        <li>Gains are for this demand mix. Each change is run on the same {REPORT_RUNS} seeds as the baseline. &quot;Clear&quot; means the 5th to 95th percentile of those per-seed differences excludes zero, which at this run count is close to every run agreeing. These are not forecasts.</li>
        <li>Schedule: {scheduleLabel(config.schedule)}.</li>
        <li>Prices are round planning estimates, not quotes. Payback assumes EUR {assumptions.valuePerPlate} per extra plate over {assumptions.operatingHoursPerYear.toLocaleString("en-GB")} operating hours a year, and that demand exists for every extra plate. Floor space and installation are not modelled.</li>
        <li>Assay readouts are synthetic. The curves are standard, but how much signal is lost to waiting is an assumption, not a measurement.</li>
      </ul>
    </article>
  );
}
