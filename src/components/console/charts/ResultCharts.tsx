"use client";

import { useMemo } from "react";
import type { MonteCarloResult } from "@/core/sim/types";
import type { LabTwin } from "@/core/twin/schema";
import { LiveChart } from "./LiveChart";
import { colorOf, completionChart, cycleChart, queueChart } from "./model";
import { INK } from "./plot";

const HERO_HEIGHT = 176;
const CHART_HEIGHT = 128;

function CompletionLegend({ runs, hasBaseline }: { runs: number; hasBaseline: boolean }) {
  return (
    <ul className="chart-legend mono">
      <li><i className="key-line" style={{ background: INK.accent }} />{hasBaseline ? "With changes" : "This run"}</li>
      <li><i className="key-band" style={{ background: INK.band }} />5 to 95% of {runs} runs</li>
      {hasBaseline ? <li><i className="key-line" style={{ background: INK.ghost }} />Baseline</li> : null}
    </ul>
  );
}

function WorkflowLegend({ twin }: { twin: LabTwin }) {
  const [first, ...others] = twin.workflows;
  const primaryId = first?.id;
  const rest = others.length === 1 ? others[0]?.name : "Other workflows";
  return (
    <ul className="chart-legend mono">
      {first ? <li><i className="key-dot" style={{ background: colorOf(first.id, primaryId) }} />{first.name}</li> : null}
      {others.length > 0 ? <li><i className="key-dot" style={{ background: INK.series[1] }} />{rest}</li> : null}
    </ul>
  );
}

export function ResultCharts({ twin, current, baseline }: { twin: LabTwin; current: MonteCarloResult; baseline?: MonteCarloResult }) {
  const completion = useMemo(() => completionChart(current, baseline), [current, baseline]);
  const queue = useMemo(() => queueChart(current, completion.xMaxS), [current, completion.xMaxS]);
  const cycle = useMemo(() => cycleChart(current, twin, completion.xMaxS), [current, twin, completion.xMaxS]);
  return (
    <div className="charts">
      <LiveChart title="Plates finished" testId="chart-completion" height={HERO_HEIGHT} spec={completion} legend={<CompletionLegend runs={current.runs} hasBaseline={baseline !== undefined} />} />
      {queue ? <LiveChart title={`Queue at ${queue.resourceId}`} testId="chart-queue" height={CHART_HEIGHT} spec={queue.spec} /> : null}
      <LiveChart title="Cycle time per plate" testId="chart-cycle" height={CHART_HEIGHT} spec={cycle} legend={<WorkflowLegend twin={twin} />} />
    </div>
  );
}
