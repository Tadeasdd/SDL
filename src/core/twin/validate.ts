import { blockedStep, feasibleInstruments } from "./feasible";
import { createRouter } from "./routing";
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

const workflowIssues = (twin: LabTwin, workflow: Workflow): Issue[] => {
  const feasible = feasibleInstruments(twin, workflow, createRouter(twin));
  const blocked = blockedStep(feasible);
  const step = workflow.steps[blocked];
  if (step !== undefined) {
    const hasInstrument = twin.instruments.some((item) => item.state !== "offline" && item.capabilities.includes(step.capability));
    return [{
      severity: "error",
      code: hasInstrument ? "workflow-no-route" : "workflow-no-instrument",
      message: hasInstrument
        ? `${workflow.name}: no transport path onward from "${step.name}".`
        : `${workflow.name}: nothing online provides "${step.capability}" for step "${step.name}".`,
      entityId: workflow.id,
    }];
  }
  return workflow.steps
    .filter((item) => item.duration.source === "sop")
    .map((item): Issue => ({
      severity: "warning",
      code: "step-uncalibrated",
      message: `${workflow.name}: "${item.name}" uses the SOP duration, not measured data.`,
      entityId: workflow.id,
    }));
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
