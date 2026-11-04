import { describe, expect, it } from "vitest";
import { emptyTwin, entityCount, upsertInstrument, upsertZone } from "@/core/twin/mutations";
import { feasibleInstruments } from "@/core/twin/feasible";
import { createRouter, pathLength, planRoute } from "@/core/twin/routing";
import { LabTwinSchema } from "@/core/twin/schema";
import { hasErrors, validateTwin } from "@/core/twin/validate";
import { amr, arm, door, instrument, lineTwin, workflow, zone } from "./fixtures";

const codes = (twin = lineTwin()) => validateTwin(twin).map((issue) => issue.code);

describe("mutations", () => {
  it("returns a new twin and leaves the input unchanged", () => {
    const original = emptyTwin("t", "T");
    const next = upsertZone(original, zone("a", 0));
    expect(original.zones).toHaveLength(0);
    expect(next.zones).toHaveLength(1);
  });

  it("replaces an entity with the same id instead of duplicating it", () => {
    const first = upsertInstrument(lineTwin(), instrument("i1", "first", { capacity: 4 }));
    expect(first.instruments).toHaveLength(2);
    expect(first.instruments[0]?.capacity).toBe(4);
  });

  it("counts physical and workflow entities but not findings", () => {
    expect(entityCount(lineTwin())).toBe(5);
  });
});

describe("schema", () => {
  it("accepts a well-formed twin", () => {
    expect(LabTwinSchema.safeParse(lineTwin()).success).toBe(true);
  });

  it("rejects an entity without evidence", () => {
    const twin = lineTwin({ zones: [zone("a", 0, { provenance: { evidence: [], confidence: 1, status: "confirmed" } })] });
    expect(LabTwinSchema.safeParse(twin).success).toBe(false);
  });
});

describe("routing", () => {
  const twoRooms = () =>
    lineTwin({
      zones: [zone("a", 0), zone("b", 10)],
      doors: [door("d1", "a", "b", 1000)],
      instruments: [instrument("i1", "first"), instrument("i2", "second", { zoneId: "b", x: 18, y: 2 })],
      transports: [amr()],
    });

  it("uses an arm directly when both instruments are in reach", () => {
    const route = planRoute(lineTwin(), "i1", "i2");
    expect(route?.legs.map((leg) => leg.transportId)).toEqual(["arm"]);
    expect(route?.distanceM).toBeCloseTo(4);
  });

  it("returns an empty route between an instrument and itself", () => {
    expect(planRoute(lineTwin(), "i1", "i1")).toEqual({ legs: [], distanceM: 0 });
  });

  it("returns null for an unknown instrument", () => {
    expect(planRoute(lineTwin(), "i1", "ghost")).toBeNull();
  });

  it("paths a mobile robot through the door", () => {
    const route = planRoute(twoRooms(), "i1", "i2");
    expect(route?.legs[0]?.path).toContainEqual({ x: 10, y: 5 });
  });

  it("refuses a door narrower than the robot needs", () => {
    const twin = { ...twoRooms(), doors: [door("d1", "a", "b", 850)] };
    expect(planRoute(twin, "i1", "i2")).toBeNull();
  });

  it("chains an arm leg and a robot leg through a shared hand-off", () => {
    const base = twoRooms();
    const twin = {
      ...base,
      instruments: [
        instrument("i0", "zero", { x: 5, y: 8 }),
        ...base.instruments,
      ],
      transports: [arm(["i0", "i1"]), amr({ minDoorMm: 900 })],
    };
    const route = planRoute(twin, "i0", "i2");
    expect(route?.legs.length).toBeGreaterThanOrEqual(1);
    expect(route?.legs.at(-1)?.toId).toBe("i2");
  });

  it("prefers automation over a much shorter human leg", () => {
    const human = amr({ id: "tech", kind: "human", minDoorMm: undefined, speedMps: 1.2, handoffS: 5 });
    const twin = lineTwin({ transports: [arm(["i1", "i2"]), human] });
    expect(planRoute(twin, "i1", "i2")?.legs[0]?.transportId).toBe("arm");
  });

  it("memoises per instrument pair", () => {
    const route = createRouter(lineTwin());
    expect(route("i1", "i2")).toBe(route("i1", "i2"));
  });

  it("measures polylines", () => {
    expect(pathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 5 }])).toBe(6);
  });
});

