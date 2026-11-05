import type { LabTwin, Workflow } from "../twin/schema";
import { createRng, sampleNormal } from "./random";
import type { SimResult } from "./types";

/**
 * A synthetic viability assay, so the effect of a schedule on data quality can be seen. Every readout here
 * is generated. The curve shapes are standard; the sensitivity of signal to waiting is an invented assumption.
 */

export const ROWS = 16;
export const COLUMNS = 24;
export const DOSES = 10;
const TOP_DOSE_UM = 30;
const DILUTION = 3;
const REPLICATES = 2;
const FIRST_DOSE_COLUMN = 2;
const HIGH_SIGNAL = 100_000;
const LOW_SIGNAL = 6_000;
const HILL = 1.2;
const REFERENCE_IC50_UM = 1;
/** An interior row, so the reference curve is clear of edge evaporation. */
const REFERENCE_ROW = 8;
const BASE_CV = 0.035;
const CV_PER_LATE_MIN = 0.0009;
const SIGNAL_LOSS_PER_LATE_MIN = 0.0025;
const MAX_SIGNAL_LOSS = 0.5;
const EDGE_GAIN_PER_LATE_MIN = 0.002;
const PLATE_STREAM = 7_919;
const Z_PRIME_PASS = 0.5;

/** SOP-117: "Plates must not wait more than 45 minutes unsealed after step 6". */
export const UNSEALED_LIMIT_MIN = 45;

export type AssayPlate = { plateId: number; delayMin: number; readEndS: number; zPrime: number; isOverLimit: boolean; passes: boolean };

export type AssaySummary = { plates: AssayPlate[]; passShare: number; overLimitShare: number; meanDelayMin: number; meanZPrime: number };

export type PlateData = { wells: number[]; high: number; low: number; curve: { doseUm: number; viability: number }[]; ic50Um: number | null };

const doseAt = (index: number): number => TOP_DOSE_UM / DILUTION ** index;

const compoundIc50 = (row: number): number => (row === REFERENCE_ROW ? REFERENCE_IC50_UM : 0.02 * 2.1 ** ((row * 7) % ROWS));

const isEdge = (row: number, column: number): boolean => row === 0 || row === ROWS - 1 || column === 0 || column === COLUMNS - 1;

const trueSignal = (row: number, column: number): number => {
  if (column < FIRST_DOSE_COLUMN) return HIGH_SIGNAL;
  if (column >= COLUMNS - FIRST_DOSE_COLUMN) return LOW_SIGNAL;
  const dose = doseAt(Math.floor((column - FIRST_DOSE_COLUMN) / REPLICATES));
  return LOW_SIGNAL + (HIGH_SIGNAL - LOW_SIGNAL) / (1 + (dose / compoundIc50(row)) ** HILL);
};

const stats = (values: readonly number[]): { mean: number; sd: number } => {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { mean, sd: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1)) };
};

const controls = (wells: readonly number[], isHigh: boolean): number[] =>
  wells.filter((_, index) => {
    const column = index % COLUMNS;
    return isHigh ? column < FIRST_DOSE_COLUMN : column >= COLUMNS - FIRST_DOSE_COLUMN;
  });

/** Assay window quality. Above 0.5 is the conventional bar for a screening plate. */
export const zPrimeOf = (high: readonly number[], low: readonly number[]): number => {
  const a = stats(high);
  const b = stats(low);
  return 1 - (3 * (a.sd + b.sd)) / Math.max(Math.abs(a.mean - b.mean), Number.EPSILON);
};

/** Where a falling curve crosses 50%, interpolated on log dose. */
export const interpolateIc50 = (curve: readonly { doseUm: number; viability: number }[]): number | null => {
  const rising = [...curve].sort((a, b) => a.doseUm - b.doseUm);
  for (let index = 1; index < rising.length; index += 1) {
    const before = rising[index - 1] as { doseUm: number; viability: number };
    const after = rising[index] as { doseUm: number; viability: number };
    if (before.viability >= 50 && after.viability < 50) {
      const share = (before.viability - 50) / (before.viability - after.viability);
      return 10 ** (Math.log10(before.doseUm) + share * (Math.log10(after.doseUm) - Math.log10(before.doseUm)));
    }
  }
  return null;
};

