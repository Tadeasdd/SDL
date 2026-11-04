import type { DurationFit } from "./evidence";

/**
 * The authored decisions for the example lab. Only the decisions are scripted: each entry still runs
 * through the real tool handlers, so citations, fits, validation and simulation are computed live.
 */

export type Fits = Record<string, DurationFit>;

export type ReplayStep = {
  thought?: string;
  tool: string;
  input: unknown | ((fits: Fits) => unknown);
};

const cite = (docId: string, locator: string, quote?: string) => ({ docId, locator, ...(quote ? { quote } : {}) });

const confirmed = (evidence: ReturnType<typeof cite>[], confidence = 0.97) => ({ evidence, confidence, status: "confirmed" });

const DRAWING = "Drawing A-104";

const zone = (id: string, name: string, kind: string, room: string, x: number, y: number, w: number, h: number) => ({
  tool: "upsert_zone",
  input: { id, name, kind, bounds: { x, y, w, h }, provenance: confirmed([cite("floorplan", `${DRAWING}, ${room}`, `id="${room}"`)], 0.99) },
});

const door = (id: string, zoneA: string, zoneB: string, x: number, y: number, widthMm: number) => ({
  tool: "upsert_door",
  input: { id, zoneA, zoneB, x, y, widthMm, provenance: confirmed([cite("floorplan", `${DRAWING}, ${id}`, `${id} ${widthMm} CLR`)], 0.98) },
});

type Kit = {
  id: string;
  name: string;
  model: string;
  category: string;
  zoneId: string;
  x: number;
  y: number;
  size: [number, number, number];
  capabilities: string[];
  capacity?: number;
  protocol: string;
  address: string;
  mtbfHours: number;
  mttrMinutes: number;
  state?: string;
  provenance?: unknown;
};

const instrument = ({ size: [w, d, h], capacity = 1, state = "online", provenance, ...kit }: Kit) => ({
  tool: "upsert_instrument",
  input: {
    ...kit,
    size: { w, d, h },
    capacity,
    state,
    provenance:
      provenance ??
      confirmed([
        cite("inventory", `row ${kit.id}`, `${kit.id},`),
        cite("network-scan", `device ${kit.id}`, `"tag": "${kit.id}"`),
        cite("floorplan", `${DRAWING}, ${kit.id}`, `id="${kit.id}"`),
      ]),
  },
});

const step = (fits: Fits, id: string, name: string, capability: string, log: string) => {
  const fit = fits[log] as DurationFit;
  return { id, name, capability, duration: { meanS: fit.meanS, sdS: fit.sdS, samples: fit.samples, source: "run-log" } };
};

const LOG_STEPS = [
  "plate-out", "compound-transfer", "seal", "incubate", "spin", "peel", "reagent-add", "read", "image", "archive",
  "mix-transfer", "amplify", "qc-read",
];

const reading = (docId: string, thought?: string): ReplayStep => ({ tool: "read_evidence", input: { docId }, thought });

const BAY = "z-bay";

