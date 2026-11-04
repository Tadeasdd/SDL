"use client";

import { create } from "zustand";
import type { EvidenceDoc } from "@/core/agent/evidence";
import type { AgentEvent } from "@/core/agent/events";
import { EXAMPLE_LAB, replayEvents } from "@/core/agent/replay";
import { EXAMPLE_CONFIG, MONTE_CARLO_RUNS } from "@/core/example-config";
import { monteCarlo } from "@/core/sim/montecarlo";
import { applyPatches, compare, type Comparison, type Scenario } from "@/core/sim/scenarios";
import type { MonteCarloResult, SimConfig } from "@/core/sim/types";
import type { LabTwin } from "@/core/twin/schema";
import { initialAgentView, reduceAgent, type AgentView } from "./agent-state";

export type View = "map" | "twin" | "simulate" | "report";
export type Layers = { cloud: boolean; routes: boolean; labels: boolean };
export type EvidenceFocus = { docId: string; quote?: string };

type SimState = {
  config: SimConfig;
  scenarios: Scenario[];
  status: "idle" | "running" | "ready" | "error";
  error: string | null;
  baseline: MonteCarloResult | null;
  comparison: Comparison | null;
};

type ConsoleState = {
  view: View;
  source: "replay" | "live";
  docs: EvidenceDoc[];
  exampleDocs: EvidenceDoc[];
  agent: AgentView;
  queue: AgentEvent[];
  speed: 1 | 4;
  selectedId: string | null;
  focus: EvidenceFocus | null;
  layers: Layers;
  sim: SimState;
  setView: (view: View) => void;
  init: (docs: EvidenceDoc[]) => void;
  startReplay: () => void;
  skipReplay: () => void;
  advance: () => AgentEvent | null;
  setSpeed: (speed: 1 | 4) => void;
  beginLive: (docs: EvidenceDoc[]) => void;
  receive: (event: AgentEvent) => void;
  select: (id: string | null) => void;
  openEvidence: (focus: EvidenceFocus | null) => void;
  toggleLayer: (layer: keyof Layers) => void;
  setConfig: (config: SimConfig) => void;
  toggleScenario: (scenario: Scenario) => void;
  runSimulation: () => void;
};

const initialSim = (): SimState => ({
  config: EXAMPLE_CONFIG,
  scenarios: [],
  status: "idle",
  error: null,
  baseline: null,
  comparison: null,
});

/** Defaults for a twin that is not the example lab: run every workflow at a modest rate. */
const configFor = (twin: LabTwin): SimConfig =>
  twin.id === EXAMPLE_LAB.id
    ? EXAMPLE_CONFIG
    : { ...EXAMPLE_CONFIG, demands: twin.workflows.map((workflow) => ({ workflowId: workflow.id, plates: 24, intervalS: 600 })) };

const blank = () => initialAgentView(EXAMPLE_LAB.id, EXAMPLE_LAB.name);

export const useConsole = create<ConsoleState>((set, get) => ({
  view: "map",
  source: "replay",
  docs: [],
  exampleDocs: [],
  agent: blank(),
  queue: [],
  speed: 1,
  selectedId: null,
  focus: null,
  layers: { cloud: true, routes: true, labels: true },
  sim: initialSim(),

  setView: (view) => set({ view }),
  init: (docs) => set({ docs, exampleDocs: docs }),

  startReplay: () =>
    set((state) => ({
      source: "replay",
      docs: state.exampleDocs,
      queue: replayEvents(state.exampleDocs),
      agent: { ...blank(), status: "running" },
      sim: initialSim(),
      selectedId: null,
    })),

  skipReplay: () =>
    set((state) => ({
      queue: [],
      agent: state.queue.reduce(reduceAgent, state.agent),
      sim: { ...initialSim(), config: configFor(state.queue.reduce(reduceAgent, state.agent).twin) },
    })),

  advance: () => {
    const [next, ...rest] = get().queue;
    if (next === undefined) return null;
    set((state) => ({ queue: rest, agent: reduceAgent(state.agent, next) }));
    return next;
  },

  setSpeed: (speed) => set({ speed }),

  beginLive: (docs) =>
    set({
      source: "live",
      docs,
      queue: [],
      agent: { ...initialAgentView("live-lab", "Live mapping"), status: "running" },
      sim: initialSim(),
      selectedId: null,
      view: "map",
    }),

  receive: (event) =>
    set((state) => {
      const agent = reduceAgent(state.agent, event);
      return event.type === "done" ? { agent, sim: { ...initialSim(), config: configFor(agent.twin) } } : { agent };
    }),

  select: (selectedId) => set({ selectedId }),
  openEvidence: (focus) => set({ focus }),
  toggleLayer: (layer) => set((state) => ({ layers: { ...state.layers, [layer]: !state.layers[layer] } })),
  setConfig: (config) => set((state) => ({ sim: { ...state.sim, config, baseline: null, comparison: null, status: "idle" } })),

  toggleScenario: (scenario) =>
    set((state) => {
      const active = state.sim.scenarios.some((item) => item.id === scenario.id);
      const scenarios = active ? state.sim.scenarios.filter((item) => item.id !== scenario.id) : [...state.sim.scenarios, scenario];
      return { sim: { ...state.sim, scenarios, comparison: null, status: state.sim.baseline ? "idle" : state.sim.status } };
    }),

  runSimulation: () => {
    set((state) => ({ sim: { ...state.sim, status: "running", error: null } }));
    // Yield first so the "running" state paints before the synchronous Monte Carlo batch.
    setTimeout(() => {
      const { agent, sim } = get();
      try {
        const baseline = sim.baseline ?? monteCarlo(agent.twin, sim.config, MONTE_CARLO_RUNS);
        const patches = sim.scenarios.flatMap((scenario) => scenario.patches);
        const comparison =
          patches.length === 0
            ? null
            : compare(baseline, monteCarlo(applyPatches(agent.twin, patches), sim.config, MONTE_CARLO_RUNS));
        set((state) => ({ sim: { ...state.sim, status: "ready", baseline, comparison } }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Simulation failed.";
        set((state) => ({ sim: { ...state.sim, status: "error", error: message } }));
      }
    }, 30);
  },
}));

