import type { LabTwin, Step } from "../twin/schema";
import { monteCarlo } from "./montecarlo";

export type LogRow = { timeMs: number; run: string; plate: string; step: string; durationS: number; isOk: boolean };

export type StepCheck = { step: string; trainN: number; testN: number; predictedS: number; observedS: number; errorPct: number; coverage: number };

export type CycleCheck = { workflowId: string; predictedS: number; observedS: number; errorPct: number; plates: number };

export type ValidationReport = {
  steps: StepCheck[];
  cycles: CycleCheck[];
  trainRuns: number;
  testRuns: number;
  /** Mean absolute percentage error across held-out steps. */
  meanErrorPct: number;
  /** Share of held-out durations inside the predicted 90% interval. Close to 0.9 means honest spread. */
  coverage: number;
};

const TRAIN_SHARE = 2 / 3;
const Z_90 = 1.645;
const VALIDATION_RUNS = 24;

export const parseRunLog = (content: string): LogRow[] => {
  const [headerLine = "", ...lines] = content.trim().split("\n");
  const header = headerLine.split(",");
  const at = (name: string): number => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`Run log has no "${name}" column.`);
    return index;
  };
  const [time, run, plate, step, duration, status] = ["timestamp", "run", "plate", "step", "duration_s", "status"].map(at) as [number, number, number, number, number, number];
  return lines.map((line) => {
    const fields = line.split(",");
    return {
      timeMs: Date.parse(fields[time] ?? ""),
      run: fields[run] ?? "",
      plate: fields[plate] ?? "",
      step: fields[step] ?? "",
      durationS: Number(fields[duration]),
      isOk: fields[status] === "OK",
    };
  });
};

/** Earlier runs train and later runs test, per run family, so the test set is genuinely unseen and in time order. */
export const splitRuns = (rows: readonly LogRow[]): { train: LogRow[]; test: LogRow[] } => {
  const families = new Map<string, string[]>();
  for (const { run } of rows) {
    const family = run.split("-")[0] ?? run;
    const runs = families.get(family) ?? [];
    if (!runs.includes(run)) families.set(family, [...runs, run]);
  }
  const trainRuns = new Set([...families.values()].flatMap((runs) => [...runs].sort().slice(0, Math.max(1, Math.floor(runs.length * TRAIN_SHARE)))));
  return { train: rows.filter((row) => trainRuns.has(row.run)), test: rows.filter((row) => !trainRuns.has(row.run)) };
};

const fit = (values: readonly number[]): { mean: number; sd: number } => {
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return { mean, sd: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1)) };
};

const durations = (rows: readonly LogRow[], step: string): number[] => rows.filter((row) => row.isOk && row.step === step).map((row) => row.durationS);

const errorPct = (predicted: number, observed: number): number => ((predicted - observed) / Math.max(observed, Number.EPSILON)) * 100;

const checkStep = (step: string, train: readonly LogRow[], test: readonly LogRow[]): StepCheck | null => {
  const seen = durations(train, step);
  const unseen = durations(test, step);
  if (seen.length === 0 || unseen.length === 0) return null;
  const { mean, sd } = fit(seen);
  const observed = fit(unseen).mean;
  const inside = unseen.filter((value) => Math.abs(value - mean) <= Z_90 * sd).length;
  return { step, trainN: seen.length, testN: unseen.length, predictedS: mean, observedS: observed, errorPct: errorPct(mean, observed), coverage: inside / unseen.length };
};

const plateCycles = (rows: readonly LogRow[], lastStep: string): number[] => {
  const plates = new Map<string, LogRow[]>();
  for (const row of rows) plates.set(row.plate, [...(plates.get(row.plate) ?? []), row]);
  return [...plates.values()].flatMap((list) => {
    const last = list.at(-1) as LogRow;
    if (last.step !== lastStep || list.some((row) => !row.isOk)) return [];
    return [(last.timeMs - (list[0] as LogRow).timeMs) / 1000 + last.durationS];
  });
};

const logNameOf = (step: Step, names: ReadonlySet<string>): string | undefined => [step.id, step.name, step.name.toLowerCase().replaceAll(" ", "-")].find((name) => names.has(name));

/** Re-times a workflow from the training runs only, then simulates one plate alone, as the log's plates ran. */
const checkCycle = (twin: LabTwin, workflowId: string, train: readonly LogRow[], test: readonly LogRow[]): CycleCheck | null => {
  const workflow = twin.workflows.find(({ id }) => id === workflowId);
  if (workflow === undefined) return null;
  const names = new Set(train.map((row) => row.step));
  const steps = workflow.steps.map((step) => {
    const name = logNameOf(step, names);
    if (name === undefined) return step;
    const { mean, sd } = fit(durations(train, name));
    return { ...step, duration: { ...step.duration, meanS: mean, sdS: sd } };
  });
  const lastName = logNameOf(workflow.steps.at(-1) as Step, names);
  if (lastName === undefined) return null;
  const observed = plateCycles(test, lastName);
  if (observed.length === 0) return null;
  const retimed = { ...twin, workflows: twin.workflows.map((item) => (item.id === workflowId ? { ...item, steps } : item)) };
  const result = monteCarlo(retimed, { demands: [{ workflowId, plates: 1, intervalS: 1 }], seed: 1, maxWip: 1, failures: false }, VALIDATION_RUNS);
  const observedS = fit(observed).mean;
  return { workflowId, predictedS: result.meanCycleS.mean, observedS, errorPct: errorPct(result.meanCycleS.mean, observedS), plates: observed.length };
};

export const validateAgainstLog = (twin: LabTwin, content: string): ValidationReport => {
  const rows = parseRunLog(content);
  const { train, test } = splitRuns(rows);
  const names = [...new Set(rows.map((row) => row.step))];
  const steps = names.flatMap((step) => checkStep(step, train, test) ?? []);
  const cycles = twin.workflows.flatMap(({ id }) => checkCycle(twin, id, train, test) ?? []);
  const average = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return {
    steps,
    cycles,
    trainRuns: new Set(train.map((row) => row.run)).size,
    testRuns: new Set(test.map((row) => row.run)).size,
    meanErrorPct: average(steps.map((item) => Math.abs(item.errorPct))),
    coverage: average(steps.map((item) => item.coverage)),
  };
};
