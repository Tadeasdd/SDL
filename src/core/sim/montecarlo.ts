import type { LabTwin } from "../twin/schema";
import { simulate } from "./engine";
import type { MonteCarloResult, Range, SimConfig, SimResult } from "./types";

export const range = (values: readonly number[]): Range => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (share: number): number => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length);
  return { mean, p5: at(0.05), p95: at(0.95) };
};

const closestTo = (runs: readonly SimResult[], target: number): SimResult => {
  const ranked = [...runs].sort(
    (a, b) => Math.abs(a.throughputPerHour - target) - Math.abs(b.throughputPerHour - target),
  );
  return ranked[0] as SimResult;
};

const bottleneckShare = (runs: readonly SimResult[]): Record<string, number> => {
  const ids = runs.flatMap((run) => (run.bottleneckId === null ? [] : [run.bottleneckId]));
  return Object.fromEntries(
    [...new Set(ids)].map((id) => [id, ids.filter((candidate) => candidate === id).length / runs.length]),
  );
};

/** Seeds are `config.seed + i`, so two configurations compared here share random numbers run for run. */
export const monteCarlo = (twin: LabTwin, config: SimConfig, runs: number): MonteCarloResult => {
  const results = Array.from({ length: runs }, (_, index) => simulate(twin, { ...config, seed: config.seed + index }));
  const throughput = range(results.map((run) => run.throughputPerHour));
  return {
    runs,
    throughputPerHour: throughput,
    makespanS: range(results.map((run) => run.makespanS)),
    meanCycleS: range(results.map((run) => run.meanCycleS)),
    bottleneckShare: bottleneckShare(results),
    representative: closestTo(results, throughput.mean),
    samples: results.map((run) => run.throughputPerHour),
  };
};
