import { planRoute } from "./routing";
import type { Instrument, LabTwin, Workflow, Zone } from "./schema";

export type Issue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  entityId?: string;
};

const EDGE_TOLERANCE_M = 0.05;

const inside = (zone: Zone, x: number, y: number): boolean =>
  x >= zone.bounds.x - EDGE_TOLERANCE_M &&
  x <= zone.bounds.x + zone.bounds.w + EDGE_TOLERANCE_M &&
  y >= zone.bounds.y - EDGE_TOLERANCE_M &&
  y <= zone.bounds.y + zone.bounds.h + EDGE_TOLERANCE_M;

const duplicateIds = (twin: LabTwin): Issue[] => {
  const ids = [...twin.zones, ...twin.doors, ...twin.instruments, ...twin.transports, ...twin.workflows].map(
    (entity) => entity.id,
  );
  const repeated = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  return repeated.map((id) => ({
    severity: "error",
    code: "duplicate-id",
    message: `Id ${id} is used by more than one entity.`,
    entityId: id,
  }));
};

const doorIssues = (twin: LabTwin): Issue[] => {
  const zoneIds = new Set(twin.zones.map((zone) => zone.id));
  return twin.doors.flatMap((door) =>
    [door.zoneA, door.zoneB]
      .filter((zoneId) => !zoneIds.has(zoneId))
      .map((zoneId): Issue => ({
        severity: "error",
        code: "door-unknown-zone",
        message: `Door ${door.id} references unknown zone ${zoneId}.`,
        entityId: door.id,
      })),
  );
};

const placementIssues = (twin: LabTwin, instrument: Instrument): Issue[] => {
  const zone = twin.zones.find((candidate) => candidate.id === instrument.zoneId);
  if (zone === undefined) {
    return [{
      severity: "error",
      code: "instrument-unknown-zone",
      message: `${instrument.id} references unknown zone ${instrument.zoneId}.`,
      entityId: instrument.id,
    }];
  }
  if (inside(zone, instrument.x, instrument.y)) return [];
  return [{
    severity: "error",
    code: "instrument-outside-zone",
    message: `${instrument.id} sits outside ${zone.name}.`,
    entityId: instrument.id,
  }];
};

const reachIssues = (twin: LabTwin): Issue[] => {
  const instrumentIds = new Set(twin.instruments.map((instrument) => instrument.id));
  return twin.transports.flatMap((transport) =>
    transport.reach
      .filter((id) => !instrumentIds.has(id))
      .map((id): Issue => ({
        severity: "error",
        code: "transport-unknown-instrument",
        message: `${transport.id} reach lists unknown instrument ${id}.`,
        entityId: transport.id,
      })),
  );
};

const usable = (twin: LabTwin, capability: string): Instrument[] =>
  twin.instruments.filter((item) => item.state !== "offline" && item.capabilities.includes(capability));

const continuityIssue = (twin: LabTwin, workflow: Workflow, index: number): Issue[] => {
  const from = workflow.steps[index];
  const to = workflow.steps[index + 1];
  if (from === undefined || to === undefined) return [];
  const connected = usable(twin, from.capability).some((source) =>
    usable(twin, to.capability).some((target) => planRoute(twin, source.id, target.id) !== null),
  );
  if (connected) return [];
  return [{
    severity: "error",
    code: "workflow-no-route",
    message: `${workflow.name}: no transport path from "${from.name}" to "${to.name}".`,
    entityId: workflow.id,
  }];
};

const workflowIssues = (twin: LabTwin, workflow: Workflow): Issue[] => {
  const missing = workflow.steps
    .filter((step) => usable(twin, step.capability).length === 0)
    .map((step): Issue => ({
      severity: "error",
      code: "workflow-no-instrument",
      message: `${workflow.name}: nothing online provides "${step.capability}" for step "${step.name}".`,
      entityId: workflow.id,
    }));
  if (missing.length > 0) return missing;

  const sopOnly = workflow.steps
    .filter((step) => step.duration.source === "sop")
    .map((step): Issue => ({
      severity: "warning",
      code: "step-uncalibrated",
      message: `${workflow.name}: "${step.name}" uses the SOP duration, not measured data.`,
      entityId: workflow.id,
    }));
  return [...workflow.steps.flatMap((_, index) => continuityIssue(twin, workflow, index)), ...sopOnly];
};

const lowConfidence = (twin: LabTwin): Issue[] =>
  [...twin.zones, ...twin.instruments, ...twin.transports]
    .filter((entity) => entity.provenance.confidence < 0.5)
    .map((entity) => ({
      severity: "warning",
      code: "low-confidence",
      message: `${entity.id} has confidence below 0.5.`,
      entityId: entity.id,
    }));

/** Semantic checks the schema cannot express. Errors block simulation, warnings do not. */
export const validateTwin = (twin: LabTwin): Issue[] => [
  ...duplicateIds(twin),
  ...doorIssues(twin),
  ...twin.instruments.flatMap((instrument) => placementIssues(twin, instrument)),
  ...reachIssues(twin),
  ...twin.workflows.flatMap((workflow) => workflowIssues(twin, workflow)),
  ...lowConfidence(twin),
];

export const hasErrors = (issues: readonly Issue[]): boolean => issues.some((issue) => issue.severity === "error");
