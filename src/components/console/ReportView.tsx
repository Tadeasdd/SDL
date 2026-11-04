"use client";

import { useEffect, useState } from "react";
import { improvementPath, rankInterventions, type Intervention, type PathStep } from "@/core/sim/scenarios";
import { monteCarlo } from "@/core/sim/montecarlo";
import { signed } from "./format";
import { useConsole } from "./store";

const REPORT_RUNS = 16;

type Analysis = { baseline: number; bottleneck: string | null; ranked: Intervention[]; path: PathStep[] };

const download = (name: string, content: string): void => {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};

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

function RankTable({ ranked }: { ranked: Intervention[] }) {
  const top = Math.max(...ranked.map((item) => Math.abs(item.gainPct)), 1);
  return (
    <table className="rank">
      <caption className="sr-only">Candidate interventions ranked by simulated throughput gain</caption>
      <thead>
        <tr><th scope="col">Intervention</th><th scope="col">Gain</th><th scope="col">Paired range, plates/h</th><th scope="col">Verdict</th></tr>
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
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "done") return;
    const timer = setTimeout(() => {
      try {
        const base = monteCarlo(twin, config, REPORT_RUNS);
        const bottleneck = Object.entries(base.bottleneckShare).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        setAnalysis({
          baseline: base.throughputPerHour.mean,
          bottleneck,
          ranked: rankInterventions(twin, config, REPORT_RUNS),
          path: improvementPath(twin, config, REPORT_RUNS, 3),
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
        <button className="btn btn-solid" onClick={skip}>Skip to twin</button>
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
        <button className="btn" onClick={() => download(`${twin.id}.twin.json`, JSON.stringify(twin, null, 2))}>Export twin JSON</button>
      </header>
      {problem ? <p className="notice" role="alert">{problem}</p> : null}
      {analysis === null && problem === null ? <p className="empty">Simulating every candidate change.</p> : null}
      {analysis ? (
        <>
          <h3 className="report-sub label">01 / Where the constraint goes</h3>
          <Path analysis={analysis} />
          <h3 className="report-sub label">02 / Every candidate change</h3>
          <RankTable ranked={analysis.ranked} />
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
      <h3 className="report-sub label">04 / What this model assumes</h3>
      <ul className="assume">
        <li>Plates have unlimited staging space at hand-offs. Plates wait at the last hand-off until the next instrument is free.</li>
        <li>Step durations are normal, fitted from the run log. Failures are drawn from MTBF and repaired in place.</li>
        <li>Gains are for this demand mix and are ranges across {REPORT_RUNS} paired runs. They are not forecasts.</li>
        <li>Costs, labour and floor space are not modelled, so a higher rank is not automatically a better purchase.</li>
      </ul>
    </article>
  );
}
