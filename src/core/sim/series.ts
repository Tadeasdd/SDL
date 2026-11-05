import type { Segment, SimResult } from "./types";

/** A value that holds from t[i] until t[i + 1]. */
export type StepSeries = { t: number[]; v: number[] };

export type Band = { t: number[]; p5: number[]; p95: number[] };

export type PlateRecord = {
  plateId: number;
  workflowId: string;
  startS: number;
  endS: number;
  cycleS: number;
  waitS: number;
  failures: number;
};

const LOW_SHARE = 0.05;
const HIGH_SHARE = 0.95;

const summarise = (plateId: number, segments: readonly Segment[]): PlateRecord => {
  const startS = Math.min(...segments.map((item) => item.start));
  const endS = Math.max(...segments.map((item) => item.end));
  const waits = segments.filter((item) => item.kind === "wait");
  return {
    plateId,
    workflowId: segments[0]?.workflowId ?? "",
    startS,
    endS,
    cycleS: endS - startS,
    waitS: waits.reduce((sum, item) => sum + item.end - item.start, 0),
    failures: segments.filter((item) => item.failed === true).length,
  };
};

/** One row per plate, in finishing order. */
export const plateRecords = (run: SimResult): PlateRecord[] => {
  const byPlate = new Map<number, Segment[]>();
  for (const segment of run.segments) {
    if (segment.plateId < 0) continue;
    const list = byPlate.get(segment.plateId);
    if (list === undefined) byPlate.set(segment.plateId, [segment]);
    else list.push(segment);
  }
  return [...byPlate].map(([id, segments]) => summarise(id, segments)).sort((a, b) => a.endS - b.endS);
};

export const completionSteps = (records: readonly PlateRecord[]): StepSeries => ({
  t: [0, ...records.map((item) => item.endS)],
  v: [0, ...records.map((_, index) => index + 1)],
});

/** How many plates are queueing for one resource over time. */
export const queueSteps = (run: SimResult, resourceId: string): StepSeries => {
  const changes = new Map<number, number>();
  for (const { kind, resourceId: id, start, end } of run.segments) {
    if (kind !== "wait" || id !== resourceId) continue;
    changes.set(start, (changes.get(start) ?? 0) + 1);
    changes.set(end, (changes.get(end) ?? 0) - 1);
  }
  const series: StepSeries = { t: [0], v: [0] };
  let depth = 0;
  for (const [time, change] of [...changes].sort((a, b) => a[0] - b[0])) {
    depth += change;
    if (time === 0) series.v[0] = depth;
    else {
      series.t.push(time);
      series.v.push(depth);
    }
  }
  return series;
};

/** Index of the last step at or before t. Binary search, because this runs every frame. */
export const indexAt = ({ t: times }: { t: readonly number[] }, t: number): number => {
  let low = 0;
  let high = times.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((times[middle] as number) <= t) low = middle;
    else high = middle - 1;
  }
  return low;
};

export const valueAt = (series: StepSeries, t: number): number => series.v[indexAt(series, t)] ?? 0;

const countBy = (sortedEnds: readonly number[], t: number): number => {
  if (sortedEnds.length === 0 || (sortedEnds[0] as number) > t) return 0;
  return indexAt({ t: sortedEnds }, t) + 1;
};

const at = (sorted: readonly number[], share: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;

/** Plates finished by each moment, across every Monte Carlo run. */
export const completionBand = (runs: readonly SimResult[], points: number): Band => {
  if (runs.length === 0) return { t: [0], p5: [0], p95: [0] };
  const ends = runs.map((run) => plateRecords(run).map((item) => item.endS));
  const horizon = Math.max(...ends.map((list) => list.at(-1) ?? 0));
  const band: Band = { t: [], p5: [], p95: [] };
  for (let index = 0; index < points; index += 1) {
    const t = (horizon * index) / (points - 1);
    const counts = ends.map((list) => countBy(list, t)).sort((a, b) => a - b);
    band.t.push(t);
    band.p5.push(at(counts, LOW_SHARE));
    band.p95.push(at(counts, HIGH_SHARE));
  }
  return band;
};

const NICE_STEPS = [1, 2, 2.5, 5, 10];

/** Round axis ticks from zero up to at least `max`. */
export const niceTicks = (max: number, count: number, isWhole = false): number[] => {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const nice = NICE_STEPS.find((step) => step * magnitude >= rough) ?? 10;
  const step = isWhole ? Math.max(1, Math.round(nice * magnitude)) : nice * magnitude;
  const steps = Math.ceil(max / step - 1e-9);
  return Array.from({ length: steps + 1 }, (_, index) => Number((index * step).toFixed(6)));
};

const FORMULA_START = /^[=+\-@\t\r]/;

const csvField = (value: string | number): string => {
  if (typeof value === "number") return String(value);
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

/** Text fields can come from a lab's own documents, so a leading formula character is defused. */
export const toCsv = (headers: readonly string[], rows: readonly (readonly (string | number)[])[]): string =>
  [headers, ...rows].map((row) => row.map(csvField).join(",")).join("\n") + "\n";
