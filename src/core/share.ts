import { z } from "zod";
import type { SimConfig } from "./sim/types";

const ConfigSchema = z.object({
  demands: z.array(z.object({ workflowId: z.string().max(64), plates: z.number().int().min(0).max(500), intervalS: z.number().positive() })).max(20),
  seed: z.number().int(),
  maxWip: z.number().int().min(1).max(500),
  failures: z.boolean(),
  schedule: z.object({
    attendedHours: z.number().min(1).max(24).nullable(),
    stopsUnattended: z.boolean(),
    dispatch: z.enum(["fifo", "shortest-step", "oldest-plate"]),
    maintenance: z.array(z.object({ resourceId: z.string().max(64), startS: z.number().min(0), durationS: z.number().positive() })).max(10),
  }).optional(),
});

const ShareSchema = z.object({ config: ConfigSchema, scenarioIds: z.array(z.string().max(80)).max(30) });

export type SharedState = { config: SimConfig; scenarioIds: string[] };

const toBase64Url = (text: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

const fromBase64Url = (text: string): string =>
  new TextDecoder().decode(Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0)));

/** Seeds are in the config, so the link reproduces the same run rather than carrying its results. */
export const encodeShare = (state: SharedState): string => toBase64Url(JSON.stringify(state));

/** A link is untrusted input. Anything malformed gives null, and the console opens normally. */
export const decodeShare = (text: string): SharedState | null => {
  try {
    const result = ShareSchema.safeParse(JSON.parse(fromBase64Url(text)));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};
