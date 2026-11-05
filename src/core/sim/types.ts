import type { Point } from "../twin/routing";

export type Demand = { workflowId: string; plates: number; intervalS: number };

export type SimConfig = {
  demands: Demand[];
  seed: number;
  /** Plates allowed on the floor at once. Further releases wait. */
  maxWip: number;
  failures: boolean;
};

export type Segment = {
  plateId: number;
  workflowId: string;
  kind: "process" | "move" | "wait";
  resourceId: string;
  stepId: string;
  start: number;
  end: number;
  path?: Point[];
  failed?: boolean;
};

export type ResourceStat = {
  id: string;
  kind: "instrument" | "transport";
  /** Busy share of available capacity across the whole run, 0 to 1. */
  utilization: number;
  /** Total plate-seconds spent queueing for this resource. */
  waitS: number;
  jobs: number;
  failures: number;
};

export type SimResult = {
  completed: number;
  makespanS: number;
  throughputPerHour: number;
  meanCycleS: number;
  p95CycleS: number;
  resources: ResourceStat[];
  bottleneckId: string | null;
  failures: number;
  segments: Segment[];
};

export type Range = { mean: number; p5: number; p95: number };

export type MonteCarloResult = {
  runs: number;
  throughputPerHour: Range;
  makespanS: Range;
  meanCycleS: Range;
  /** How often each resource was the bottleneck across runs, 0 to 1. */
  bottleneckShare: Record<string, number>;
  /** The run closest to the mean throughput. Used for playback. */
  representative: SimResult;
  samples: number[];
  /** Plates finished over time, 5th to 95th percentile across runs. */
  completionBand: { t: number[]; p5: number[]; p95: number[] };
};
