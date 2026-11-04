import { z } from "zod";
import { EvidenceDocSchema } from "./evidence";

export const LIVE_LIMITS = {
  maxDocs: 12,
  /** Raw upload size, checked in the browser. */
  maxUploadBytes: 3 * 1024 * 1024,
  /** Encoded request size, checked on the server. Base64 inflates images by a third. */
  maxContentChars: 4_500_000,
};

const IMAGE_MIMES = new Set(["image/png", "image/jpeg"]);

export const LiveRequestSchema = z
  .object({ docs: z.array(EvidenceDocSchema).min(1).max(LIVE_LIMITS.maxDocs) })
  .refine(({ docs }) => docs.reduce((sum, doc) => sum + doc.content.length, 0) <= LIVE_LIMITS.maxContentChars, {
    message: "Evidence is too large.",
  })
  .refine(({ docs }) => new Set(docs.map((doc) => doc.id)).size === docs.length, {
    message: "Evidence ids must be unique.",
  })
  .refine(({ docs }) => docs.every((doc) => doc.kind !== "image" || IMAGE_MIMES.has(doc.mime)), {
    message: "Images must be PNG or JPEG.",
  });
