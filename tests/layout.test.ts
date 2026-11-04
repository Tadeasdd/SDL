import { describe, expect, it } from "vitest";
import { benchesOf, BENCH_HEIGHT, closeViewOf, dockOf, facingOf, mountOf, topOf, wallRunsOf } from "@/components/scene/layout";
import { dockBlend } from "@/components/scene/motion";
import { replayEvents, twinFromEvents } from "@/core/agent/replay";
import { loadExampleDocs } from "@/lib/load-example";
import type { LabTwin } from "@/core/twin/schema";

const example = (): LabTwin => {
  const twin = twinFromEvents(replayEvents(loadExampleDocs()));
  if (twin === null) throw new Error("replay did not finish");
  return twin;
};
const byId = (twin: LabTwin, id: string) => {
  const found = twin.instruments.find((item) => item.id === id);
  if (found === undefined) throw new Error(id);
  return found;
};

/** Published arm reach, plus the plate gripper. */
const ARM_REACH_M = 0.85 + 0.15;

describe("example lab layout", () => {
  it("keeps every arm-served station inside the arm's real reach of the rail", () => {
    const twin = example();
    const arm = twin.transports.find((item) => item.kind === "arm");
    const stations = twin.instruments.filter((item) => arm?.reach.includes(item.id));
    expect(stations.length).toBeGreaterThan(0);
    for (const item of stations) {
      const dock = dockOf(twin, item);
      expect(Math.abs(dock.y - (arm?.homeY ?? 0)), item.id).toBeLessThan(ARM_REACH_M);
    }
  });

  it("uses the real CLARIOstar Plus footprint for both readers", () => {
    const twin = example();
    for (const id of ["RDR-01", "RDR-02"]) {
      expect(byId(twin, id).model).toBe("BMG LABTECH CLARIOstar Plus");
      expect(byId(twin, id).size).toEqual({ w: 0.45, d: 0.51, h: 0.4 });
    }
  });

  it("keeps the incubator's 44 versus 22 conflict true to its two 22-plate cassettes", () => {
    expect(byId(example(), "INC-01")).toMatchObject({ model: "LiCONiC STX44", capacity: 22 });
  });

  it("faces each arm-served instrument at the rail", () => {
    const twin = example();
    expect(facingOf(twin, byId(twin, "LH-01"))).toBe(1);
    expect(facingOf(twin, byId(twin, "RDR-01"))).toBe(-1);
  });

  it("faces instruments outside the arm's reach into their room", () => {
    const twin = example();
    expect(facingOf(twin, byId(twin, "TC-01"))).toBe(1);
  });

  it("stands tall kit on the floor and short kit on a bench", () => {
    const twin = example();
    expect(mountOf(byId(twin, "FRZ-01"))).toBe(0);
    expect(mountOf(byId(twin, "RDR-01"))).toBe(BENCH_HEIGHT);
    expect(topOf(byId(twin, "RDR-01"))).toBeCloseTo(BENCH_HEIGHT + 0.4);
  });

  it("puts every bench-top instrument on a bench", () => {
    const twin = example();
    const benches = benchesOf(twin);
    for (const item of twin.instruments.filter((candidate) => mountOf(candidate) > 0)) {
      const under = benches.some((bench) => Math.abs(item.x - bench.x) <= bench.w / 2 && Math.abs(item.y - bench.y) <= bench.d / 2);
      expect(under, item.id).toBe(true);
    }
  });

  it("merges each side of the rail into one long bench", () => {
    const twin = example();
    const wide = benchesOf(twin).filter((bench) => bench.w > 3);
    expect(wide).toHaveLength(2);
  });

  it("leaves a gap in the walls at every door", () => {
    const twin = example();
    const runs = wallRunsOf(twin);
    for (const door of twin.doors) {
      const blocked = runs.some(({ from, to }) =>
        Math.min(from.x, to.x) < door.x + 0.01 && door.x - 0.01 < Math.max(from.x, to.x) &&
        Math.min(from.y, to.y) < door.y + 0.01 && door.y - 0.01 < Math.max(from.y, to.y));
      expect(blocked, door.id).toBe(false);
    }
  });
});

describe("walls", () => {
  it("emits a wall shared by two rooms only once", () => {
    const runs = wallRunsOf(example());
    const keys = runs.map(({ from, to }) => `${from.x}:${from.y}:${to.x}:${to.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("closeViewOf", () => {
  it("looks at the front of the instrument from the rail side", () => {
    const twin = example();
    expect(closeViewOf(twin, byId(twin, "RDR-01")).offset[2]).toBeLessThan(0);
    expect(closeViewOf(twin, byId(twin, "LH-01")).offset[2]).toBeGreaterThan(0);
  });

  it("backs off further for larger instruments", () => {
    const twin = example();
    const [small] = closeViewOf(twin, byId(twin, "RDR-01")).offset;
    const [large] = closeViewOf(twin, byId(twin, "LH-01")).offset;
    expect(Math.abs(large)).toBeGreaterThan(Math.abs(small));
  });
});

describe("dockBlend", () => {
  it("is 1 at both ends of a transfer and 0 mid-flight", () => {
    expect(dockBlend(0)).toBe(1);
    expect(dockBlend(1)).toBe(1);
    expect(dockBlend(0.5)).toBe(0);
  });
});
