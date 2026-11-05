import { z } from "zod";
import { completionSteps, indexAt, plateRecords } from "./series";
import type { MonteCarloResult } from "./types";

const CURVE_POINTS = 32;

export const SavedRunSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  twinId: z.string().min(1).max(64),
  savedAt: z.string().max(40),
  changes: z.array(z.string().max(120)).max(30),
  scheduleLabel: z.string().max(80),
  throughput: z.object({ mean: z.number(), p5: z.number(), p95: z.number() }),
  makespanS: z.number(),
  meanCycleS: z.number(),
  bottleneckId: z.string().nullable(),
  capex: z.number(),
  paybackYears: z.number().nullable(),
  assayPassShare: z.number().nullable(),
  curve: z.array(z.tuple([z.number(), z.number()])).max(CURVE_POINTS + 1),
});

export type SavedRun = z.infer<typeof SavedRunSchema>;

export const MAX_SAVED = 8;

/** Plates finished over time, thinned so a saved run stays small. */
export const curveOf = (result: MonteCarloResult): [number, number][] => {
  const steps = completionSteps(plateRecords(result.representative));
  const end = steps.t.at(-1) ?? 0;
  return Array.from({ length: CURVE_POINTS + 1 }, (_, index) => {
    const t = (end * index) / CURVE_POINTS;
    return [t, steps.v[indexAt(steps, t)] ?? 0];
  });
};

/** Browser storage can hold anything, so each entry is checked and bad ones are dropped. */
export const parseSaved = (raw: string | null): SavedRun[] => {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const result = SavedRunSchema.safeParse(item);
      return result.success ? [result.data] : [];
    }).slice(0, MAX_SAVED);
  } catch {
    return [];
  }
};