/** Generates one plate's 384 wells. The same plate, delay and seed always give the same data. */
export const plateData = (plateId: number, delayMin: number, seed: number): PlateData => {
  const rng = createRng(Math.imul(seed, PLATE_STREAM) + plateId);
  const late = Math.max(0, delayMin - UNSEALED_LIMIT_MIN);
  const keep = 1 - Math.min(MAX_SIGNAL_LOSS, late * SIGNAL_LOSS_PER_LATE_MIN);
  const cv = BASE_CV + late * CV_PER_LATE_MIN;
  const wells = Array.from({ length: ROWS * COLUMNS }, (_, index) => {
    const row = Math.floor(index / COLUMNS);
    const column = index % COLUMNS;
    const edge = isEdge(row, column) ? 1 + late * EDGE_GAIN_PER_LATE_MIN : 1;
    const signal = trueSignal(row, column) * keep * edge;
    return Math.max(0, sampleNormal(rng, signal, signal * cv));
  });
  const high = stats(controls(wells, true)).mean;
  const low = stats(controls(wells, false)).mean;
  const span = Math.max(high - low, Number.EPSILON);
  const curve = Array.from({ length: DOSES }, (_, dose) => {
    const well = REFERENCE_ROW * COLUMNS + FIRST_DOSE_COLUMN + dose * REPLICATES;
    const mean = ((wells[well] as number) + (wells[well + 1] as number)) / REPLICATES;
    return { doseUm: doseAt(dose), viability: ((mean - low) / span) * 100 };
  });
  return { wells, high, low, curve, ic50Um: interpolateIc50(curve) };
};

const stepWith = (workflow: Workflow, capability: string) => workflow.steps.find((step) => step.capability === capability);

/** The screening workflow: a plate that is peeled, dosed with reagent and read. */
const assayWorkflow = (twin: LabTwin): Workflow | undefined =>
  twin.workflows.find((item) => stepWith(item, "peel") && stepWith(item, "read") && stepWith(item, "reagent-dispense"));

const withWorkflow = (twin: LabTwin, run: SimResult, seed: number): AssayPlate[] => {
  const workflow = assayWorkflow(twin);
  const peel = workflow && stepWith(workflow, "peel");
  const read = workflow && stepWith(workflow, "read");
  if (workflow === undefined || peel === undefined || read === undefined) return [];
  const process = run.segments.filter((item) => item.kind === "process" && item.workflowId === workflow.id);
  const peelEnds = new Map(process.filter((item) => item.stepId === peel.id).map((item) => [item.plateId, item.end]));
  return process.filter((item) => item.stepId === read.id).flatMap((item) => {
    const peeledAt = peelEnds.get(item.plateId);
    if (peeledAt === undefined) return [];
    const delayMin = (item.start - peeledAt) / 60;
    const { wells } = plateData(item.plateId, delayMin, seed);
    const zPrime = zPrimeOf(controls(wells, true), controls(wells, false));
    return [{ plateId: item.plateId, delayMin, readEndS: item.end, zPrime, isOverLimit: delayMin > UNSEALED_LIMIT_MIN, passes: zPrime >= Z_PRIME_PASS }];
  }).sort((a, b) => a.readEndS - b.readEndS);
};

export const assaySummary = (twin: LabTwin, run: SimResult, seed: number): AssaySummary | null => {
  const plates = withWorkflow(twin, run, seed);
  if (plates.length === 0) return null;
  const share = (test: (plate: AssayPlate) => boolean): number => plates.filter(test).length / plates.length;
  const mean = (read: (plate: AssayPlate) => number): number => plates.reduce((sum, plate) => sum + read(plate), 0) / plates.length;
  return { plates, passShare: share((plate) => plate.passes), overLimitShare: share((plate) => plate.isOverLimit), meanDelayMin: mean((plate) => plate.delayMin), meanZPrime: mean((plate) => plate.zPrime) };
};
