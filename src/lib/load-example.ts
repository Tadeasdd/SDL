import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { EvidenceDoc } from "@/core/agent/evidence";

const ManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  documents: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      kind: z.enum(["drawing", "table", "scan", "procedure", "log", "note"]),
      file: z.string(),
    }),
  ),
});

const MIME_BY_KIND: Record<string, string> = {
  drawing: "image/svg+xml",
  table: "text/csv",
  log: "text/csv",
  scan: "application/json",
  procedure: "text/markdown",
  note: "text/markdown",
};

/** Reads the bundled evidence pack. Server-side only. */
export const loadExampleDocs = (): EvidenceDoc[] => {
  const root = path.join(process.cwd(), "examples", "aldermoor-bay-4");
  const manifest = ManifestSchema.parse(JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8")));
  return manifest.documents.map(({ id, title, kind, file }) => ({
    id,
    title,
    kind,
    mime: MIME_BY_KIND[kind] ?? "text/plain",
    content: readFileSync(path.join(root, "evidence", file), "utf8"),
  }));
};
