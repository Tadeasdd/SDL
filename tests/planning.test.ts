import { describe, expect, it } from "vitest";
import { askClaude, AskRequestSchema } from "@/core/agent/ask";
import { replayEvents, twinFromEvents } from "@/core/agent/replay";
import { EXAMPLE_CONFIG } from "@/core/example-config";
import { decodeShare, encodeShare } from "@/core/share";
import { assaySummary, COLUMNS, interpolateIc50, plateData, ROWS, zPrimeOf } from "@/core/sim/assay";
import { costOf, DEFAULT_ASSUMPTIONS, paybackYears } from "@/core/sim/economics";
import { nextAttended, simulate } from "@/core/sim/engine";
import { answerLocally, factsOf, flowInto, queuesAt, type AskContext } from "@/core/sim/explain";
import { monteCarlo } from "@/core/sim/montecarlo";
import { demandCeiling, paretoFrontier, runSearch, type Plan } from "@/core/sim/optimise";
import { curveOf, MAX_SAVED, parseSaved } from "@/core/sim/saved";
import { applyPatches, candidateInterventions, compare, type Scenario } from "@/core/sim/scenarios";
import { plateRecords } from "@/core/sim/series";
import type { Schedule, SimConfig } from "@/core/sim/types";
import { parseRunLog, splitRuns, validateAgainstLog } from "@/core/sim/validation";
import { layoutIssues, moveInstrument } from "@/core/twin/layout-edit";
import type { LabTwin } from "@/core/twin/schema";
import { loadExampleDocs } from "@/lib/load-example";

const docs = loadExampleDocs();
const twin = twinFromEvents(replayEvents(docs)) as LabTwin;
const logText = docs.find((doc) => doc.id === "run-log")?.content ?? "";
const scenario = (id: string): Scenario => candidateInterventions(twin).find((item) => item.id === id) as Scenario;
const OPEN: Schedule = { attendedHours: null, stopsUnattended: false, dispatch: "fifo", maintenance: [] };
const withSchedule = (schedule: Partial<Schedule>): SimConfig => ({ ...EXAMPLE_CONFIG, schedule: { ...OPEN, ...schedule } });

describe("schedules", () => {
  it("gives the same run for an explicit round-the-clock schedule as for none", () => {
    expect(simulate(twin, withSchedule({})).makespanS).toBe(simulate(twin, EXAMPLE_CONFIG).makespanS);
  });

  it("finds the next staffed moment", () => {
    const shift = { ...OPEN, attendedHours: 8 };
    expect(nextAttended(shift, 3600)).toBe(3600);
    expect(nextAttended(shift, 9 * 3600)).toBe(86_400);
    expect(nextAttended(OPEN, 9 * 3600)).toBe(9 * 3600);
  });

  it("releases no plate outside staffed hours", () => {
    const run = simulate(twin, { ...withSchedule({ attendedHours: 8 }), maxWip: 500 });
    for (const plate of plateRecords(run)) expect(plate.startS % 86_400).toBeLessThan(8 * 3600);
  });

  it("takes longer when automation stops overnight than when it runs on", () => {
    const walkaway = simulate(twin, withSchedule({ attendedHours: 8 }));
    const stopping = simulate(twin, withSchedule({ attendedHours: 8, stopsUnattended: true }));
    expect(stopping.makespanS).toBeGreaterThan(walkaway.makespanS);
  });

  it("starts no step while a stopped lab is shut", () => {
    const run = simulate(twin, withSchedule({ attendedHours: 8, stopsUnattended: true }));
    const moved = run.segments.filter((item) => item.kind === "process");
    expect(moved.length).toBeGreaterThan(0);
    for (const item of moved) expect(item.start % 86_400).toBeLessThan(8 * 3600);
  });

  it("stops a resource during maintenance and records the window", () => {
    const run = simulate(twin, withSchedule({ maintenance: [{ resourceId: "RDR-01", startS: 7200, durationS: 7200 }] }));
    const down = run.segments.find((item) => item.kind === "down");
    expect(down?.resourceId).toBe("RDR-01");
    const during = run.segments.filter((item) => item.kind === "process" && item.resourceId === "RDR-01" && item.start >= (down?.start ?? 0) && item.start < (down?.end ?? 0));
    expect(during).toHaveLength(0);
    expect(run.makespanS).toBeGreaterThan(simulate(twin, EXAMPLE_CONFIG).makespanS);
  });

  it("keeps maintenance out of the plate table", () => {
    const run = simulate(twin, withSchedule({ maintenance: [{ resourceId: "RDR-01", startS: 7200, durationS: 3600 }] }));
    expect(plateRecords(run).every((plate) => plate.plateId >= 0)).toBe(true);
    expect(plateRecords(run)).toHaveLength(run.completed);
  });

  it("changes the outcome with the dispatch rule while finishing every plate", () => {
    const fifo = simulate(twin, EXAMPLE_CONFIG);
    const shortest = simulate(twin, withSchedule({ dispatch: "shortest-step" }));
    const oldest = simulate(twin, withSchedule({ dispatch: "oldest-plate" }));
    expect(shortest.completed).toBe(fifo.completed);
    expect(oldest.completed).toBe(fifo.completed);
    expect(shortest.meanCycleS).not.toBe(fifo.meanCycleS);
  });
});

