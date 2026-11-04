import { describe, expect, it } from "vitest";
import { simulate } from "@/core/sim/engine";
import { monteCarlo, range } from "@/core/sim/montecarlo";
import { EventQueue } from "@/core/sim/queue";
import { createRng, sampleExponential, sampleNormal } from "@/core/sim/random";
import { applyPatches, candidateInterventions, compare, rankInterventions, runComparison } from "@/core/sim/scenarios";
import type { SimConfig, Segment } from "@/core/sim/types";
import { amr, door, instrument, lineTwin, workflow, zone } from "./fixtures";

const config = (overrides: Partial<SimConfig> = {}): SimConfig => ({
  demands: [{ workflowId: "wf", plates: 10, intervalS: 0 }],
  seed: 1,
  maxWip: 100,
  failures: false,
  ...overrides,
});

const peakConcurrency = (segments: readonly Segment[], resourceId: string): number => {
  const edges = segments
    .filter((segment) => segment.resourceId === resourceId && segment.kind === "process")
    .flatMap((segment) => [[segment.start, 1], [segment.end, -1]] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return edges.reduce(
    (state, [, change]) => {
      const active = state.active + change;
      return { active, peak: Math.max(state.peak, active) };
    },
    { active: 0, peak: 0 },
  ).peak;
};

describe("random", () => {
  it("repeats for a given seed", () => {
    const a = createRng(7);
    const b = createRng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("stays in the unit interval", () => {
    const rng = createRng(3);
    expect(Array.from({ length: 1000 }, rng).every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it("produces samples around the requested means", () => {
    const rng = createRng(11);
    const normals = Array.from({ length: 5000 }, () => sampleNormal(rng, 100, 10));
    const exponentials = Array.from({ length: 5000 }, () => sampleExponential(rng, 50));
    expect(range(normals).mean).toBeCloseTo(100, 0);
    expect(Math.abs(range(exponentials).mean - 50)).toBeLessThan(3);
  });
});

describe("event queue", () => {
  it("pops by time, then insertion order", () => {
    const queue = new EventQueue();
    const seen: string[] = [];
    queue.push(5, () => seen.push("late"));
    queue.push(1, () => seen.push("first"));
    queue.push(1, () => seen.push("second"));
    queue.push(3, () => seen.push("mid"));
    while (queue.size > 0) queue.pop()?.run();
    expect(seen).toEqual(["first", "second", "mid", "late"]);
  });
});

describe("simulate", () => {
  it("is deterministic for a seed", () => {
    expect(simulate(lineTwin(), config({ failures: true }))).toEqual(simulate(lineTwin(), config({ failures: true })));
  });

  it("changes with the seed when durations vary", () => {
    const flow = workflow([["first", 100]]);
    const step = flow.steps[0]!;
    const twin = lineTwin({ workflows: [{ ...flow, steps: [{ ...step, duration: { ...step.duration, sdS: 20 } }] }] });
    expect(simulate(twin, config({ seed: 1 })).makespanS).not.toBe(simulate(twin, config({ seed: 2 })).makespanS);
  });

  it("matches the hand calculation for one plate", () => {
    // 100 s + (arm: 5 s hand-off + 2 m deadhead + 4 m travel at 1 m/s) + 100 s
    const result = simulate(lineTwin(), config({ demands: [{ workflowId: "wf", plates: 1, intervalS: 0 }] }));
    const armHomeToFirst = 2 * Math.SQRT2 + 0;
    expect(result.makespanS).toBeCloseTo(100 + 5 + armHomeToFirst + 4 + 100, 5);
  });

  it("conserves plates", () => {
    expect(simulate(lineTwin(), config({ demands: [{ workflowId: "wf", plates: 37, intervalS: 11 }] })).completed).toBe(37);
  });

  it("never runs more plates on an instrument than its capacity", () => {
    const twin = lineTwin({ instruments: [instrument("i1", "first", { capacity: 3 }), instrument("i2", "second", { x: 6 })] });
    const result = simulate(twin, config({ demands: [{ workflowId: "wf", plates: 30, intervalS: 0 }] }));
    expect(peakConcurrency(result.segments, "i1")).toBeLessThanOrEqual(3);
    expect(peakConcurrency(result.segments, "i2")).toBe(1);
  });

  it("cannot beat the bottleneck rate", () => {
    const result = simulate(lineTwin(), config({ demands: [{ workflowId: "wf", plates: 50, intervalS: 0 }] }));
    expect(result.throughputPerHour).toBeLessThanOrEqual(3600 / 100);
    expect(result.throughputPerHour).toBeGreaterThan(30);
  });

  it("names the resource plates queued for longest", () => {
    const twin = lineTwin({ workflows: [workflow([["first", 10], ["second", 300]])] });
    expect(simulate(twin, config()).bottleneckId).toBe("i2");
  });

  it("holds plates back at the WIP limit without losing them", () => {
    const limited = simulate(lineTwin(), config({ maxWip: 2 }));
    expect(limited.completed).toBe(10);
    expect(limited.meanCycleS).toBeLessThan(simulate(lineTwin(), config()).meanCycleS);
  });

  it("slows a degraded instrument", () => {
    const twin = lineTwin({ instruments: [instrument("i1", "first", { state: "degraded" }), instrument("i2", "second", { x: 6 })] });
    expect(simulate(twin, config()).makespanS).toBeGreaterThan(simulate(lineTwin(), config()).makespanS);
  });

  it("records failures and the repair time they cost", () => {
    const fragile = lineTwin({ instruments: [instrument("i1", "first", { mtbfHours: 0.01, mttrMinutes: 10 }), instrument("i2", "second", { x: 6 })] });
    const result = simulate(fragile, config({ failures: true }));
    expect(result.failures).toBeGreaterThan(0);
    expect(result.segments.some((segment) => segment.failed)).toBe(true);
    expect(result.makespanS).toBeGreaterThan(simulate(fragile, config()).makespanS);
  });

  it("skips an offline instrument", () => {
    const twin = lineTwin({
      instruments: [
        instrument("i1", "first"),
        instrument("i2", "second", { x: 6 }),
        instrument("i3", "second", { x: 7, state: "offline" }),
      ],
    });
    expect(simulate(twin, config()).segments.some((segment) => segment.resourceId === "i3")).toBe(false);
  });

  it("balances load across parallel instruments", () => {
    const twin = lineTwin({
      instruments: [instrument("i1", "first"), instrument("i2", "second", { x: 6 }), instrument("i3", "second", { x: 7 })],
      transports: [{ ...lineTwin().transports[0]!, reach: ["i1", "i2", "i3"] }],
    });
    const used = simulate(twin, config()).resources.map((item) => item.id);
    expect(used).toEqual(expect.arrayContaining(["i2", "i3"]));
  });

  it("throws for an unknown workflow", () => {
    expect(() => simulate(lineTwin(), config({ demands: [{ workflowId: "ghost", plates: 1, intervalS: 0 }] }))).toThrow(/Unknown workflow/);
  });

  it("throws when a step cannot be reached", () => {
    expect(() => simulate(lineTwin({ transports: [] }), config())).toThrow(/No reachable instrument/);
  });

  it("reports move segments along the planned path", () => {
    const moves = simulate(lineTwin(), config()).segments.filter((segment) => segment.kind === "move");
    expect(moves.length).toBe(10);
    expect(moves[0]?.path).toHaveLength(2);
  });
});

describe("monte carlo", () => {
  const varied = () => {
    const flow = workflow([["first", 100], ["second", 100]]);
    return lineTwin({
      workflows: [{ ...flow, steps: flow.steps.map((step) => ({ ...step, duration: { ...step.duration, sdS: 15 } })) }],
    });
  };

  it("orders its percentiles", () => {
    const { throughputPerHour: t } = monteCarlo(varied(), config(), 20);
    expect(t.p5).toBeLessThanOrEqual(t.mean);
    expect(t.mean).toBeLessThanOrEqual(t.p95);
  });

  it("keeps one sample per run and a share per bottleneck", () => {
    const result = monteCarlo(varied(), config(), 12);
    expect(result.samples).toHaveLength(12);
    expect(Object.values(result.bottleneckShare).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("plays back a run close to the mean", () => {
    const result = monteCarlo(varied(), config(), 12);
    const gap = Math.abs(result.representative.throughputPerHour - result.throughputPerHour.mean);
    expect(gap).toBeLessThanOrEqual(result.throughputPerHour.p95 - result.throughputPerHour.p5);
  });
});

describe("scenarios", () => {
  it("does not modify the original twin", () => {
    const twin = lineTwin();
    applyPatches(twin, [{ op: "add-capacity", id: "i1", by: 2 }, { op: "set-state", id: "i2", state: "offline" }]);
    expect(twin).toEqual(lineTwin());
  });

  it("applies each patch type", () => {
    const twin = lineTwin({ doors: [door("d1", "a", "a", 800)], transports: [amr()] });
    const next = applyPatches(twin, [
      { op: "add-capacity", id: "amr", by: 1 },
      { op: "widen-door", id: "d1", widthMm: 1200 },
      { op: "scale-transport-speed", id: "amr", factor: 2 },
      { op: "set-state", id: "i1", state: "degraded" },
    ]);
    expect(next.transports[0]).toMatchObject({ capacity: 2, speedMps: 2 });
    expect(next.doors[0]?.widthMm).toBe(1200);
    expect(next.instruments[0]?.state).toBe("degraded");
  });

  it("detects a real improvement with paired seeds", () => {
    const scenario = { id: "s", name: "S", rationale: "r", patches: [{ op: "add-capacity" as const, id: "i2", by: 1 }] };
    const twin = lineTwin({ workflows: [workflow([["first", 10], ["second", 300]])] });
    const result = runComparison(twin, scenario, config(), 8);
    expect(result.delta.mean).toBeGreaterThan(0);
    expect(result.isMeaningful).toBe(true);
  });

  it("calls a zero change not meaningful", () => {
    const baseline = monteCarlo(lineTwin(), config(), 4);
    expect(compare(baseline, baseline).isMeaningful).toBe(false);
  });

  it("proposes restoring, expanding and widening where each applies", () => {
    const twin = lineTwin({
      zones: [zone("a", 0), zone("b", 10)],
      doors: [door("d1", "a", "b", 850)],
      instruments: [instrument("i1", "first"), instrument("i2", "second", { state: "offline", x: 6 })],
      transports: [amr()],
    });
    const ids = candidateInterventions(twin).map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(["restore-i2", "expand-i1", "widen-d1"]));
  });

  it("ranks the true bottleneck first", () => {
    const twin = lineTwin({ workflows: [workflow([["first", 10], ["second", 300]])] });
    expect(rankInterventions(twin, config(), 4)[0]?.id).toBe("expand-i2");
  });
});
