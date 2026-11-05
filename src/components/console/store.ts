"use client";

import { create } from "zustand";
import type { EvidenceDoc } from "@/core/agent/evidence";
import type { AgentEvent } from "@/core/agent/events";
import { EXAMPLE_LAB, replayEvents } from "@/core/agent/replay";
import { EXAMPLE_CONFIG, MONTE_CARLO_RUNS } from "@/core/example-config";
import { decodeShare } from "@/core/share";
import { assaySummary } from "@/core/sim/assay";
import { costOf, DEFAULT_ASSUMPTIONS, paybackYears, type Assumptions } from "@/core/sim/economics";
import { curveOf, MAX_SAVED, parseSaved, type SavedRun } from "@/core/sim/saved";
import { scheduleLabel } from "@/core/sim/schedules";
import { moveInstrument } from "@/core/twin/layout-edit";
import { monteCarlo } from "@/core/sim/montecarlo";
import { applyPatches, candidateInterventions, compare, type Comparison, type Scenario } from "@/core/sim/scenarios";
import type { MonteCarloResult, SimConfig } from "@/core/sim/types";
import type { LabTwin } from "@/core/twin/schema";
import { initialAgentView, reduceAgent, type AgentView } from "./agent-state";

export type View = "map" | "twin" | "simulate" | "decide" | "report";
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
  assumptions: Assumptions;
  saved: SavedRun[];
  /** The layout as mapped. Set on the first edit, and restored by a reset. */
  layoutBase: LabTwin | null;
  isEditingLayout: boolean;
  setAssumptions: (assumptions: Assumptions) => void;
  loadSaved: () => void;
  saveRun: (name: string) => void;
  deleteSaved: (id: string) => void;
  applyScenarios: (scenarios: Scenario[]) => void;
  applyShare: (encoded: string) => boolean;
  setEditingLayout: (isEditing: boolean) => void;
  moveItem: (id: string, x: number, y: number) => void;
  resetLayout: () => void;
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

const SAVED_KEY = "sdl.saved-runs.v1";

/** Saved runs are a convenience. Private windows can refuse storage, and that must not break the console. */
const persist = (saved: readonly SavedRun[]): void => {
  try {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  } catch {
    // Nothing to do: the list still works for this session.
  }
};

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
  layers: { cloud: false, routes: true, labels: true },
  sim: initialSim(),
  assumptions: DEFAULT_ASSUMPTIONS,
  saved: [],
  layoutBase: null,
  isEditingLayout: false,

  setAssumptions: (assumptions) => set({ assumptions }),

  loadSaved: () => {
    try {
      set({ saved: parseSaved(window.localStorage.getItem(SAVED_KEY)) });
    } catch {
      set({ saved: [] });
    }
  },

  saveRun: (name) => {
    const { sim, agent, assumptions, saved } = get();
    const current = sim.comparison?.scenario ?? sim.baseline;
    if (current === null || current === undefined) return;
    const cost = costOf(agent.twin, sim.comparison ? sim.scenarios : []);
    const gain = sim.comparison?.delta.mean ?? 0;
    const twin = sim.comparison ? applyPatches(agent.twin, sim.scenarios.flatMap((item) => item.patches)) : agent.twin;
    const entry: SavedRun = {
      id: `run-${Date.now()}`,
      name,
      twinId: agent.twin.id,
      savedAt: new Date().toISOString(),
      changes: sim.comparison ? sim.scenarios.map((item) => item.name) : [],
      scheduleLabel: scheduleLabel(sim.config.schedule),
      throughput: current.throughputPerHour,
      makespanS: current.makespanS.mean,
      meanCycleS: current.meanCycleS.mean,
      bottleneckId: current.representative.bottleneckId,
      capex: cost.capex,
      paybackYears: sim.comparison ? paybackYears(cost, gain, assumptions) : null,
      assayPassShare: assaySummary(twin, current.representative, sim.config.seed)?.passShare ?? null,
      curve: curveOf(current),
    };
    persist([entry, ...saved].slice(0, MAX_SAVED));
    set({ saved: [entry, ...saved].slice(0, MAX_SAVED) });
  },

  deleteSaved: (id) => {
    const saved = get().saved.filter((item) => item.id !== id);
    persist(saved);
    set({ saved });
  },

  applyScenarios: (scenarios) => {
    set((state) => ({ sim: { ...state.sim, scenarios, comparison: null, status: "idle" }, view: "simulate" }));
    get().runSimulation();
  },

  applyShare: (encoded) => {
    const shared = decodeShare(encoded);
    if (shared === null) return false;
    const known = candidateInterventions(get().agent.twin);
    const scenarios = shared.scenarioIds.flatMap((id) => known.filter((item) => item.id === id));
    set((state) => ({ sim: { ...state.sim, config: shared.config, scenarios, baseline: null, comparison: null, status: "idle" } }));
    get().runSimulation();
    return true;
  },

  setEditingLayout: (isEditingLayout) => set({ isEditingLayout }),

  moveItem: (id, x, y) =>
    set((state) => {
      const base = state.layoutBase ?? state.agent.twin;
      return {
        layoutBase: base,
        agent: { ...state.agent, twin: moveInstrument(state.agent.twin, base, id, x, y) },
        sim: { ...state.sim, baseline: null, comparison: null, status: "idle" },
      };
    }),

  resetLayout: () =>
    set((state) => (state.layoutBase === null ? state : {
      agent: { ...state.agent, twin: state.layoutBase },
      layoutBase: null,
      sim: { ...state.sim, baseline: null, comparison: null, status: "idle" },
    })),

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
      layoutBase: null,
      isEditingLayout: false,
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