describe("economics", () => {
  it("prices a purchase with yearly service and a repair at a share of the price", () => {
    const buy = costOf(twin, [scenario("expand-IMG-01")]);
    expect(buy).toEqual({ capex: 450_000, annual: 45_000 });
    expect(costOf(twin, [scenario("restore-RDR-02")]).capex).toBeCloseTo(10_800);
  });

  it("adds up combined changes, and a door costs building work only", () => {
    expect(costOf(twin, [scenario("widen-D-3"), scenario("expand-IMG-01")])).toEqual({ capex: 468_000, annual: 45_000 });
  });

  it("gives years to pay back, zero for a free change, null when it never does", () => {
    const assumptions = { valuePerPlate: 100, operatingHoursPerYear: 1000 };
    expect(paybackYears({ capex: 200_000, annual: 0 }, 1, assumptions)).toBe(2);
    expect(paybackYears({ capex: 0, annual: 0 }, 1, assumptions)).toBe(0);
    expect(paybackYears({ capex: 200_000, annual: 200_000 }, 1, assumptions)).toBeNull();
    expect(paybackYears({ capex: 1, annual: 0 }, -1, assumptions)).toBeNull();
  });
});

describe("optimiser", () => {
  const goal = { targetPerHour: 6.5, budget: null, maxChanges: 3 };

  it("finds the cheap fix for a modest target", () => {
    const result = runSearch(twin, EXAMPLE_CONFIG, goal, DEFAULT_ASSUMPTIONS, { runs: 6 });
    expect(result.best?.scenarios.map((item) => item.id)).toEqual(["restore-RDR-02"]);
    expect(result.best?.meetsTarget).toBe(true);
  });

  it("needs more than the repair for a higher target, and still clears it", () => {
    const result = runSearch(twin, EXAMPLE_CONFIG, { ...goal, targetPerHour: 8.5 }, DEFAULT_ASSUMPTIONS, { runs: 6 });
    expect(result.best?.scenarios.length).toBeGreaterThan(1);
    expect(result.best?.throughput.p5).toBeGreaterThanOrEqual(8.5);
  });

  it("finds a change that only pays off in combination", () => {
    const repaired = applyPatches(twin, scenario("restore-RDR-02").patches);
    const door = scenario("widen-D-3").patches;
    const alone = compare(monteCarlo(twin, EXAMPLE_CONFIG, 32), monteCarlo(applyPatches(twin, door), EXAMPLE_CONFIG, 32));
    const after = compare(monteCarlo(repaired, EXAMPLE_CONFIG, 32), monteCarlo(applyPatches(repaired, door), EXAMPLE_CONFIG, 32));
    expect(alone.isMeaningful).toBe(false);
    expect(after.isMeaningful).toBe(true);
    const result = runSearch(twin, EXAMPLE_CONFIG, { ...goal, targetPerHour: 7.1 }, DEFAULT_ASSUMPTIONS, { runs: 6 });
    expect(result.best?.scenarios.map((item) => item.id).sort()).toEqual(["restore-RDR-02", "widen-D-3"]);
  });

  it("does not recommend a plan that only cleared the target by luck", () => {
    const result = runSearch(twin, EXAMPLE_CONFIG, { ...goal, targetPerHour: 7.3 }, DEFAULT_ASSUMPTIONS, { runs: 3 });
    expect(result.best === null || result.best.throughput.p5 >= 7.3).toBe(true);
  });

  it("respects the budget", () => {
    const result = runSearch(twin, EXAMPLE_CONFIG, { ...goal, targetPerHour: 8.5, budget: 50_000 }, DEFAULT_ASSUMPTIONS, { runs: 6 });
    for (const plan of result.frontier) expect(plan.cost.capex).toBeLessThanOrEqual(50_000);
    expect(result.best).toBeNull();
  });

  it("says when a target is beyond the release rate", () => {
    expect(demandCeiling(EXAMPLE_CONFIG)).toBeCloseTo(11.2);
    const result = runSearch(twin, EXAMPLE_CONFIG, { ...goal, targetPerHour: 50 }, DEFAULT_ASSUMPTIONS, { runs: 4, beam: 2, branch: 2 });
    expect(result.best).toBeNull();
    expect(result.demandCeiling).toBeCloseTo(11.2);
  });

  it("keeps only plans faster than everything cheaper", () => {
    const plan = (capex: number, mean: number): Plan => ({ scenarios: [], cost: { capex, annual: 0 }, throughput: { mean, p5: mean, p95: mean }, bottleneckId: null, meetsTarget: false, paybackYears: null });
    expect(paretoFrontier([plan(0, 5), plan(10, 4), plan(20, 7), plan(30, 7)]).map((item) => item.cost.capex)).toEqual([0, 20]);
  });
});

