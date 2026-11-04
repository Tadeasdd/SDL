import type { Door, Instrument, LabTwin, Provenance, Transport, Workflow, Zone } from "@/core/twin/schema";

export const provenance: Provenance = {
  evidence: [{ docId: "doc", locator: "line 1" }],
  confidence: 0.9,
  status: "confirmed",
};

export const zone = (id: string, x: number, overrides: Partial<Zone> = {}): Zone => ({
  id,
  name: id,
  kind: "automation",
  bounds: { x, y: 0, w: 10, h: 10 },
  provenance,
  ...overrides,
});

export const door = (id: string, zoneA: string, zoneB: string, widthMm = 1000): Door => ({
  id,
  zoneA,
  zoneB,
  x: 10,
  y: 5,
  widthMm,
  provenance,
});

export const instrument = (id: string, capability: string, overrides: Partial<Instrument> = {}): Instrument => ({
  id,
  name: id,
  model: "M",
  category: "plate-reader",
  zoneId: "a",
  x: 2,
  y: 2,
  size: { w: 1, d: 1, h: 1 },
  capabilities: [capability],
  capacity: 1,
  state: "online",
  protocol: "SiLA2",
  mtbfHours: 1_000_000,
  mttrMinutes: 30,
  provenance,
  ...overrides,
});

export const arm = (reach: string[], overrides: Partial<Transport> = {}): Transport => ({
  id: "arm",
  name: "Arm",
  kind: "arm",
  speedMps: 1,
  handoffS: 5,
  capacity: 1,
  reach,
  homeX: 0,
  homeY: 0,
  provenance,
  ...overrides,
});

export const amr = (overrides: Partial<Transport> = {}): Transport => ({
  id: "amr",
  name: "AMR",
  kind: "amr",
  speedMps: 1,
  handoffS: 10,
  capacity: 1,
  reach: [],
  minDoorMm: 900,
  homeX: 1,
  homeY: 1,
  provenance,
  ...overrides,
});

export const workflow = (capabilities: [string, number][]): Workflow => ({
  id: "wf",
  name: "Flow",
  steps: capabilities.map(([capability, meanS], index) => ({
    id: `s${index}`,
    name: `Step ${index}`,
    capability,
    duration: { meanS, sdS: 0, samples: 10, source: "run-log" as const },
  })),
  provenance,
});

/** Two-instrument line served by a single arm: a -> b. */
export const lineTwin = (overrides: Partial<LabTwin> = {}): LabTwin => ({
  id: "t",
  name: "T",
  zones: [zone("a", 0)],
  doors: [],
  instruments: [instrument("i1", "first", { x: 2 }), instrument("i2", "second", { x: 6 })],
  transports: [arm(["i1", "i2"])],
  workflows: [workflow([["first", 100], ["second", 100]])],
  findings: [],
  ...overrides,
});
