import { describe, expect, it } from "vitest";
import { EXAMPLE_CONFIG } from "@/core/example-config";
import { replayEvents, twinFromEvents } from "@/core/agent/replay";
import { monteCarlo } from "@/core/sim/montecarlo";
import { completionBand, completionSteps, indexAt, niceTicks, plateRecords, queueSteps, toCsv, valueAt } from "@/core/sim/series";
import type { Segment, SimResult } from "@/core/sim/types";
import { loadExampleDocs } from "@/lib/load-example";

const segment = (plateId: number, kind: Segment["kind"], resourceId: string, start: number, end: number): Segment => ({
  plateId, workflowId: "wf", kind, resourceId, stepId: "s", start, end,
});
const runOf = (segments: Segment[]): SimResult => ({
  completed: 0, makespanS: 0, throughputPerHour: 0, meanCycleS: 0, p95CycleS: 0, resources: [], bottleneckId: null, failures: 0, segments,
});

describe("plateRecords", () => {
  it("summarises each plate and sorts by finish time", () => {
    const run = runOf([
      segment(2, "process", "a", 0, 50),
      segment(1, "process", "a", 10, 20),
      segment(1, "wait", "b", 20, 25),
      segment(1, "process", "b", 25, 30),
    ]);
    expect(plateRecords(run)).toEqual([
      { plateId: 1, workflowId: "wf", startS: 10, endS: 30, cycleS: 20, waitS: 5, failures: 0 },
      { plateId: 2, workflowId: "wf", startS: 0, endS: 50, cycleS: 50, waitS: 0, failures: 0 },
    ]);
  });

  it("counts failed steps", () => {
    const run = runOf([{ ...segment(1, "process", "a", 0, 9), failed: true }]);
    expect(plateRecords(run)[0]?.failures).toBe(1);
  });

  it("agrees with the engine's own cycle time and plate count", () => {
    const twin = twinFromEvents(replayEvents(loadExampleDocs()));
    if (twin === null) throw new Error("replay did not finish");
    const run = monteCarlo(twin, EXAMPLE_CONFIG, 2).representative;
    const records = plateRecords(run);
    expect(records).toHaveLength(run.completed);
    const mean = records.reduce((sum, item) => sum + item.cycleS, 0) / records.length;
    expect(mean).toBeCloseTo(run.meanCycleS, 3);
    expect(records.at(-1)?.endS).toBeCloseTo(run.makespanS, 6);
  });
});

describe("step series", () => {
  it("counts finished plates from zero", () => {
    const steps = completionSteps(plateRecords(runOf([segment(1, "process", "a", 0, 10), segment(2, "process", "a", 0, 20)])));
    expect(steps).toEqual({ t: [0, 10, 20], v: [0, 1, 2] });
  });

  it("tracks how many plates wait for one resource at a time", () => {
    const run = runOf([segment(1, "wait", "r", 10, 30), segment(2, "wait", "r", 20, 40), segment(3, "wait", "other", 0, 99)]);
    const steps = queueSteps(run, "r");
    expect(valueAt(steps, 5)).toBe(0);
    expect(valueAt(steps, 15)).toBe(1);
    expect(valueAt(steps, 25)).toBe(2);
    expect(valueAt(steps, 35)).toBe(1);
    expect(valueAt(steps, 45)).toBe(0);
  });

  it("merges simultaneous queue events into one step", () => {
    const steps = queueSteps(runOf([segment(1, "wait", "r", 10, 20), segment(2, "wait", "r", 20, 30)]), "r");
    expect(steps.t.filter((time) => time === 20)).toHaveLength(1);
    expect(valueAt(steps, 20)).toBe(1);
  });

  it("finds the last step at or before t, including outside the range", () => {
    const steps = { t: [0, 10, 20], v: [0, 1, 2] };
    expect(indexAt(steps, -1)).toBe(0);
    expect(indexAt(steps, 10)).toBe(1);
    expect(indexAt(steps, 19.9)).toBe(1);
    expect(indexAt(steps, 500)).toBe(2);
  });
});

describe("completionBand", () => {
  const one = (end: number) => runOf([segment(1, "process", "a", 0, end)]);

  it("spans the slowest run and ends with every plate finished", () => {
    const band = completionBand([one(10), one(20), one(40)], 5);
    expect(band.t[0]).toBe(0);
    expect(band.t.at(-1)).toBe(40);
    expect(band.p5.at(-1)).toBe(1);
    expect(band.p95.at(-1)).toBe(1);
  });

  it("keeps the low edge at or below the high edge, both never falling", () => {
    const band = completionBand([one(10), one(20), one(30), one(40)], 9);
    band.t.forEach((_, index) => {
      expect(band.p5[index]).toBeLessThanOrEqual(band.p95[index] as number);
      if (index > 0) expect(band.p95[index]).toBeGreaterThanOrEqual(band.p95[index - 1] as number);
    });
  });

  it("is produced by monteCarlo for every run set", () => {
    const twin = twinFromEvents(replayEvents(loadExampleDocs()));
    if (twin === null) throw new Error("replay did not finish");
    const result = monteCarlo(twin, EXAMPLE_CONFIG, 3);
    expect(result.completionBand.t.length).toBeGreaterThan(2);
    expect(result.completionBand.p95.at(-1)).toBe(result.representative.completed);
  });

  it("is empty when there are no runs", () => {
    expect(completionBand([], 5)).toEqual({ t: [0], p5: [0], p95: [0] });
  });
});

describe("niceTicks", () => {
  it("starts at zero and covers the maximum with round steps", () => {
    expect(niceTicks(80, 4)).toEqual([0, 20, 40, 60, 80]);
    expect(niceTicks(13.9, 5)).toEqual([0, 5, 10, 15]);
  });

  it("uses whole steps for counts", () => {
    expect(niceTicks(3, 4, true)).toEqual([0, 1, 2, 3]);
  });

  it("never returns a flat axis", () => {
    expect(niceTicks(0, 4)).toEqual([0, 1]);
  });
});

describe("toCsv", () => {
  it("quotes fields that need it and neutralises spreadsheet formulas", () => {
    expect(toCsv(["a", "b"], [["x,y", 2], ['say "hi"', "=SUM(A1)"]])).toBe('a,b\n"x,y",2\n"say ""hi""",\'=SUM(A1)\n');
  });
});
