import { replayEvents, twinFromEvents } from "@/core/agent/replay";
import { EXAMPLE_CONFIG } from "@/core/example-config";
import { monteCarlo } from "@/core/sim/montecarlo";
import { improvementPath, rankInterventions, type Intervention, type PathStep } from "@/core/sim/scenarios";
import type { Finding, LabTwin } from "@/core/twin/schema";
import { loadExampleDocs } from "./load-example";

const RUNS = 16;

export type LandingFigures = {
  twin: LabTwin;
  documents: number;
  toolCalls: number;
  entities: number;
  findings: Finding[];
  baseline: number;
  top: Intervention;
  door: Intervention | null;
  path: PathStep[];
  limiter: string;
};

/** Everything the landing page states is produced here, at build time, by the real engine. */
export const computeLandingFigures = (): LandingFigures => {
  const docs = loadExampleDocs();
  const events = replayEvents(docs);
  const twin = twinFromEvents(events);
  if (twin === null) throw new Error("The example replay did not finish.");

  const baseline = monteCarlo(twin, EXAMPLE_CONFIG, RUNS);
  const ranked = rankInterventions(twin, EXAMPLE_CONFIG, RUNS);
  // The headline is the fix for what the agent flagged, which ties with buying a new reader.
  const top = ranked.find((item) => item.id.startsWith("restore-")) ?? ranked[0];
  if (top === undefined) throw new Error("No interventions to rank.");
  const limiter = Object.entries(baseline.bottleneckShare).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

  return {
    twin,
    documents: docs.length,
    toolCalls: events.filter((event) => event.type === "tool").length,
    entities: twin.zones.length + twin.doors.length + twin.instruments.length + twin.transports.length + twin.workflows.length,
    findings: twin.findings,
    baseline: baseline.throughputPerHour.mean,
    top,
    door: ranked.find((item) => item.id.startsWith("widen-")) ?? null,
    path: improvementPath(twin, EXAMPLE_CONFIG, RUNS, 2),
    limiter,
  };
};