describe("assay", () => {
  it("makes a full 384-well plate that repeats exactly", () => {
    const first = plateData(3, 10, 1);
    expect(first.wells).toHaveLength(ROWS * COLUMNS);
    expect(plateData(3, 10, 1)).toEqual(first);
    expect(plateData(4, 10, 1).wells).not.toEqual(first.wells);
  });

  it("recovers the reference compound's IC50 on an on-time plate", () => {
    expect(plateData(1, 20, 1).ic50Um).toBeGreaterThan(0.5);
    expect(plateData(1, 20, 1).ic50Um).toBeLessThan(2);
  });

  it("loses signal the longer a plate waits past the limit", () => {
    expect(plateData(1, 200, 1).high).toBeLessThan(plateData(1, 20, 1).high);
  });

  it("computes Z' from controls", () => {
    expect(zPrimeOf([100, 100], [0, 0])).toBe(1);
    expect(zPrimeOf([100, 80], [20, 0])).toBeLessThan(0.5);
  });

  it("finds where a curve falls through 50%", () => {
    expect(interpolateIc50([{ doseUm: 1, viability: 80 }, { doseUm: 100, viability: 20 }])).toBeCloseTo(10);
    expect(interpolateIc50([{ doseUm: 1, viability: 80 }, { doseUm: 100, viability: 70 }])).toBeNull();
  });

  it("shows the reader queue damaging data, and the repair fixing it", () => {
    const today = assaySummary(twin, monteCarlo(twin, EXAMPLE_CONFIG, 4).representative, 1);
    const fixed = applyPatches(twin, scenario("restore-RDR-02").patches);
    const after = assaySummary(fixed, monteCarlo(fixed, EXAMPLE_CONFIG, 4).representative, 1);
    expect(today?.plates).toHaveLength(72);
    expect(after?.meanDelayMin).toBeLessThan(today?.meanDelayMin ?? 0);
    expect(after?.passShare).toBeGreaterThan(today?.passShare ?? 1);
  });

  it("is null for a lab with no screening workflow", () => {
    const run = simulate(twin, EXAMPLE_CONFIG);
    expect(assaySummary({ ...twin, workflows: [] }, run, 1)).toBeNull();
  });
});

