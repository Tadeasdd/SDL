import type { Door, Finding, Instrument, LabTwin, Transport, Workflow, Zone } from "./schema";

/** Every mutation returns a new twin. The input is never modified. */

type Keyed = { id: string };

const upsert = <T extends Keyed>(items: readonly T[], item: T): T[] => {
  const exists = items.some((existing) => existing.id === item.id);
  return exists ? items.map((existing) => (existing.id === item.id ? item : existing)) : [...items, item];
};

export const emptyTwin = (id: string, name: string): LabTwin => ({
  id,
  name,
  zones: [],
  doors: [],
  instruments: [],
  transports: [],
  workflows: [],
  findings: [],
});

export const upsertZone = (twin: LabTwin, zone: Zone): LabTwin => ({ ...twin, zones: upsert(twin.zones, zone) });
export const upsertDoor = (twin: LabTwin, door: Door): LabTwin => ({ ...twin, doors: upsert(twin.doors, door) });
export const upsertInstrument = (twin: LabTwin, instrument: Instrument): LabTwin => ({
  ...twin,
  instruments: upsert(twin.instruments, instrument),
});
export const upsertTransport = (twin: LabTwin, transport: Transport): LabTwin => ({
  ...twin,
  transports: upsert(twin.transports, transport),
});
export const upsertWorkflow = (twin: LabTwin, workflow: Workflow): LabTwin => ({
  ...twin,
  workflows: upsert(twin.workflows, workflow),
});
export const upsertFinding = (twin: LabTwin, finding: Finding): LabTwin => ({
  ...twin,
  findings: upsert(twin.findings, finding),
});

export const entityCount = (twin: LabTwin): number =>
  twin.zones.length + twin.doors.length + twin.instruments.length + twin.transports.length + twin.workflows.length;
