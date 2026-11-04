import { z } from "zod";

export const EvidenceDocSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(160),
  kind: z.enum(["drawing", "table", "scan", "procedure", "log", "note", "image"]),
  mime: z.string().max(80).default("text/plain"),
  content: z.string(),
});

export type EvidenceDoc = z.infer<typeof EvidenceDocSchema>;

const normalise = (text: string): string => text.replace(/\s+/g, " ").trim().toLowerCase();

export const quoteAppearsIn = (doc: EvidenceDoc, quote: string): boolean =>
  normalise(doc.content).includes(normalise(quote));

export type DurationFit = { step: string; samples: number; excluded: number; meanS: number; sdS: number };

const columnIndex = (header: string[], name: string): number => {
  const index = header.indexOf(name);
  if (index < 0) throw new Error(`Run log has no "${name}" column.`);
  return index;
};

/** Fits mean and sample standard deviation for one step, excluding runs that did not finish OK. */
export const fitDurations = (doc: EvidenceDoc, step: string): DurationFit => {
  const [headerLine = "", ...lines] = doc.content.trim().split("\n");
  const header = headerLine.split(",");
  const stepAt = columnIndex(header, "step");
  const durationAt = columnIndex(header, "duration_s");
  const statusAt = columnIndex(header, "status");
  const rows = lines.map((line) => line.split(",")).filter((row) => row[stepAt] === step);
  const values = rows.filter((row) => row[statusAt] === "OK").map((row) => Number(row[durationAt]));
  if (values.length === 0) throw new Error(`No completed "${step}" rows in ${doc.id}.`);

  const meanS = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - meanS) ** 2, 0) / Math.max(1, values.length - 1);
  return {
    step,
    samples: values.length,
    excluded: rows.length - values.length,
    meanS: Number(meanS.toFixed(1)),
    sdS: Number(Math.sqrt(variance).toFixed(1)),
  };
};