describe("validation", () => {
  it("parses the log and rejects one with a missing column", () => {
    expect(parseRunLog(logText)[0]?.step).toBe("plate-out");
    expect(() => parseRunLog("run,step\na,b")).toThrow(/timestamp/);
  });

  it("keeps test runs unseen and later than training runs", () => {
    const { train, test } = splitRuns(parseRunLog(logText));
    const seen = new Set(train.map((row) => row.run));
    expect(test.length).toBeGreaterThan(0);
    expect(test.some((row) => seen.has(row.run))).toBe(false);
    const viability = (rows: typeof train) => rows.filter((row) => row.run.startsWith("CV")).map((row) => row.run).sort();
    expect((viability(train).at(-1) ?? "") < (viability(test)[0] ?? "")).toBe(true);
  });

  it("scores held-out steps and end-to-end cycle time", () => {
    const report = validateAgainstLog(twin, logText);
    expect(report.steps.length).toBeGreaterThan(8);
    expect(report.meanErrorPct).toBeLessThan(5);
    expect(report.coverage).toBeGreaterThan(0.75);
    expect(report.cycles.map((item) => item.workflowId)).toContain("wf-viability");
  });

  it("flags a twin that is badly wrong", () => {
    const skewed = logText.replaceAll(",CV-005,", ",CV-005,").split("\n").map((line, index) => {
      if (index === 0 || !/,CV-00[56],/.test(line)) return line;
      const fields = line.split(",");
      fields[5] = String(Number(fields[5]) * 2);
      return fields.join(",");
    }).join("\n");
    expect(validateAgainstLog(twin, skewed).meanErrorPct).toBeGreaterThan(20);
  });
});

describe("layout editing", () => {
  it("moves an instrument without touching the original twin", () => {
    const moved = moveInstrument(twin, twin, "RDR-01", 6.4, 4.9);
    expect(moved.instruments.find((item) => item.id === "RDR-01")?.x).toBe(6.4);
    expect(twin.instruments.find((item) => item.id === "RDR-01")?.x).toBe(6.2);
  });

  it("reports nothing wrong with the example layout", () => {
    expect(layoutIssues(twin, twin)).toEqual([]);
  });

  it("drops a station from the arm's reach when it is moved too far, and restores it", () => {
    const far = moveInstrument(twin, twin, "RDR-01", 6.2, 7.2);
    expect(far.transports.find((item) => item.id === "ARM-01")?.reach).not.toContain("RDR-01");
    expect(layoutIssues(far, twin).map((item) => item.kind)).toContain("out-of-reach");
    const back = moveInstrument(far, twin, "RDR-01", 6.2, 4.855);
    expect(back.transports.find((item) => item.id === "ARM-01")?.reach).toContain("RDR-01");
  });

  it("flags overlaps, rail fouling and leaving the floor", () => {
    const kinds = (x: number, y: number) => layoutIssues(moveInstrument(twin, twin, "RDR-01", x, y), twin).map((item) => item.kind);
    expect(kinds(7.2, 4.855)).toContain("overlap");
    expect(kinds(6.2, 4.1)).toContain("rail");
    expect(kinds(-3, 4.855)).toContain("off-floor");
  });

  it("updates the instrument's room when it crosses a wall", () => {
    const moved = moveInstrument(twin, twin, "TC-01", 5, 1);
    expect(moved.instruments.find((item) => item.id === "TC-01")?.zoneId).toBe("z-bay");
  });

  it("falls back to the technician when the reader moves out of reach, at a cost", () => {
    const far = moveInstrument(twin, twin, "RDR-01", 6.2, 7.2);
    const run = simulate(far, EXAMPLE_CONFIG);
    expect(run.resources.map((item) => item.id)).toContain("TECH-1");
    expect(run.resources.find((item) => item.id === "TECH-1")?.jobs).toBeGreaterThan(simulate(twin, EXAMPLE_CONFIG).resources.find((item) => item.id === "TECH-1")?.jobs ?? 0);
  });
});

describe("saved runs", () => {
  const entry = { id: "a", name: "A", twinId: "t", savedAt: "now", changes: [], scheduleLabel: "x", throughput: { mean: 1, p5: 1, p95: 1 }, makespanS: 1, meanCycleS: 1, bottleneckId: null, capex: 0, paybackYears: null, assayPassShare: null, curve: [[0, 0]] };

  it("thins the curve and ends on every plate", () => {
    const curve = curveOf(monteCarlo(twin, EXAMPLE_CONFIG, 2));
    expect(curve.length).toBeLessThanOrEqual(33);
    expect(curve.at(-1)?.[1]).toBe(80);
  });

  it("survives corrupt storage and drops bad entries", () => {
    expect(parseSaved(null)).toEqual([]);
    expect(parseSaved("{not json")).toEqual([]);
    expect(parseSaved("{}")).toEqual([]);
    expect(parseSaved(JSON.stringify([entry, { id: 3 }]))).toHaveLength(1);
  });

  it("caps how many it keeps", () => {
    expect(parseSaved(JSON.stringify(Array.from({ length: 20 }, () => entry)))).toHaveLength(MAX_SAVED);
  });
});