describe("validator", () => {
  it("passes a consistent twin", () => {
    expect(hasErrors(validateTwin(lineTwin()))).toBe(false);
  });

  it("flags a duplicate id", () => {
    expect(codes(lineTwin({ zones: [zone("i1", 0), zone("a", 0)] }))).toContain("duplicate-id");
  });

  it("flags a door to a zone that does not exist", () => {
    expect(codes(lineTwin({ doors: [door("d", "a", "ghost")] }))).toContain("door-unknown-zone");
  });

  it("flags an instrument placed in an unknown zone", () => {
    const twin = lineTwin({ instruments: [instrument("i1", "first", { zoneId: "ghost" })] });
    expect(codes(twin)).toContain("instrument-unknown-zone");
  });

  it("flags an instrument outside its zone", () => {
    const twin = lineTwin({ instruments: [instrument("i1", "first", { x: 50 })] });
    expect(codes(twin)).toContain("instrument-outside-zone");
  });

  it("flags an arm that reaches an instrument that does not exist", () => {
    expect(codes(lineTwin({ transports: [arm(["i1", "ghost"])] }))).toContain("transport-unknown-instrument");
  });

  it("flags a step nothing online can perform", () => {
    const twin = lineTwin({
      instruments: [instrument("i1", "first"), instrument("i2", "second", { state: "offline" })],
    });
    expect(codes(twin)).toContain("workflow-no-instrument");
  });

  it("flags consecutive steps with no transport between them", () => {
    expect(codes(lineTwin({ transports: [] }))).toContain("workflow-no-route");
  });

  it("warns about SOP-only durations without blocking simulation", () => {
    const flow = workflow([["first", 100]]);
    const step = flow.steps[0]!;
    const twin = lineTwin({
      workflows: [{ ...flow, steps: [{ ...step, duration: { ...step.duration, source: "sop" } }] }],
    });
    const issues = validateTwin(twin);
    expect(issues.map((issue) => issue.code)).toContain("step-uncalibrated");
    expect(hasErrors(issues)).toBe(false);
  });

  it("warns about low-confidence entities", () => {
    const twin = lineTwin({
      zones: [zone("a", 0, { provenance: { evidence: [{ docId: "d", locator: "l" }], confidence: 0.3, status: "inferred" } })],
    });
    expect(codes(twin)).toContain("low-confidence");
  });
});

describe("workflow feasibility", () => {
  const chain = () =>
    lineTwin({
      instruments: [
        instrument("a1", "first", { x: 1 }),
        instrument("a2", "first", { x: 2 }),
        instrument("b1", "second", { x: 3 }),
      ],
      transports: [arm(["a2", "b1"])],
    });

  it("excludes an instrument no later step can be reached from", () => {
    const flow = chain().workflows[0]!;
    const feasible = feasibleInstruments(chain(), flow, createRouter(chain()));
    expect(feasible[0]?.map((item) => item.id)).toEqual(["a2"]);
  });

  it("flags a chain where every pair has a route but no end-to-end path exists", () => {
    const twin = lineTwin({
      instruments: [
        instrument("a", "first", { x: 1 }),
        instrument("b1", "second", { x: 2 }),
        instrument("b2", "second", { x: 3 }),
        instrument("c", "third", { x: 4 }),
      ],
      transports: [arm(["a", "b1"]), arm(["b2", "c"], { id: "arm2" })],
      workflows: [workflow([["first", 10], ["second", 10], ["third", 10]])],
    });
    expect(feasibleInstruments(twin, twin.workflows[0]!, createRouter(twin))[0]).toHaveLength(0);
    expect(codes(twin)).toContain("workflow-no-route");
  });

  it("does not relay a plate through an offline instrument", () => {
    const twin = lineTwin({
      instruments: [
        instrument("i1", "first", { x: 1 }),
        instrument("relay", "none", { x: 2, state: "offline" }),
        instrument("i2", "second", { x: 3 }),
      ],
      transports: [arm(["i1", "relay"]), arm(["relay", "i2"], { id: "arm2" })],
    });
    expect(planRoute(twin, "i1", "i2")).toBeNull();
  });
});
