import type { LabTwin } from "../twin/schema";
import { monteCarlo, range } from "./montecarlo";
import type { MonteCarloResult, Range, SimConfig } from "./types";

export type Patch =
  | { op: "set-state"; id: string; state: "online" | "degraded" | "offline" }
  | { op: "add-capacity"; id: string; by: number }
  | { op: "widen-door"; id: string; widthMm: number }
  | { op: "scale-transport-speed"; id: string; factor: number };

export type Scenario = { id: string; name: string; rationale: string; patches: Patch[] };

const applyPatch = (twin: LabTwin, patch: Patch): LabTwin => {
  switch (patch.op) {
    case "set-state":
      return {
        ...twin,
        instruments: twin.instruments.map((item) => (item.id === patch.id ? { ...item, state: patch.state } : item)),
      };
    case "add-capacity":
      return {
        ...twin,
        instruments: twin.instruments.map((item) =>
          item.id === patch.id ? { ...item, capacity: item.capacity + patch.by } : item,
        ),
        transports: twin.transports.map((item) =>
          item.id === patch.id ? { ...item, capacity: item.capacity + patch.by } : item,
        ),
      };
    case "widen-door":
      return {
        ...twin,
        doors: twin.doors.map((item) => (item.id === patch.id ? { ...item, widthMm: patch.widthMm } : item)),
      };
    case "scale-transport-speed":
      return {
        ...twin,
        transports: twin.transports.map((item) =>
          item.id === patch.id ? { ...item, speedMps: item.speedMps * patch.factor } : item,
        ),
      };
  }
};

export const applyPatches = (twin: LabTwin, patches: readonly Patch[]): LabTwin => patches.reduce(applyPatch, twin);

export type Comparison = {
  baseline: MonteCarloResult;
  scenario: MonteCarloResult;
  /** Paired per-seed throughput change, in plates per hour. */
  delta: Range;
  /** True when the 5th to 95th percentile of the paired change excludes zero. */
  isMeaningful: boolean;
};

export const compare = (baseline: MonteCarloResult, scenario: MonteCarloResult): Comparison => {
  const delta = range(scenario.samples.map((value, index) => value - (baseline.samples[index] ?? 0)));
  return { baseline, scenario, delta, isMeaningful: delta.p5 > 0 || delta.p95 < 0 };
};

export const runComparison = (twin: LabTwin, scenario: Scenario, config: SimConfig, runs: number): Comparison =>
  compare(monteCarlo(twin, config, runs), monteCarlo(applyPatches(twin, scenario.patches), config, runs));

export type Intervention = Scenario & { delta: Range; gainPct: number; isMeaningful: boolean };

const WIDE_DOOR_MM = 1200;
const EXPANDABLE = new Set(["plate-reader", "imager", "liquid-handler", "thermocycler", "dispenser", "centrifuge", "sealer", "peeler"]);

/** One candidate per thing the lab could plausibly change. */
export const candidateInterventions = (twin: LabTwin): Scenario[] => {
  const narrowest = Math.max(0, ...twin.transports.map((item) => item.minDoorMm ?? 0));
  const restore = twin.instruments
    .filter((item) => item.state !== "online")
    .map((item): Scenario => ({
      id: `restore-${item.id}`,
      name: `Return ${item.id} to service`,
      rationale: `${item.name} is ${item.state}.`,
      patches: [{ op: "set-state", id: item.id, state: "online" }],
    }));
  const expand = twin.instruments
    .filter((item) => item.state !== "offline" && EXPANDABLE.has(item.category))
    .map((item): Scenario => ({
      id: `expand-${item.id}`,
      name: `Add a second ${item.name}`,
      rationale: `Doubles ${item.capabilities.join(", ")} capacity at ${item.id}.`,
      patches: [{ op: "add-capacity", id: item.id, by: 1 }],
    }));
  const widen = twin.doors
    .filter((item) => item.widthMm < narrowest)
    .map((item): Scenario => ({
      id: `widen-${item.id}`,
      name: `Widen door ${item.id}`,
      rationale: `${item.widthMm} mm blocks mobile transport.`,
      patches: [{ op: "widen-door", id: item.id, widthMm: WIDE_DOOR_MM }],
    }));
  return [...restore, ...expand, ...widen];
};

/** Ranks every candidate by its paired throughput gain over the baseline. */
export const rankInterventions = (twin: LabTwin, config: SimConfig, runs: number): Intervention[] => {
  const baseline = monteCarlo(twin, config, runs);
  const ranked = candidateInterventions(twin).map((scenario): Intervention => {
    const result = compare(baseline, monteCarlo(applyPatches(twin, scenario.patches), config, runs));
    const gainPct = (result.delta.mean / Math.max(baseline.throughputPerHour.mean, Number.EPSILON)) * 100;
    return { ...scenario, delta: result.delta, gainPct, isMeaningful: result.isMeaningful };
  });
  return [...ranked].sort((a, b) => b.delta.mean - a.delta.mean);
};