describe("share links", () => {
  it("round-trips config and changes", () => {
    const state = { config: withSchedule({ attendedHours: 8 }), scenarioIds: ["restore-RDR-02"] };
    expect(decodeShare(encodeShare(state))).toEqual(state);
  });

  it("uses URL-safe characters", () => {
    expect(encodeShare({ config: EXAMPLE_CONFIG, scenarioIds: ["é?>"] })).toMatch(/^[\w-]+$/);
  });

  it("rejects tampered input", () => {
    expect(decodeShare("not-a-link")).toBeNull();
    expect(decodeShare(btoa(JSON.stringify({ config: { seed: "x" }, scenarioIds: [] })))).toBeNull();
  });
});

describe("ask the twin", () => {
  const current = monteCarlo(twin, EXAMPLE_CONFIG, 8);
  const context: AskContext = { twin, current, assay: assaySummary(twin, current.representative, 1), capex: null, paybackYears: null };
  const run = current.representative;

  it("explains a queue at a given hour with figures from the run", () => {
    const { text, basis } = answerLocally("why did the queue build up at hour 3?", context);
    const top = queuesAt(run, 3 * 3600)[0];
    expect(text).toContain(`${top?.depth} plates were waiting for ${top?.id}`);
    expect(text).toContain(`${flowInto(run, top?.id ?? "", 3 * 3600).arrived} plates arrived`);
    expect(basis.length).toBeGreaterThan(0);
  });

  it("answers about a named resource at a time", () => {
    expect(answerLocally("what about IMG-01 at 5h?", context).text).toContain("IMG-01");
  });

  it("refuses a time after the run ended rather than inventing one", () => {
    expect(answerLocally("what happened at hour 500?", context).text).toContain("finished at");
  });

  it("names the bottleneck", () => {
    expect(answerLocally("what is the bottleneck?", context).text).toContain("RDR-01");
  });

  it("reports throughput, assay and cost", () => {
    expect(answerLocally("what is the throughput?", context).text).toContain(current.throughputPerHour.mean.toFixed(2));
    expect(answerLocally("how is assay quality?", context).text).toContain("generated");
    expect(answerLocally("what does this cost?", context).text).toContain("No paid changes");
    expect(answerLocally("what does this cost?", { ...context, capex: 10_800, paybackYears: 0.1 }).text).toContain("10,800");
  });

  it("offers examples instead of guessing", () => {
    expect(answerLocally("tell me a joke", context).text).toContain("Try");
  });

  it("packs facts for a model without raw segments", () => {
    const facts = factsOf(context);
    expect(facts.bottleneck).toBe(run.bottleneckId);
    expect(JSON.stringify(facts).length).toBeLessThan(12_000);
  });
});

describe("askClaude", () => {
  const reply = (content: { type: string; text?: string }[], stop = "end_turn") => ({ content, stop_reason: stop });
  const request = { question: "why?", facts: { plates: 80 } };

  it("sends the facts and returns the text", async () => {
    let sent: { messages: { content: string }[]; model: string } | null = null;
    const client = { create: (body: never) => { sent = body; return Promise.resolve(reply([{ type: "thinking" }, { type: "text", text: "Because." }])); } };
    await expect(askClaude(client as never, request)).resolves.toBe("Because.");
    expect((sent as unknown as { messages: { content: string }[] }).messages[0]?.content).toContain('"plates":80');
    expect((sent as unknown as { model: string }).model).toBe("claude-opus-5-5");
  });

  it("fails clearly on a refusal or an empty reply", async () => {
    await expect(askClaude({ create: () => Promise.resolve(reply([], "refusal")) } as never, request)).rejects.toThrow(/declined/);
    await expect(askClaude({ create: () => Promise.resolve(reply([])) } as never, request)).rejects.toThrow(/no answer/);
  });

  it("rejects an empty or oversized question", () => {
    expect(AskRequestSchema.safeParse({ question: "  ", facts: {} }).success).toBe(false);
    expect(AskRequestSchema.safeParse({ question: "x".repeat(501), facts: {} }).success).toBe(false);
  });
});
