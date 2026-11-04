import { writeFileSync } from "node:fs";
import { createRng, sampleNormal } from "../src/core/sim/random";

/** The "true" behaviour of the fictional lab, which the agent must recover from this log. */
const VIABILITY: [string, string, number, number][] = [
  ["plate-out", "HOT-01", 31, 2], ["compound-transfer", "LH-01", 262, 18], ["seal", "SEAL-01", 18, 1.5],
  ["incubate", "INC-01", 1800, 30], ["spin", "CFG-01", 124, 6], ["peel", "PEEL-01", 22, 2],
  ["reagent-add", "DSP-01", 78, 5], ["read", "RDR-01", 610, 38], ["image", "IMG-01", 455, 34],
  ["archive", "FRZ-01", 30, 3],
];
const AMPLICON: [string, string, number, number][] = [
  ["plate-out", "HOT-01", 31, 2], ["mix-transfer", "LH-01", 190, 12], ["seal", "SEAL-01", 18, 1.5],
  ["amplify", "TC-01", 3420, 40], ["peel", "PEEL-01", 22, 2], ["qc-read", "RDR-01", 184, 9],
];
const ABORT_RATE = 0.03;
const RUN_START = Date.UTC(2026, 8, 7, 8, 0, 0);

const rng = createRng(20261028);
const rows: string[] = ["timestamp,run,plate,step,instrument,duration_s,status"];

const logPlate = (run: string, plate: string, startMs: number, steps: typeof VIABILITY): void => {
  let clock = startMs;
  for (const [step, instrument, mean, sd] of steps) {
    const isAbort = rng() < ABORT_RATE;
    const measured = Math.max(1, sampleNormal(rng, mean, sd));
    const duration = isAbort ? measured * 0.2 : measured;
    rows.push(`${new Date(clock).toISOString()},${run},${plate},${step},${instrument},${duration.toFixed(1)},${isAbort ? "ABORT" : "OK"}`);
    clock += (duration + 40) * 1000;
    if (isAbort) return;
  }
};

for (let index = 0; index < 48; index += 1) {
  logPlate(`CV-${String(Math.floor(index / 8) + 1).padStart(3, "0")}`, `P${String(index + 1).padStart(4, "0")}`, RUN_START + index * 540_000, VIABILITY);
}
for (let index = 0; index < 16; index += 1) {
  logPlate(`AQ-${String(Math.floor(index / 4) + 1).padStart(3, "0")}`, `Q${String(index + 1).padStart(4, "0")}`, RUN_START + 86_400_000 * 2 + index * 900_000, AMPLICON);
}

writeFileSync("examples/aldermoor-bay-4/evidence/run-log.csv", `${rows.join("\n")}\n`);
