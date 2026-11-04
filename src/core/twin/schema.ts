import { z } from "zod";

/** All distances are metres and all durations seconds unless a field name says otherwise. */

const Id = z.string().min(1).max(64);

export const EvidenceRefSchema = z.object({
  docId: Id,
  locator: z.string().min(1).max(160),
  quote: z.string().trim().min(1).max(400).optional(),
});

export const ProvenanceSchema = z.object({
  evidence: z.array(EvidenceRefSchema).min(1),
  confidence: z.number().min(0).max(1),
  status: z.enum(["confirmed", "inferred", "conflict"]),
  note: z.string().max(400).optional(),
});

export const ZoneKindSchema = z.enum(["automation", "wet", "imaging", "cold", "storage", "corridor", "office"]);

export const ZoneSchema = z.object({
  id: Id,
  name: z.string().min(1).max(80),
  kind: ZoneKindSchema,
  bounds: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number().positive(),
    h: z.number().positive(),
  }),
  provenance: ProvenanceSchema,
});

export const DoorSchema = z.object({
  id: Id,
  zoneA: Id,
  zoneB: Id,
  x: z.number(),
  y: z.number(),
  widthMm: z.number().positive(),
  provenance: ProvenanceSchema,
});

export const InstrumentCategorySchema = z.enum([
  "liquid-handler",
  "dispenser",
  "incubator",
  "plate-reader",
  "imager",
  "centrifuge",
  "sealer",
  "peeler",
  "thermocycler",
  "storage",
  "washer",
]);

export const InstrumentSchema = z.object({
  id: Id,
  name: z.string().min(1).max(80),
  model: z.string().max(80),
  category: InstrumentCategorySchema,
  zoneId: Id,
  x: z.number(),
  y: z.number(),
  size: z.object({ w: z.number().positive(), d: z.number().positive(), h: z.number().positive() }),
  capabilities: z.array(z.string().min(1).max(40)).min(1),
  capacity: z.number().int().min(1),
  state: z.enum(["online", "degraded", "offline"]),
  protocol: z.enum(["SiLA2", "OPC-UA", "serial", "manual"]),
  address: z.string().max(80).optional(),
  mtbfHours: z.number().positive(),
  mttrMinutes: z.number().positive(),
  provenance: ProvenanceSchema,
});

export const TransportSchema = z.object({
  id: Id,
  name: z.string().min(1).max(80),
  kind: z.enum(["arm", "amr", "human"]),
  speedMps: z.number().positive(),
  handoffS: z.number().min(0),
  capacity: z.number().int().min(1),
  /** Instruments this transport can serve. Arms: physical reach. AMRs: docking points. Empty on a mobile transport means anywhere. */
  reach: z.array(Id).default([]),
  /** Mobile transports only: the narrowest door they can pass. */
  minDoorMm: z.number().positive().optional(),
  homeX: z.number(),
  homeY: z.number(),
  provenance: ProvenanceSchema,
});

export const DurationSchema = z.object({
  meanS: z.number().positive(),
  sdS: z.number().min(0),
  samples: z.number().int().min(0).default(0),
  source: z.enum(["sop", "run-log"]),
});

export const StepSchema = z.object({
  id: Id,
  name: z.string().min(1).max(80),
  capability: z.string().min(1).max(40),
  duration: DurationSchema,
});

export const WorkflowSchema = z.object({
  id: Id,
  name: z.string().min(1).max(80),
  steps: z.array(StepSchema).min(1),
  provenance: ProvenanceSchema,
});

export const FindingSchema = z.object({
  id: Id,
  severity: z.enum(["info", "warning", "critical"]),
  kind: z.enum(["conflict", "gap", "constraint", "calibration"]),
  title: z.string().min(1).max(120),
  detail: z.string().min(1).max(600),
  entityIds: z.array(Id).default([]),
  resolution: z.string().max(400).optional(),
  evidence: z.array(EvidenceRefSchema).min(1),
});

export const LabTwinSchema = z.object({
  id: Id,
  name: z.string().min(1).max(120),
  zones: z.array(ZoneSchema),
  doors: z.array(DoorSchema),
  instruments: z.array(InstrumentSchema),
  transports: z.array(TransportSchema),
  workflows: z.array(WorkflowSchema),
  findings: z.array(FindingSchema),
});

export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type Zone = z.infer<typeof ZoneSchema>;
export type Door = z.infer<typeof DoorSchema>;
export type Instrument = z.infer<typeof InstrumentSchema>;
export type InstrumentCategory = z.infer<typeof InstrumentCategorySchema>;
export type Transport = z.infer<typeof TransportSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type LabTwin = z.infer<typeof LabTwinSchema>;