export const REPLAY_SCRIPT: ReplayStep[] = [
  { thought: "Seven documents in the pack. I will read all of them before committing to anything, because registers and drawings age at different rates.", tool: "list_evidence", input: {} },
  reading("floorplan", "Starting with the drawing. It sets the coordinate frame: 1 m is 50 units, seven rooms, seven doors."),
  reading("inventory", "The register gives me names, models and claimed capacities. It lists 15 assets and marks every one In service, which is suspiciously clean."),
  reading("network-scan", "The scan disagrees with the register in three places: RDR-02 is unreachable, INC-01 reports 22 plates rather than 44, and CFG-01 is on the network but not in the register."),
  reading("sop-117", "SOP-117 gives the viability sequence and nominal times. It also says the arm places plates on the imager stage. I need to check that against the rail."),
  reading("sop-122"),
  reading("facilities", "The handover notes settle several questions: RDR-02 is out for repair, the AMR needs 900 mm and D-3 is 850 mm, and the rail ends in the bay, so the arm cannot serve the imager."),

  { ...zone(BAY, "Automation Bay", "automation", "RM-101", 0, 0, 13, 8), thought: "Laying out the shell from the drawing. Rooms and door widths are confirmed by the survey." },
  zone("z-prep", "Prep Lab", "wet", "RM-102", 13, 0, 7, 5),
  zone("z-imaging", "Imaging Room", "imaging", "RM-103", 13, 5, 7, 3),
  zone("z-cold", "Cold Room", "cold", "RM-104", 20, 0, 4, 4),
  zone("z-store", "Consumables Store", "storage", "RM-105", 20, 4, 4, 4),
  zone("z-corridor", "Service Corridor", "corridor", "RM-106", 0, 8, 24, 2.5),
  zone("z-office", "Write-up Office", "office", "RM-107", 0, 10.5, 9, 3.5),
  door("D-1", BAY, "z-corridor", 6, 8, 1400),
  door("D-2", BAY, "z-prep", 13, 2.5, 1000),
  door("D-3", BAY, "z-imaging", 13, 6.5, 850),
  door("D-4", "z-imaging", "z-corridor", 16.5, 8, 1000),
  door("D-5", "z-prep", "z-cold", 20, 2, 1000),
  door("D-6", "z-store", "z-corridor", 22, 8, 1000),
  door("D-7", "z-corridor", "z-office", 4, 10.5, 900),

  { ...instrument({ id: "HOT-01", name: "Plate Hotel", model: "HX-40 Hotel", category: "storage", zoneId: BAY, x: 1.5, y: 1.5, size: [1.2, 0.8, 1.6], capabilities: ["plate-supply"], capacity: 40, protocol: "SiLA2", address: "10.40.4.11", mtbfHours: 3000, mttrMinutes: 90 }), thought: "Placing equipment at its drawing position. Where the scan confirms a device, I take protocol and address from the scan." },
  instrument({ id: "LH-01", name: "Liquid Handler", model: "Tessel LH-96", category: "liquid-handler", zoneId: BAY, x: 3.8, y: 1.5, size: [1.8, 1, 1.1], capabilities: ["liquid-transfer"], protocol: "SiLA2", address: "10.40.4.12", mtbfHours: 310, mttrMinutes: 45 }),
  instrument({ id: "DSP-01", name: "Reagent Dispenser", model: "Quill D8", category: "dispenser", zoneId: BAY, x: 6.2, y: 1.5, size: [0.9, 0.7, 0.6], capabilities: ["reagent-dispense"], protocol: "SiLA2", address: "10.40.4.13", mtbfHours: 420, mttrMinutes: 30 }),
  instrument({ id: "SEAL-01", name: "Plate Sealer", model: "Thermaseal T2", category: "sealer", zoneId: BAY, x: 8, y: 1.5, size: [0.6, 0.6, 0.5], capabilities: ["seal"], protocol: "serial", address: "10.40.4.31:ttyS1", mtbfHours: 600, mttrMinutes: 20 }),
  instrument({ id: "PEEL-01", name: "Plate Peeler", model: "Thermaseal P2", category: "peeler", zoneId: BAY, x: 9.6, y: 1.5, size: [0.6, 0.6, 0.5], capabilities: ["peel"], protocol: "serial", address: "10.40.4.31:ttyS2", mtbfHours: 600, mttrMinutes: 20 }),
  {
    ...instrument({
      id: "INC-01", name: "CO2 Incubator", model: "Cyto 44", category: "incubator", zoneId: BAY, x: 3.2, y: 6.4, size: [1.5, 1.2, 1.9], capabilities: ["incubate"], capacity: 22, protocol: "SiLA2", address: "10.40.4.14", mtbfHours: 2400, mttrMinutes: 120,
      provenance: {
        evidence: [cite("network-scan", "device INC-01", '"plate_capacity": 22'), cite("inventory", "row INC-01", "Automated CO2 incubator,Cyto 44,Automation Bay,44")],
        confidence: 0.9,
        status: "conflict",
        note: "Register says 44. The device reports one cassette and 22 plates, and a live self-report outranks a 2023 register entry.",
      },
    }),
    thought: "INC-01: the register says 44 plates, the device says 22 with one cassette installed. A live self-report beats a 2023 register entry, so I model 22 and flag it.",
  },
  {
    ...instrument({
      id: "CFG-01", name: "Plate Centrifuge", model: "Spindle C2", category: "centrifuge", zoneId: BAY, x: 5.8, y: 6.4, size: [0.9, 0.9, 0.7], capabilities: ["spin"], capacity: 2, protocol: "OPC-UA", address: "10.40.4.15", mtbfHours: 900, mttrMinutes: 40,
      provenance: {
        evidence: [cite("network-scan", "device CFG-01", '"model": "Spindle C2"'), cite("floorplan", `${DRAWING}, CFG-01`, 'id="CFG-01"')],
        confidence: 0.82,
        status: "inferred",
        note: "Absent from the asset register. Exists on the drawing and answers on the network.",
      },
    }),
    thought: "CFG-01 is on the drawing and answers on the network, and SOP-117 needs a spin step, so it is real even though the register omits it. Rotor positions come from the device.",
  },
  instrument({ id: "RDR-01", name: "Plate Reader 1", model: "Lumen M5", category: "plate-reader", zoneId: BAY, x: 8, y: 6.4, size: [0.9, 0.8, 0.6], capabilities: ["read"], protocol: "SiLA2", address: "10.40.4.16", mtbfHours: 520, mttrMinutes: 60 }),
  {
    ...instrument({
      id: "RDR-02", name: "Plate Reader 2", model: "Lumen M5", category: "plate-reader", zoneId: BAY, x: 10, y: 6.4, size: [0.9, 0.8, 0.6], capabilities: ["read"], state: "offline", protocol: "SiLA2", address: "10.40.4.17", mtbfHours: 520, mttrMinutes: 60,
      provenance: {
        evidence: [cite("network-scan", "device RDR-02", '"status": "unreachable"'), cite("facilities", "RDR-02", "Unit is back with the vendor for repair"), cite("inventory", "row RDR-02", "RDR-02,Multimode plate reader")],
        confidence: 0.95,
        status: "conflict",
        note: "Register says In service. The device has been silent since 17 Oct and the notes confirm it left site.",
      },
    }),
    thought: "RDR-02 stays in the twin as an offline asset. Its bench and its capacity still exist, and a scenario can bring it back.",
  },
  instrument({ id: "NEST-01", name: "Transfer Nest", model: "Dock N1", category: "storage", zoneId: BAY, x: 11.9, y: 4, size: [0.5, 0.5, 0.9], capabilities: ["handoff"], capacity: 2, protocol: "manual", address: "none", mtbfHours: 3000, mttrMinutes: 90, provenance: confirmed([cite("inventory", "row NEST-01", "NEST-01,Transfer nest"), cite("floorplan", `${DRAWING}, NEST-01`, 'id="NEST-01"')], 0.93) }),
  instrument({ id: "IMG-01", name: "High-Content Imager", model: "Ocula HC", category: "imager", zoneId: "z-imaging", x: 17, y: 6.5, size: [1.6, 1.1, 1.3], capabilities: ["image"], protocol: "OPC-UA", address: "10.40.4.18", mtbfHours: 380, mttrMinutes: 75 }),
  instrument({ id: "TC-01", name: "Thermocycler 1", model: "Helix 384", category: "thermocycler", zoneId: "z-prep", x: 15, y: 1.5, size: [0.6, 0.7, 0.5], capabilities: ["amplify"], protocol: "serial", address: "10.40.4.32:ttyS1", mtbfHours: 1500, mttrMinutes: 60 }),
  instrument({ id: "TC-02", name: "Thermocycler 2", model: "Helix 384", category: "thermocycler", zoneId: "z-prep", x: 16.8, y: 1.5, size: [0.6, 0.7, 0.5], capabilities: ["amplify"], protocol: "serial", address: "10.40.4.32:ttyS2", mtbfHours: 1500, mttrMinutes: 60 }),
  instrument({ id: "FRZ-01", name: "-20C Plate Store", model: "Glacier S200", category: "storage", zoneId: "z-cold", x: 22.2, y: 1.8, size: [1.8, 1.2, 2], capabilities: ["cold-store"], capacity: 200, protocol: "OPC-UA", address: "10.40.4.19", mtbfHours: 3000, mttrMinutes: 90 }),

  {
    thought: "Transports next. The rail stops in the bay, so SOP-117's claim that the arm loads the imager cannot be true. Plates must go through NEST-01 and then the AMR.",
    tool: "upsert_transport",
    input: {
      id: "ARM-01", name: "Rail Arm", kind: "arm", speedMps: 0.6, handoffS: 6, capacity: 1, homeX: 6, homeY: 4,
      reach: ["HOT-01", "LH-01", "DSP-01", "SEAL-01", "PEEL-01", "INC-01", "CFG-01", "RDR-01", "RDR-02", "NEST-01"],
      provenance: confirmed([cite("facilities", "Arm", "Reach is limited to the Automation Bay"), cite("floorplan", `${DRAWING}, rail`, 'id="RAIL-ARM-01"')]),
    },
  },
  {
    tool: "upsert_transport",
    input: {
      id: "AMR-01", name: "Courier AMR", kind: "amr", speedMps: 0.5, handoffS: 18, capacity: 1, minDoorMm: 900, homeX: 11, homeY: 9.2,
      reach: ["NEST-01", "IMG-01", "FRZ-01", "TC-01", "TC-02"],
      provenance: confirmed([cite("facilities", "Mobile robot", "minimum clear door opening 900 mm"), cite("facilities", "Mobile robot", "Docks are fitted at NEST-01, IMG-01, FRZ-01, TC-01 and TC-02 only")]),
    },
  },
  {
    tool: "upsert_transport",
    input: {
      id: "TECH-1", name: "Shift Technician", kind: "human", speedMps: 1.2, handoffS: 20, capacity: 1, homeX: 4, homeY: 12,
      provenance: { evidence: [cite("facilities", "Staffing", "One technician on shift covers manual moves")], confidence: 0.8, status: "inferred", note: "Walking speed and hand-off are approximate." },
    },
  },

  ...LOG_STEPS.map((name, index): ReplayStep => ({
    tool: "fit_durations",
    input: { docId: "run-log", step: name },
    ...(index === 0 ? { thought: "SOP times are nominal. The run log has hundreds of timed steps, so I fit each one from data and exclude aborted runs." } : {}),
  })),

  {
    thought: "Workflows now use measured durations. Read is the big miss: 480 s on paper, far longer in the log.",
    tool: "upsert_workflow",
    input: (fits: Fits) => ({
      id: "wf-viability",
      name: "Viability Screen",
      steps: [
        step(fits, "plate-out", "Plate out", "plate-supply", "plate-out"),
        step(fits, "compound", "Compound transfer", "liquid-transfer", "compound-transfer"),
        step(fits, "seal", "Seal", "seal", "seal"),
        step(fits, "incubate", "Incubate", "incubate", "incubate"),
        step(fits, "spin", "Spin", "spin", "spin"),
        step(fits, "peel", "Peel", "peel", "peel"),
        step(fits, "reagent", "Reagent add", "reagent-dispense", "reagent-add"),
        step(fits, "read", "Read", "read", "read"),
        step(fits, "image", "Image", "image", "image"),
        step(fits, "archive", "Archive", "cold-store", "archive"),
      ],
      provenance: confirmed([cite("sop-117", "Sequence", "SOP-117 Rev 6"), cite("run-log", "steps, status OK")], 0.94),
    }),
  },
  {
    tool: "upsert_workflow",
    input: (fits: Fits) => ({
      id: "wf-amplicon",
      name: "Amplicon QC",
      steps: [
        step(fits, "plate-out", "Plate out", "plate-supply", "plate-out"),
        step(fits, "mix", "Master mix transfer", "liquid-transfer", "mix-transfer"),
        step(fits, "seal", "Seal", "seal", "seal"),
        step(fits, "amplify", "Amplify", "amplify", "amplify"),
        step(fits, "peel", "Peel", "peel", "peel"),
        step(fits, "qc-read", "QC read", "read", "qc-read"),
      ],
      provenance: confirmed([cite("sop-122", "Sequence", "SOP-122 Rev 3"), cite("run-log", "steps, status OK")], 0.94),
    }),
  },

  {
    thought: "Writing down every contradiction with how I resolved it, so a person can overrule me.",
    tool: "record_finding",
    input: {
      id: "F-1", severity: "critical", kind: "conflict", title: "RDR-02 is registered in service but has left the site",
      detail: "The asset register marks RDR-02 In service. It stopped answering on 17 Oct, and the handover notes say the lamp failed and the unit went back to the vendor.",
      entityIds: ["RDR-02"], resolution: "Modelled as offline. Read capacity is halved until it returns.",
      evidence: [cite("network-scan", "device RDR-02", '"last_seen": "2026-10-17T16:40:02Z"'), cite("facilities", "RDR-02", "Asset register has not been updated")],
    },
  },
  {
    tool: "record_finding",
    input: {
      id: "F-2", severity: "warning", kind: "constraint", title: "SOP-117 assumes the arm can load the imager",
      detail: "SOP-117 says the arm carries plates onto the imager stage. The rail ends in the Automation Bay and the imager is in another room.",
      entityIds: ["ARM-01", "IMG-01", "NEST-01"], resolution: "Routed through NEST-01 and AMR-01. SOP-117 should be corrected.",
      evidence: [cite("sop-117", "Transfers", "including onto the imager stage"), cite("facilities", "Arm", "Reach is limited to the Automation Bay")],
    },
  },
  {
    tool: "record_finding",
    input: {
      id: "F-3", severity: "warning", kind: "constraint", title: "Door D-3 is too narrow for the AMR",
      detail: "D-3 is the short path between the bay and the imager, with an 850 mm clear opening. The AMR needs 900 mm, so it takes the corridor through D-1 and D-4.",
      entityIds: ["D-3", "AMR-01"], resolution: "Router excludes D-3 for AMR-01. Widening it is a candidate intervention.",
      evidence: [cite("facilities", "Door survey", "measured clear opening 850 mm"), cite("facilities", "Mobile robot", "minimum clear door opening 900 mm")],
    },
  },
  {
    tool: "record_finding",
    input: {
      id: "F-4", severity: "warning", kind: "conflict", title: "INC-01 holds half its registered capacity",
      detail: "The register records 44 plates. The incubator reports one cassette installed and a capacity of 22.",
      entityIds: ["INC-01"], resolution: "Modelled at 22 plates, from the device self-report.",
      evidence: [cite("network-scan", "device INC-01", '"cassettes_installed": 1'), cite("inventory", "row INC-01", "Cyto 44,Automation Bay,44")],
    },
  },
  {
    tool: "record_finding",
    input: {
      id: "F-5", severity: "warning", kind: "gap", title: "CFG-01 is missing from the asset register",
      detail: "The centrifuge is on the drawing, answers on OPC-UA and is required by SOP-117, but has no asset record. Its service history is unknown, so its reliability figures are class averages.",
      entityIds: ["CFG-01"], resolution: "Added with confidence 0.82. It should be registered.",
      evidence: [cite("network-scan", "device CFG-01", '"tag": "CFG-01"'), cite("floorplan", `${DRAWING}, CFG-01`, 'id="CFG-01"')],
    },
  },
  {
    tool: "record_finding",
    input: (fits: Fits) => ({
      id: "F-6", severity: "warning", kind: "calibration", title: "Plate reads take far longer than the SOP states",
      detail: `SOP-117 allows 8 min per read. ${fits.read?.samples} logged reads average ${fits.read?.meanS} s. Imaging also runs over, at ${fits.image?.meanS} s against 420 s.`,
      entityIds: ["RDR-01", "IMG-01", "wf-viability"], resolution: "All workflow steps use run-log fits, not SOP times.",
      evidence: [cite("sop-117", "Sequence, step 8", "| 8 | Read | read | Plate reader | 8 min |"), cite("run-log", "step = read, status OK")],
    }),
  },

  { thought: "Checking the twin before I trust it.", tool: "validate_twin", input: {} },
  { thought: "No blocking issues. A quick simulation is the plausibility check: if the bottleneck looks absurd, the twin is wrong.", tool: "run_simulation", input: { workflowId: "wf-viability", plates: 24, intervalS: 300 } },
  {
    tool: "finish_mapping",
    input: { summary: "Mapped 7 zones, 7 doors, 14 instruments, 3 transports and 2 workflows from 7 documents. Six findings need a human decision, chiefly that read capacity is half what the register implies and that measured read times run well past the SOP." },
  },
];
