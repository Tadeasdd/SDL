import { completionSteps, indexAt, plateRecords, queueSteps, valueAt, type PlateRecord } from "@/core/sim/series";
import type { MonteCarloResult } from "@/core/sim/types";
import type { LabTwin } from "@/core/twin/schema";
import { clock, minutes } from "../format";
import { usePlayback } from "../playback";
import type { ChartSpec } from "./LiveChart";
import { dot, drawBand, INK, strokeSteps, washSteps } from "./plot";

const SECONDS_PER_MINUTE = 60;
const DOT_RADIUS = 4;
const HEAD_RADIUS = 4.5;
/** A new dot grows in over this much real time, whatever the playback rate. */
const POP_S = 0.22;
const MIN_QUEUE_AXIS = 4;

export const colorOf = (workflowId: string, primaryId: string | undefined): string =>
  INK.series[workflowId === primaryId ? 0 : 1];

const bandIndex = (t: readonly number[], at: number): number => indexAt({ t }, at);

export const completionChart = (current: MonteCarloResult, baseline?: MonteCarloResult): ChartSpec => {
  const run = current.representative;
  const steps = completionSteps(plateRecords(run));
  const ghost = baseline ? completionSteps(plateRecords(baseline.representative)) : null;
  const band = current.completionBand;
  const total = run.completed;
  const xMaxS = Math.max(band.t.at(-1) ?? 0, baseline?.completionBand.t.at(-1) ?? 0, 1);
  return {
    xMaxS,
    yMax: total,
    yLabel: "Plates finished",
    isWhole: true,
    drawBase: (context, plot) => {
      drawBand(context, plot, band);
      if (ghost !== null) strokeSteps(context, plot, ghost, ghost.t.at(-1) ?? 0, ghost.v.at(-1) ?? 0, INK.ghost, 1.5);
    },
    drawLive: (context, plot, t, head) => {
      const end = Math.min(t, run.makespanS);
      washSteps(context, plot, steps, end, head);
      strokeSteps(context, plot, steps, end, head, INK.accent);
      dot(context, plot.x(end), plot.y(head), HEAD_RADIUS, INK.accent);
    },
    targetAt: (t) => valueAt(steps, t),
    readout: (t) => `${valueAt(steps, t)} of ${total}`,
    tipAt: (t) => {
      const index = bandIndex(band.t, t);
      return [
        `${valueAt(steps, t)} plates finished`,
        clock(t),
        `Runs: ${band.p5[index] ?? 0} to ${band.p95[index] ?? 0}`,
        ...(ghost === null ? [] : [`Baseline: ${valueAt(ghost, t)}`]),
      ];
    },
    summary: `Plates finished over time. ${total} plates finish in the representative run. Exact values are in the Tables tab.`,
  };
};

export const queueChart = (current: MonteCarloResult, xMaxS: number): { spec: ChartSpec; resourceId: string } | null => {
  const run = current.representative;
  const resourceId = run.bottleneckId;
  if (resourceId === null) return null;
  const steps = queueSteps(run, resourceId);
  const peak = Math.max(...steps.v);
  return {
    resourceId,
    spec: {
      xMaxS,
      yMax: Math.max(peak, MIN_QUEUE_AXIS),
      yLabel: "Plates waiting",
      isWhole: true,
      drawLive: (context, plot, t, head) => {
        const end = Math.min(t, run.makespanS);
        washSteps(context, plot, steps, end, head);
        strokeSteps(context, plot, steps, end, head, INK.accent);
        dot(context, plot.x(end), plot.y(head), HEAD_RADIUS, INK.accent);
      },
      targetAt: (t) => valueAt(steps, t),
      readout: (t) => `${valueAt(steps, t)} now, peak ${peak}`,
      tipAt: (t) => [`${valueAt(steps, t)} waiting`, clock(t)],
      summary: `Plates queueing for ${resourceId} over time, peaking at ${peak}.`,
    },
  };
};

export const cycleChart = (current: MonteCarloResult, twin: LabTwin, xMaxS: number): ChartSpec => {
  const records = plateRecords(current.representative);
  const ends = records.map((item) => item.endS);
  const primaryId = twin.workflows[0]?.id;
  const nameOf = (id: string): string => twin.workflows.find((item) => item.id === id)?.name ?? id;
  const countBy = (t: number): number => (records.length === 0 || (ends[0] as number) > t ? 0 : indexAt({ t: ends }, t) + 1);
  const yMax = Math.max(...records.map((item) => item.cycleS / SECONDS_PER_MINUTE), 1);
  return {
    xMaxS,
    yMax,
    yLabel: "Cycle time (min)",
    isWhole: true,
    drawLive: (context, plot, t) => {
      const popS = usePlayback.getState().rate * POP_S;
      const count = countBy(t);
      for (let index = 0; index < count; index += 1) {
        const item = records[index] as PlateRecord;
        const grown = Math.min(1, (t - item.endS) / popS);
        dot(context, plot.x(item.endS), plot.y(item.cycleS / SECONDS_PER_MINUTE), DOT_RADIUS * grown, colorOf(item.workflowId, primaryId));
      }
    },
    targetAt: () => 0,
    readout: (t) => {
      const count = countBy(t);
      if (count === 0) return "No plates yet";
      const mean = records.slice(0, count).reduce((sum, item) => sum + item.cycleS, 0) / count;
      return `Mean so far ${minutes(mean)}`;
    },
    tipAt: (t) => {
      const count = countBy(t);
      const item = records[Math.max(0, count - 1)];
      if (count === 0 || item === undefined) return ["No plates finished yet", clock(t)];
      return [minutes(item.cycleS), `Plate ${item.plateId}, ${nameOf(item.workflowId)}`, `Finished ${clock(item.endS)}`];
    },
    summary: `Cycle time of each plate by finishing time, for ${records.length} plates. Exact values are in the Tables tab.`,
  };
};
